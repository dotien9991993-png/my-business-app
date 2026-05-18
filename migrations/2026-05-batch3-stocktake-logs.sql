-- =====================================================================
-- BATCH 3: Stocktake fix + order_status_logs trigger + COD cash book + Audit trail
-- Ngày: 2026-05
-- =====================================================================

-- =====================================================================
-- 1. RPC: complete_stocktake_atomic
--    — Set stock TUYỆT ĐỐI thay vì delta (chống vấn đề sale-giữa-stocktake)
-- =====================================================================
CREATE OR REPLACE FUNCTION complete_stocktake_atomic(
  p_stocktake_id UUID,
  p_user TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_tenant_id UUID;
  v_warehouse_id UUID;
  v_status TEXT;
  item RECORD;
BEGIN
  SELECT tenant_id, warehouse_id, status
  INTO v_tenant_id, v_warehouse_id, v_status
  FROM stocktakes
  WHERE id = p_stocktake_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Phiếu kiểm kê không tồn tại';
  END IF;
  IF v_status <> 'in_progress' THEN
    RAISE EXCEPTION 'Phiếu đã hoàn thành (trạng thái: %)', v_status;
  END IF;

  -- Loop từng item: SET = actual_qty (override tuyệt đối)
  FOR item IN
    SELECT product_id, variant_id, actual_qty
    FROM stocktake_items
    WHERE stocktake_id = p_stocktake_id
      AND actual_qty IS NOT NULL
  LOOP
    -- LOCK + override
    UPDATE warehouse_stock
    SET quantity = item.actual_qty,
        updated_at = NOW()
    WHERE warehouse_id = v_warehouse_id
      AND product_id = item.product_id
      AND (variant_id IS NOT DISTINCT FROM item.variant_id);

    -- Nếu chưa có row → INSERT mới với qty = actual
    IF NOT FOUND THEN
      INSERT INTO warehouse_stock (
        tenant_id, warehouse_id, product_id, variant_id, quantity, updated_at
      ) VALUES (
        v_tenant_id, v_warehouse_id, item.product_id, item.variant_id, item.actual_qty, NOW()
      );
    END IF;

    -- Cập nhật stock_quantity tổng products = SUM(warehouse_stock của SP đó qua các kho)
    UPDATE products p
    SET stock_quantity = (
      SELECT COALESCE(SUM(quantity), 0)
      FROM warehouse_stock ws
      WHERE ws.product_id = p.id
    )
    WHERE p.id = item.product_id;
  END LOOP;

  -- Đóng phiếu
  UPDATE stocktakes
  SET status = 'completed',
      completed_by = p_user,
      completed_at = NOW()
  WHERE id = p_stocktake_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 2. Bảng stocktake_locks — chống bán SP đang kiểm
-- =====================================================================
CREATE TABLE IF NOT EXISTS stocktake_locks (
  warehouse_id UUID NOT NULL,
  product_id UUID NOT NULL,
  stocktake_id UUID NOT NULL,
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (warehouse_id, product_id)
);

-- Auto-add lock khi tạo stocktake
CREATE OR REPLACE FUNCTION lock_stocktake_products() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO stocktake_locks (warehouse_id, product_id, stocktake_id)
  SELECT
    (SELECT warehouse_id FROM stocktakes WHERE id = NEW.stocktake_id),
    NEW.product_id,
    NEW.stocktake_id
  ON CONFLICT (warehouse_id, product_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stocktake_item_lock ON stocktake_items;
CREATE TRIGGER stocktake_item_lock
  AFTER INSERT ON stocktake_items
  FOR EACH ROW EXECUTE FUNCTION lock_stocktake_products();

-- Auto-release lock khi complete/cancel stocktake
CREATE OR REPLACE FUNCTION unlock_stocktake_products() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('completed', 'cancelled') AND OLD.status = 'in_progress' THEN
    DELETE FROM stocktake_locks WHERE stocktake_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stocktake_status_unlock ON stocktakes;
CREATE TRIGGER stocktake_status_unlock
  AFTER UPDATE OF status ON stocktakes
  FOR EACH ROW EXECUTE FUNCTION unlock_stocktake_products();

-- =====================================================================
-- 3. Trigger ghi order_status_logs khi đơn đổi status
-- =====================================================================
CREATE OR REPLACE FUNCTION log_order_status_change() RETURNS TRIGGER AS $$
BEGIN
  -- Chỉ log nếu có thay đổi status/payment_status/shipping_status
  IF (TG_OP = 'UPDATE') AND (
    NEW.status IS DISTINCT FROM OLD.status OR
    NEW.payment_status IS DISTINCT FROM OLD.payment_status OR
    NEW.order_status IS DISTINCT FROM OLD.order_status OR
    NEW.shipping_status IS DISTINCT FROM OLD.shipping_status
  ) THEN
    INSERT INTO order_status_logs (
      order_id, tenant_id,
      old_status, new_status,
      old_payment_status, new_payment_status,
      old_shipping_status, new_shipping_status,
      changed_by, changed_at, note
    ) VALUES (
      NEW.id, NEW.tenant_id,
      OLD.status, NEW.status,
      OLD.payment_status, NEW.payment_status,
      OLD.shipping_status, NEW.shipping_status,
      COALESCE(NEW.updated_by, NEW.created_by),
      NOW(),
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS order_status_log_trigger ON orders;
CREATE TRIGGER order_status_log_trigger
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION log_order_status_change();

-- Đảm bảo bảng có cột cần thiết
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='orders' AND column_name='updated_by') THEN
    ALTER TABLE orders ADD COLUMN updated_by TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='order_status_logs' AND column_name='old_shipping_status') THEN
    ALTER TABLE order_status_logs ADD COLUMN old_shipping_status TEXT;
    ALTER TABLE order_status_logs ADD COLUMN new_shipping_status TEXT;
    ALTER TABLE order_status_logs ADD COLUMN old_payment_status TEXT;
    ALTER TABLE order_status_logs ADD COLUMN new_payment_status TEXT;
  END IF;
END $$;

-- =====================================================================
-- 4. RPC: confirm_cod_received_atomic
--    — Khi xác nhận nhận tiền COD: tạo phiếu thu + ghi sổ quỹ + cập nhật đơn
-- =====================================================================
CREATE OR REPLACE FUNCTION confirm_cod_received_atomic(
  p_reconciliation_id UUID,
  p_user TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_tenant_id UUID;
  v_order_id UUID;
  v_amount NUMERIC;
  v_status TEXT;
  v_receipt_id UUID;
  v_receipt_number TEXT;
  v_order_number TEXT;
BEGIN
  SELECT tenant_id, order_id, received_amount, status
  INTO v_tenant_id, v_order_id, v_amount, v_status
  FROM cod_reconciliation
  WHERE id = p_reconciliation_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Phiếu đối soát COD không tồn tại';
  END IF;
  IF v_status = 'confirmed' THEN
    RAISE EXCEPTION 'Phiếu đã được xác nhận';
  END IF;

  SELECT order_number INTO v_order_number FROM orders WHERE id = v_order_id;
  v_receipt_number := gen_receipt_number(v_tenant_id);

  -- 1. Tạo phiếu thu
  INSERT INTO receipts_payments (
    tenant_id, receipt_number, type, amount, payment_method,
    description, related_order_id, receipt_date, created_by
  ) VALUES (
    v_tenant_id, v_receipt_number, 'income', v_amount, 'transfer',
    'COD từ VC cho đơn ' || COALESCE(v_order_number, v_order_id::TEXT),
    v_order_id, NOW()::DATE, p_user
  ) RETURNING id INTO v_receipt_id;

  -- 2. Ghi sổ quỹ (cash_book_entries) nếu bảng tồn tại
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'cash_book_entries') THEN
    INSERT INTO cash_book_entries (
      tenant_id, entry_type, amount, description,
      related_receipt_id, related_order_id, entry_date, created_by
    ) VALUES (
      v_tenant_id, 'in', v_amount,
      'Thu COD đơn ' || COALESCE(v_order_number, v_order_id::TEXT),
      v_receipt_id, v_order_id, NOW()::DATE, p_user
    );
  END IF;

  -- 3. Cập nhật đơn — paid_amount + payment_status
  UPDATE orders
  SET paid_amount = COALESCE(paid_amount, 0) + v_amount,
      payment_status = CASE
        WHEN COALESCE(paid_amount, 0) + v_amount >= total_amount THEN 'paid'
        ELSE 'partial'
      END,
      updated_by = p_user,
      updated_at = NOW()
  WHERE id = v_order_id;

  -- 4. Đóng phiếu COD
  UPDATE cod_reconciliation
  SET status = 'confirmed',
      receipt_id = v_receipt_id,
      confirmed_by = p_user,
      confirmed_at = NOW()
  WHERE id = p_reconciliation_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 5. RPC: bulk_update_order_status — đổi status nhiều đơn cùng lúc
-- =====================================================================
CREATE OR REPLACE FUNCTION bulk_update_order_status(
  p_tenant UUID,
  p_order_ids UUID[],
  p_new_status TEXT,
  p_user TEXT
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Validate status
  IF p_new_status NOT IN ('new', 'confirmed', 'packing', 'shipping', 'delivered', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Trạng thái không hợp lệ: %', p_new_status;
  END IF;

  UPDATE orders
  SET status = p_new_status,
      updated_by = p_user,
      updated_at = NOW(),
      -- Auto-fill timestamps theo status
      confirmed_at = CASE WHEN p_new_status = 'confirmed' AND confirmed_at IS NULL THEN NOW() ELSE confirmed_at END,
      shipped_at = CASE WHEN p_new_status = 'shipping' AND shipped_at IS NULL THEN NOW() ELSE shipped_at END,
      delivered_at = CASE WHEN p_new_status = 'delivered' AND delivered_at IS NULL THEN NOW() ELSE delivered_at END,
      completed_at = CASE WHEN p_new_status = 'completed' AND completed_at IS NULL THEN NOW() ELSE completed_at END,
      cancelled_at = CASE WHEN p_new_status = 'cancelled' AND cancelled_at IS NULL THEN NOW() ELSE cancelled_at END
  WHERE tenant_id = p_tenant
    AND id = ANY(p_order_ids)
    AND status <> p_new_status;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Đảm bảo orders có các cột timestamps
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='orders' AND column_name='confirmed_at') THEN
    ALTER TABLE orders ADD COLUMN confirmed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='orders' AND column_name='shipped_at') THEN
    ALTER TABLE orders ADD COLUMN shipped_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='orders' AND column_name='delivered_at') THEN
    ALTER TABLE orders ADD COLUMN delivered_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='orders' AND column_name='completed_at') THEN
    ALTER TABLE orders ADD COLUMN completed_at TIMESTAMPTZ;
  END IF;
END $$;

-- =====================================================================
-- 6. Cột created_by_id (UUID) cho orders — dùng cho audit thật, không phụ thuộc tên
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_name='orders' AND column_name='created_by_id') THEN
    ALTER TABLE orders ADD COLUMN created_by_id UUID REFERENCES users(id);
    CREATE INDEX IF NOT EXISTS idx_orders_created_by_id ON orders(created_by_id);
  END IF;
END $$;

-- =====================================================================
-- 7. Verify
-- =====================================================================
SELECT proname AS rpc, '✅' AS status
FROM pg_proc
WHERE proname IN (
  'complete_stocktake_atomic',
  'confirm_cod_received_atomic',
  'bulk_update_order_status',
  'lock_stocktake_products',
  'log_order_status_change'
)
ORDER BY proname;
