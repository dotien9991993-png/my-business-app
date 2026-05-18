-- =====================================================================
-- BATCH 2: Atomic RPCs cho 6 luồng còn loop-fail
-- Ngày: 2026-05
-- Mục đích: Loại bỏ race condition khi loop từng item ở client.
--           Mỗi luồng giờ chạy nguyên trong 1 PostgreSQL transaction.
-- =====================================================================
-- Yêu cầu: đã chạy batch 1 (RPC sinh số) trước.

-- =====================================================================
-- 1. RPC: transfer_stock_multi — chuyển kho nhiều SP atomic
-- =====================================================================
CREATE OR REPLACE FUNCTION transfer_stock_multi(
  p_tenant UUID,
  p_from_warehouse UUID,
  p_to_warehouse UUID,
  p_items JSONB,         -- [{product_id, quantity, variant_id?}]
  p_user TEXT,
  p_note TEXT DEFAULT ''
) RETURNS UUID AS $$
DECLARE
  item JSONB;
  v_product_id UUID;
  v_qty NUMERIC;
  v_variant_id UUID;
  v_available NUMERIC;
  v_transfer_id UUID;
  v_transfer_code TEXT;
BEGIN
  IF p_from_warehouse = p_to_warehouse THEN
    RAISE EXCEPTION 'Kho xuất và kho nhận không được trùng';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Danh sách SP rỗng';
  END IF;

  -- Sinh mã phiếu chuyển kho
  v_transfer_code := gen_transfer_code(p_tenant);

  -- Tạo phiếu transfer
  INSERT INTO warehouse_transfers (
    tenant_id, transfer_code, from_warehouse_id, to_warehouse_id,
    status, note, created_by, created_at
  ) VALUES (
    p_tenant, v_transfer_code, p_from_warehouse, p_to_warehouse,
    'completed', p_note, p_user, NOW()
  ) RETURNING id INTO v_transfer_id;

  -- Loop từng item TRONG TRANSACTION
  FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (item->>'product_id')::UUID;
    v_qty := (item->>'quantity')::NUMERIC;
    v_variant_id := NULLIF(item->>'variant_id', '')::UUID;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Số lượng phải > 0 (SP: %)', v_product_id;
    END IF;

    -- Check stock đủ — LOCK ROW để chống race
    SELECT quantity INTO v_available
    FROM warehouse_stock
    WHERE warehouse_id = p_from_warehouse
      AND product_id = v_product_id
      AND (variant_id IS NOT DISTINCT FROM v_variant_id)
    FOR UPDATE;

    IF v_available IS NULL OR v_available < v_qty THEN
      RAISE EXCEPTION 'Kho xuất không đủ hàng cho SP %. Tồn: %, cần: %',
        v_product_id, COALESCE(v_available, 0), v_qty;
    END IF;

    -- Trừ kho xuất
    UPDATE warehouse_stock
    SET quantity = quantity - v_qty,
        updated_at = NOW()
    WHERE warehouse_id = p_from_warehouse
      AND product_id = v_product_id
      AND (variant_id IS NOT DISTINCT FROM v_variant_id);

    -- Cộng kho nhận (insert nếu chưa có)
    INSERT INTO warehouse_stock (tenant_id, warehouse_id, product_id, variant_id, quantity, updated_at)
    VALUES (p_tenant, p_to_warehouse, v_product_id, v_variant_id, v_qty, NOW())
    ON CONFLICT (warehouse_id, product_id, variant_id)
    DO UPDATE SET
      quantity = warehouse_stock.quantity + v_qty,
      updated_at = NOW();

    -- Insert chi tiết transfer
    INSERT INTO warehouse_transfer_items (
      transfer_id, product_id, variant_id, quantity
    ) VALUES (
      v_transfer_id, v_product_id, v_variant_id, v_qty
    );
  END LOOP;

  RETURN v_transfer_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 2. RPC: approve_import_atomic — duyệt phiếu nhập + cộng kho atomic
-- =====================================================================
CREATE OR REPLACE FUNCTION approve_import_atomic(
  p_transaction_id UUID,
  p_user TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_tenant_id UUID;
  v_warehouse_id UUID;
  v_status TEXT;
  v_items JSONB;
  item JSONB;
  v_product_id UUID;
  v_qty NUMERIC;
  v_variant_id UUID;
  v_unit_cost NUMERIC;
BEGIN
  -- Lock phiếu nhập + lấy info
  SELECT tenant_id, warehouse_id, approval_status, items
  INTO v_tenant_id, v_warehouse_id, v_status, v_items
  FROM stock_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Phiếu nhập không tồn tại';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Phiếu đã được xử lý (trạng thái: %)', v_status;
  END IF;

  -- Loop từng item — cộng kho
  FOR item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_product_id := (item->>'product_id')::UUID;
    v_qty := (item->>'quantity')::NUMERIC;
    v_variant_id := NULLIF(item->>'variant_id', '')::UUID;
    v_unit_cost := COALESCE((item->>'unit_cost')::NUMERIC, 0);

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Số lượng phải > 0 (SP %)', v_product_id;
    END IF;

    INSERT INTO warehouse_stock (tenant_id, warehouse_id, product_id, variant_id, quantity, updated_at)
    VALUES (v_tenant_id, v_warehouse_id, v_product_id, v_variant_id, v_qty, NOW())
    ON CONFLICT (warehouse_id, product_id, variant_id)
    DO UPDATE SET
      quantity = warehouse_stock.quantity + v_qty,
      updated_at = NOW();

    -- Cập nhật WAC nếu có unit_cost > 0
    IF v_unit_cost > 0 THEN
      UPDATE products
      SET avg_cost = CASE
        WHEN COALESCE(stock_quantity, 0) <= 0 THEN v_unit_cost
        ELSE ((COALESCE(avg_cost, 0) * stock_quantity) + (v_unit_cost * v_qty))
             / (stock_quantity + v_qty)
      END,
      stock_quantity = COALESCE(stock_quantity, 0) + v_qty,
      updated_at = NOW()
      WHERE id = v_product_id;
    ELSE
      UPDATE products
      SET stock_quantity = COALESCE(stock_quantity, 0) + v_qty,
          updated_at = NOW()
      WHERE id = v_product_id;
    END IF;
  END LOOP;

  -- Update phiếu nhập
  UPDATE stock_transactions
  SET approval_status = 'approved',
      approved_by = p_user,
      approved_at = NOW()
  WHERE id = p_transaction_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 3. RPC: approve_export_atomic — duyệt phiếu xuất + trừ kho atomic
-- =====================================================================
CREATE OR REPLACE FUNCTION approve_export_atomic(
  p_transaction_id UUID,
  p_user TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_warehouse_id UUID;
  v_status TEXT;
  v_items JSONB;
  item JSONB;
  v_product_id UUID;
  v_qty NUMERIC;
  v_variant_id UUID;
  v_available NUMERIC;
BEGIN
  SELECT warehouse_id, approval_status, items
  INTO v_warehouse_id, v_status, v_items
  FROM stock_transactions
  WHERE id = p_transaction_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Phiếu xuất không tồn tại';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Phiếu đã được xử lý (trạng thái: %)', v_status;
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_product_id := (item->>'product_id')::UUID;
    v_qty := (item->>'quantity')::NUMERIC;
    v_variant_id := NULLIF(item->>'variant_id', '')::UUID;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Số lượng phải > 0';
    END IF;

    -- Lock + check stock
    SELECT quantity INTO v_available
    FROM warehouse_stock
    WHERE warehouse_id = v_warehouse_id
      AND product_id = v_product_id
      AND (variant_id IS NOT DISTINCT FROM v_variant_id)
    FOR UPDATE;

    IF v_available IS NULL OR v_available < v_qty THEN
      RAISE EXCEPTION 'Kho không đủ hàng (SP %, tồn %, cần %)',
        v_product_id, COALESCE(v_available, 0), v_qty;
    END IF;

    -- Trừ kho
    UPDATE warehouse_stock
    SET quantity = quantity - v_qty,
        updated_at = NOW()
    WHERE warehouse_id = v_warehouse_id
      AND product_id = v_product_id
      AND (variant_id IS NOT DISTINCT FROM v_variant_id);

    -- Trừ stock_quantity tổng
    UPDATE products
    SET stock_quantity = GREATEST(COALESCE(stock_quantity, 0) - v_qty, 0),
        updated_at = NOW()
    WHERE id = v_product_id;
  END LOOP;

  UPDATE stock_transactions
  SET approval_status = 'approved',
      approved_by = p_user,
      approved_at = NOW()
  WHERE id = p_transaction_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 4. RPC: confirm_supplier_return_atomic
--     — Trừ kho, hoàn lại tiền NCC (tạo supplier_payment âm = giảm công nợ)
-- =====================================================================
CREATE OR REPLACE FUNCTION confirm_supplier_return_atomic(
  p_return_id UUID,
  p_user TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_tenant_id UUID;
  v_supplier_id UUID;
  v_status TEXT;
  v_warehouse_id UUID;
  v_total NUMERIC;
  item RECORD;
  v_available NUMERIC;
BEGIN
  SELECT tenant_id, supplier_id, status, warehouse_id, total_amount
  INTO v_tenant_id, v_supplier_id, v_status, v_warehouse_id, v_total
  FROM supplier_returns
  WHERE id = p_return_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Phiếu trả NCC không tồn tại';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Phiếu đã xử lý (trạng thái: %)', v_status;
  END IF;

  -- Loop từng item: trừ kho
  FOR item IN
    SELECT product_id, variant_id, quantity, unit_price
    FROM supplier_return_items
    WHERE return_id = p_return_id
  LOOP
    IF item.quantity <= 0 THEN
      RAISE EXCEPTION 'Số lượng phải > 0';
    END IF;

    SELECT quantity INTO v_available
    FROM warehouse_stock
    WHERE warehouse_id = v_warehouse_id
      AND product_id = item.product_id
      AND (variant_id IS NOT DISTINCT FROM item.variant_id)
    FOR UPDATE;

    IF v_available IS NULL OR v_available < item.quantity THEN
      RAISE EXCEPTION 'Kho không đủ hàng để trả (SP %, tồn %, cần %)',
        item.product_id, COALESCE(v_available, 0), item.quantity;
    END IF;

    UPDATE warehouse_stock
    SET quantity = quantity - item.quantity, updated_at = NOW()
    WHERE warehouse_id = v_warehouse_id
      AND product_id = item.product_id
      AND (variant_id IS NOT DISTINCT FROM item.variant_id);

    UPDATE products
    SET stock_quantity = GREATEST(COALESCE(stock_quantity, 0) - item.quantity, 0)
    WHERE id = item.product_id;
  END LOOP;

  -- Tạo bút toán giảm công nợ NCC (amount âm = NCC trả lại tiền hoặc xóa nợ)
  INSERT INTO supplier_payments (
    tenant_id, supplier_id, amount, payment_method,
    note, supplier_return_id, created_by, created_at
  ) VALUES (
    v_tenant_id, v_supplier_id, -v_total, 'credit_note',
    'Trả hàng NCC theo phiếu ' || p_return_id::TEXT, p_return_id, p_user, NOW()
  );

  -- Đóng phiếu
  UPDATE supplier_returns
  SET status = 'confirmed',
      confirmed_by = p_user,
      confirmed_at = NOW()
  WHERE id = p_return_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 5. RPC: merge_orders_atomic — gộp nhiều đơn vào 1
-- =====================================================================
CREATE OR REPLACE FUNCTION merge_orders_atomic(
  p_tenant UUID,
  p_old_order_ids UUID[],
  p_new_order JSONB,
  p_new_items JSONB,
  p_warehouse_id UUID,
  p_user TEXT
) RETURNS UUID AS $$
DECLARE
  v_new_id UUID;
  v_new_number TEXT;
  v_old_id UUID;
  item JSONB;
  v_product_id UUID;
  v_qty NUMERIC;
  v_available NUMERIC;
BEGIN
  -- Sinh số đơn mới
  v_new_number := gen_order_number(p_tenant);

  -- Tạo đơn mới
  INSERT INTO orders (
    tenant_id, order_number, customer_id, customer_name, customer_phone,
    shipping_address, total_amount, payment_method, payment_status,
    order_type, status, created_by, created_at, note,
    paid_amount, discount_amount, subtotal
  )
  SELECT
    p_tenant, v_new_number,
    (p_new_order->>'customer_id')::UUID,
    p_new_order->>'customer_name',
    p_new_order->>'customer_phone',
    p_new_order->>'shipping_address',
    (p_new_order->>'total_amount')::NUMERIC,
    p_new_order->>'payment_method',
    p_new_order->>'payment_status',
    p_new_order->>'order_type',
    COALESCE(p_new_order->>'status', 'confirmed'),
    p_user, NOW(),
    p_new_order->>'note',
    COALESCE((p_new_order->>'paid_amount')::NUMERIC, 0),
    COALESCE((p_new_order->>'discount_amount')::NUMERIC, 0),
    COALESCE((p_new_order->>'subtotal')::NUMERIC, 0)
  RETURNING id INTO v_new_id;

  -- Restore stock từ các đơn cũ
  FOREACH v_old_id IN ARRAY p_old_order_ids LOOP
    -- Cộng lại stock từ items đơn cũ
    UPDATE warehouse_stock ws
    SET quantity = ws.quantity + oi.quantity
    FROM order_items oi
    WHERE oi.order_id = v_old_id
      AND ws.product_id = oi.product_id
      AND ws.warehouse_id = p_warehouse_id;

    -- Đánh dấu đơn cũ là merged
    UPDATE orders
    SET status = 'merged',
        cancelled_at = NOW(),
        note = COALESCE(note, '') || ' | Đã gộp vào ' || v_new_number
    WHERE id = v_old_id;
  END LOOP;

  -- Insert items mới + trừ stock
  FOR item IN SELECT * FROM jsonb_array_elements(p_new_items) LOOP
    v_product_id := (item->>'product_id')::UUID;
    v_qty := (item->>'quantity')::NUMERIC;

    SELECT quantity INTO v_available
    FROM warehouse_stock
    WHERE warehouse_id = p_warehouse_id
      AND product_id = v_product_id
    FOR UPDATE;

    IF v_available IS NULL OR v_available < v_qty THEN
      RAISE EXCEPTION 'Kho không đủ SP %', v_product_id;
    END IF;

    INSERT INTO order_items (
      order_id, product_id, product_name, product_sku,
      quantity, unit_price, total_price
    ) VALUES (
      v_new_id, v_product_id,
      item->>'product_name', item->>'product_sku',
      v_qty,
      (item->>'unit_price')::NUMERIC,
      (item->>'total_price')::NUMERIC
    );

    UPDATE warehouse_stock
    SET quantity = quantity - v_qty
    WHERE warehouse_id = p_warehouse_id AND product_id = v_product_id;
  END LOOP;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 6. Verify
-- =====================================================================
SELECT
  proname AS rpc_name,
  '✅ created' AS status
FROM pg_proc
WHERE proname IN (
  'transfer_stock_multi',
  'approve_import_atomic',
  'approve_export_atomic',
  'confirm_supplier_return_atomic',
  'merge_orders_atomic'
)
ORDER BY proname;
