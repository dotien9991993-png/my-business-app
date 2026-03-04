-- ============================================================
-- Sale đợt 2 - Feature 4: Stock deduction/restore tracking
-- ============================================================

-- Track whether stock has been deducted/restored for each order
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_deducted BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_restored BOOLEAN DEFAULT false;

-- Feature 5: Snapshot cost price in order_items for accurate profit reports
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0;

-- Update create_order_atomic to set stock_deducted = true after stock adjustment
CREATE OR REPLACE FUNCTION create_order_atomic(
  p_order JSONB,
  p_items JSONB,
  p_warehouse_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_order_id UUID;
  v_item JSONB;
  v_child RECORD;
  v_cost NUMERIC;
BEGIN
  -- Insert order
  INSERT INTO orders (
    tenant_id, order_number, order_type, status, order_status, shipping_status,
    customer_id, customer_name, customer_phone, shipping_address,
    shipping_provider, shipping_fee, shipping_payer, shipping_metadata,
    discount_amount, discount_note, coupon_id, coupon_code,
    points_used, points_discount, subtotal, total_amount,
    payment_method, payment_status, paid_amount, payment_splits,
    note, needs_installation, created_by, warehouse_id,
    order_source, internal_note, total_weight, shipping_service,
    stock_deducted
  ) VALUES (
    (p_order->>'tenant_id')::uuid,
    p_order->>'order_number',
    COALESCE(p_order->>'order_type', 'online'),
    'confirmed', 'confirmed', 'pending',
    (p_order->>'customer_id')::uuid,
    p_order->>'customer_name', p_order->>'customer_phone',
    p_order->>'shipping_address', p_order->>'shipping_provider',
    COALESCE((p_order->>'shipping_fee')::numeric, 0),
    COALESCE(p_order->>'shipping_payer', 'customer'),
    CASE WHEN p_order->'shipping_metadata' IS NOT NULL
      THEN p_order->'shipping_metadata' ELSE '{}'::jsonb END,
    COALESCE((p_order->>'discount_amount')::numeric, 0),
    COALESCE(p_order->>'discount_note', ''),
    (p_order->>'coupon_id')::uuid, p_order->>'coupon_code',
    COALESCE((p_order->>'points_used')::integer, 0),
    COALESCE((p_order->>'points_discount')::numeric, 0),
    COALESCE((p_order->>'subtotal')::numeric, 0),
    COALESCE((p_order->>'total_amount')::numeric, 0),
    COALESCE(p_order->>'payment_method', 'cod'),
    'unpaid', 0, '[]'::jsonb,
    COALESCE(p_order->>'note', ''), false,
    p_order->>'created_by', p_warehouse_id,
    COALESCE(p_order->>'order_source', 'manual'),
    p_order->>'internal_note',
    COALESCE((p_order->>'total_weight')::integer, 0),
    p_order->>'shipping_service',
    true  -- stock_deducted = true
  ) RETURNING id INTO v_order_id;

  -- Insert items + adjust stock (all in one transaction)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Lookup cost price (avg_cost or import_price)
    SELECT COALESCE(NULLIF(avg_cost, 0), import_price, 0) INTO v_cost
    FROM products WHERE id = (v_item->>'product_id')::uuid;

    INSERT INTO order_items (
      order_id, product_id, product_name, product_sku,
      quantity, unit_price, discount, total_price,
      warranty_months, variant_id, variant_name, cost_price
    ) VALUES (
      v_order_id,
      (v_item->>'product_id')::uuid,
      v_item->>'product_name', v_item->>'product_sku',
      (v_item->>'quantity')::integer,
      (v_item->>'unit_price')::numeric,
      COALESCE((v_item->>'discount')::numeric, 0),
      (v_item->>'total_price')::numeric,
      (v_item->>'warranty_months')::integer,
      (v_item->>'variant_id')::uuid,
      v_item->>'variant_name',
      COALESCE(v_cost, 0)
    );

    -- Adjust stock: combo → trừ từng SP con, thường → trừ trực tiếp
    IF COALESCE((v_item->>'is_combo')::boolean, false) = true THEN
      FOR v_child IN
        SELECT child_product_id, quantity
        FROM product_combo_items
        WHERE combo_product_id = (v_item->>'product_id')::uuid
      LOOP
        PERFORM adjust_warehouse_stock(
          p_warehouse_id, v_child.child_product_id,
          -(v_child.quantity * (v_item->>'quantity')::integer)
        );
      END LOOP;
    ELSE
      PERFORM adjust_warehouse_stock(
        p_warehouse_id,
        (v_item->>'product_id')::uuid,
        -(v_item->>'quantity')::integer
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('order_id', v_order_id, 'success', true);
EXCEPTION WHEN OTHERS THEN
  RAISE;  -- Re-raise to rollback entire transaction
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_order_atomic(JSONB, JSONB, UUID) TO anon, authenticated;

-- Feature 2: Atomic coupon usage with row-level lock
CREATE OR REPLACE FUNCTION use_coupon_atomic(
  p_coupon_id UUID,
  p_tenant_id UUID,
  p_order_id UUID,
  p_customer_phone TEXT,
  p_discount_amount NUMERIC
) RETURNS JSONB AS $$
DECLARE
  v_coupon RECORD;
  v_customer_usage INTEGER;
BEGIN
  -- Lock row to prevent race condition
  SELECT * INTO v_coupon
  FROM coupons
  WHERE id = p_coupon_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mã giảm giá không tồn tại');
  END IF;

  IF NOT v_coupon.is_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mã giảm giá đã tắt');
  END IF;

  IF v_coupon.usage_limit IS NOT NULL AND v_coupon.usage_limit > 0 AND v_coupon.usage_count >= v_coupon.usage_limit THEN
    RETURN jsonb_build_object('success', false, 'error', 'Mã giảm giá đã hết lượt sử dụng');
  END IF;

  -- Check per customer limit
  IF v_coupon.per_customer_limit IS NOT NULL AND v_coupon.per_customer_limit > 0 AND p_customer_phone IS NOT NULL THEN
    SELECT COUNT(*) INTO v_customer_usage
    FROM coupon_usage
    WHERE coupon_id = p_coupon_id AND customer_phone = p_customer_phone;

    IF v_customer_usage >= v_coupon.per_customer_limit THEN
      RETURN jsonb_build_object('success', false, 'error', 'Bạn đã dùng hết lượt cho mã này');
    END IF;
  END IF;

  -- Increment usage
  UPDATE coupons SET usage_count = usage_count + 1 WHERE id = p_coupon_id;

  -- Log usage
  INSERT INTO coupon_usage (tenant_id, coupon_id, order_id, customer_phone, discount_amount)
  VALUES (p_tenant_id, p_coupon_id, p_order_id, p_customer_phone, p_discount_amount);

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION use_coupon_atomic(UUID, UUID, UUID, TEXT, NUMERIC) TO anon, authenticated;
