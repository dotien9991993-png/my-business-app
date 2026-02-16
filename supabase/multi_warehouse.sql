-- ============================================================
-- PHẦN A: Multi-Warehouse Support
-- Chạy thủ công trong Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. BẢNG MỚI
-- ============================================================

-- Bảng warehouses (danh sách kho)
CREATE TABLE IF NOT EXISTS warehouses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  code            TEXT,
  address         TEXT,
  phone           TEXT,
  manager         TEXT,
  is_default      BOOLEAN DEFAULT false,
  is_active       BOOLEAN DEFAULT true,
  sort_order      INTEGER DEFAULT 0,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_warehouses_tenant ON warehouses(tenant_id);
-- Chỉ cho phép 1 kho mặc định / tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouses_default ON warehouses(tenant_id) WHERE is_default = true;

-- Bảng warehouse_stock (tồn kho theo từng kho)
CREATE TABLE IF NOT EXISTS warehouse_stock (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id    UUID NOT NULL REFERENCES warehouses(id),
  product_id      UUID NOT NULL REFERENCES products(id),
  quantity        INTEGER NOT NULL DEFAULT 0,
  min_stock       INTEGER DEFAULT 0,
  location        TEXT,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(warehouse_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_warehouse_stock_warehouse ON warehouse_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_product ON warehouse_stock(product_id);

-- ============================================================
-- 2. THÊM CỘT VÀO BẢNG HIỆN CÓ
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES warehouses(id);
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS transfer_to_warehouse_id UUID REFERENCES warehouses(id);

CREATE INDEX IF NOT EXISTS idx_stock_transactions_warehouse ON stock_transactions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_orders_warehouse ON orders(warehouse_id);

-- ============================================================
-- 3. RLS + REALTIME
-- ============================================================

ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "warehouses_policy" ON warehouses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "warehouse_stock_policy" ON warehouse_stock FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE warehouses;
ALTER PUBLICATION supabase_realtime ADD TABLE warehouse_stock;

-- ============================================================
-- 4. MIGRATION DATA CŨ
-- Chạy SAU KHI tạo tables ở trên
-- ============================================================

-- Tạo kho mặc định "Kho chính" cho mỗi tenant
INSERT INTO warehouses (tenant_id, name, code, is_default, is_active, created_by)
SELECT t.id, 'Kho chính', 'KHO01', true, true, 'System Migration'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM warehouses w WHERE w.tenant_id = t.id AND w.is_default = true
);

-- Copy stock_quantity từ products sang warehouse_stock cho kho mặc định
INSERT INTO warehouse_stock (warehouse_id, product_id, quantity, location)
SELECT w.id, p.id, p.stock_quantity, p.location
FROM products p
JOIN warehouses w ON w.tenant_id = p.tenant_id AND w.is_default = true
WHERE p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM warehouse_stock ws WHERE ws.warehouse_id = w.id AND ws.product_id = p.id
  );

-- Gán warehouse_id mặc định cho stock_transactions cũ
UPDATE stock_transactions st
SET warehouse_id = w.id
FROM warehouses w
WHERE st.warehouse_id IS NULL
  AND w.tenant_id = st.tenant_id
  AND w.is_default = true;

-- Gán warehouse_id mặc định cho orders cũ
UPDATE orders o
SET warehouse_id = w.id
FROM warehouses w
WHERE o.warehouse_id IS NULL
  AND w.tenant_id = o.tenant_id
  AND w.is_default = true;

-- ============================================================
-- 5. RPC: adjust_warehouse_stock
-- Điều chỉnh tồn kho atomic cho 1 kho cụ thể
-- Đồng thời sync products.stock_quantity = SUM(tất cả kho)
-- ============================================================

CREATE OR REPLACE FUNCTION adjust_warehouse_stock(
  p_warehouse_id UUID,
  p_product_id UUID,
  p_delta INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_ws_qty INTEGER;
  new_total INTEGER;
BEGIN
  -- 1. Update warehouse_stock
  UPDATE warehouse_stock
  SET quantity = quantity + p_delta,
      updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  WHERE warehouse_id = p_warehouse_id
    AND product_id = p_product_id
    AND (p_delta > 0 OR quantity >= ABS(p_delta))
  RETURNING quantity INTO new_ws_qty;

  -- Nếu row chưa tồn tại → tạo mới (chỉ cho delta > 0)
  IF NOT FOUND THEN
    IF p_delta > 0 THEN
      INSERT INTO warehouse_stock (warehouse_id, product_id, quantity)
      VALUES (p_warehouse_id, p_product_id, p_delta)
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET quantity = warehouse_stock.quantity + p_delta,
                    updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
      RETURNING quantity INTO new_ws_qty;
    ELSE
      IF EXISTS (SELECT 1 FROM warehouse_stock WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id) THEN
        RAISE EXCEPTION 'Không đủ tồn kho tại kho này cho sản phẩm %', p_product_id;
      ELSE
        RAISE EXCEPTION 'Sản phẩm % chưa có trong kho này', p_product_id;
      END IF;
    END IF;
  END IF;

  -- 2. Sync products.stock_quantity = SUM(tất cả kho)
  SELECT COALESCE(SUM(ws.quantity), 0) INTO new_total
  FROM warehouse_stock ws
  WHERE ws.product_id = p_product_id;

  UPDATE products
  SET stock_quantity = new_total,
      updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  WHERE id = p_product_id;

  RETURN new_ws_qty;
END;
$$;

GRANT EXECUTE ON FUNCTION adjust_warehouse_stock(UUID, UUID, INTEGER) TO anon, authenticated;

-- ============================================================
-- 6. RPC: transfer_stock
-- Chuyển kho: giảm kho A, tăng kho B, products.stock_quantity giữ nguyên
-- ============================================================

CREATE OR REPLACE FUNCTION transfer_stock(
  p_from_warehouse_id UUID,
  p_to_warehouse_id UUID,
  p_product_id UUID,
  p_quantity INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  from_qty INTEGER;
  to_qty INTEGER;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Số lượng chuyển phải lớn hơn 0';
  END IF;

  IF p_from_warehouse_id = p_to_warehouse_id THEN
    RAISE EXCEPTION 'Kho nguồn và kho đích phải khác nhau';
  END IF;

  -- 1. Giảm kho nguồn
  UPDATE warehouse_stock
  SET quantity = quantity - p_quantity,
      updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  WHERE warehouse_id = p_from_warehouse_id
    AND product_id = p_product_id
    AND quantity >= p_quantity
  RETURNING quantity INTO from_qty;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không đủ tồn kho để chuyển';
  END IF;

  -- 2. Tăng kho đích (upsert)
  INSERT INTO warehouse_stock (warehouse_id, product_id, quantity)
  VALUES (p_to_warehouse_id, p_product_id, p_quantity)
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET quantity = warehouse_stock.quantity + p_quantity,
                updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  RETURNING quantity INTO to_qty;

  -- products.stock_quantity KHÔNG THAY ĐỔI (tổng vẫn giữ nguyên)

  RETURN jsonb_build_object(
    'from_quantity', from_qty,
    'to_quantity', to_qty
  );
END;
$$;

GRANT EXECUTE ON FUNCTION transfer_stock(UUID, UUID, UUID, INTEGER) TO anon, authenticated;

-- ============================================================
-- 7. UPGRADE adjust_stock cũ (backward compat)
-- Khi gọi adjust_stock, cũng sync warehouse_stock kho mặc định
-- ============================================================

CREATE OR REPLACE FUNCTION adjust_stock(p_product_id UUID, p_delta INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_stock INTEGER;
  default_warehouse_id UUID;
BEGIN
  UPDATE products
  SET stock_quantity = stock_quantity + p_delta,
      updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  WHERE id = p_product_id
    AND (p_delta > 0 OR stock_quantity >= ABS(p_delta))
  RETURNING stock_quantity INTO new_stock;

  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
      RAISE EXCEPTION 'Sản phẩm không tồn tại: %', p_product_id;
    ELSE
      RAISE EXCEPTION 'Không đủ tồn kho cho sản phẩm %', p_product_id;
    END IF;
  END IF;

  -- Sync warehouse_stock kho mặc định
  SELECT w.id INTO default_warehouse_id
  FROM warehouses w
  JOIN products p ON p.tenant_id = w.tenant_id
  WHERE p.id = p_product_id AND w.is_default = true
  LIMIT 1;

  IF default_warehouse_id IS NOT NULL THEN
    INSERT INTO warehouse_stock (warehouse_id, product_id, quantity)
    VALUES (default_warehouse_id, p_product_id, GREATEST(0, p_delta))
    ON CONFLICT (warehouse_id, product_id)
    DO UPDATE SET quantity = GREATEST(0, warehouse_stock.quantity + p_delta),
                  updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh';
  END IF;

  RETURN new_stock;
END;
$$;

GRANT EXECUTE ON FUNCTION adjust_stock(UUID, INTEGER) TO anon, authenticated;
