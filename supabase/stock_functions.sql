-- ============================================================
-- RPC: adjust_stock — Atomic stock adjustment (increment/decrement)
-- Chạy SQL này trong Supabase SQL Editor
-- ============================================================

-- Hàm điều chỉnh tồn kho an toàn (atomic)
-- p_delta > 0: cộng kho (hoàn trả)
-- p_delta < 0: trừ kho (bán hàng)
-- Trả về stock mới, raise exception nếu không đủ tồn
CREATE OR REPLACE FUNCTION adjust_stock(p_product_id UUID, p_delta INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_stock INTEGER;
BEGIN
  UPDATE products
  SET stock_quantity = stock_quantity + p_delta,
      updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  WHERE id = p_product_id
    AND (p_delta > 0 OR stock_quantity >= ABS(p_delta))
  RETURNING stock_quantity INTO new_stock;

  IF NOT FOUND THEN
    -- Kiểm tra xem product có tồn tại không
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
      RAISE EXCEPTION 'Sản phẩm không tồn tại: %', p_product_id;
    ELSE
      RAISE EXCEPTION 'Không đủ tồn kho cho sản phẩm %', p_product_id;
    END IF;
  END IF;

  RETURN new_stock;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION adjust_stock(UUID, INTEGER) TO anon, authenticated;
