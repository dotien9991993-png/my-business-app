-- ============================================================
-- Fix 4 Bug Nghiêm Trọng Module Sale
-- BUG 3: Unique constraint cho order_reconciliation
-- BUG 2: Atomic order creation RPC
-- ============================================================

-- BUG 3: Unique constraint ngăn quét QR trùng (1 đơn chỉ 1 lần delivery_confirm / return_confirm)
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_reconciliation_unique
ON order_reconciliation(order_id, type);

-- BUG 2: Atomic order creation RPC
-- Tạo đơn + items + trừ kho trong 1 transaction duy nhất
-- Nếu hết hàng giữa chừng → rollback toàn bộ, không có orphan data
CREATE OR REPLACE FUNCTION create_order_atomic(
  p_order JSONB,
  p_items JSONB,
  p_warehouse_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_order_id UUID;
  v_item JSONB;
  v_child RECORD;
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
    order_source, internal_note, total_weight, shipping_service
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
    p_order->>'shipping_service'
  ) RETURNING id INTO v_order_id;

  -- Insert items + adjust stock (all in one transaction)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (
      order_id, product_id, product_name, product_sku,
      quantity, unit_price, discount, total_price,
      warranty_months, variant_id, variant_name
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
      v_item->>'variant_name'
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
