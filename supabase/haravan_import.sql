-- =============================================
-- Haravan Import Migration
-- Thêm cột hỗ trợ import đơn hàng từ Haravan
-- =============================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel TEXT;
-- Giá trị: harasocial, livestream, zalo, pos, website, haravan_draft_order

ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_order_code TEXT;
-- Mã đơn Haravan gốc (VD: HNAUDIO11734)

ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_code TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_method TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'internal';
-- Giá trị: internal (tạo trực tiếp), haravan_import

-- Index để check trùng nhanh khi import
CREATE INDEX IF NOT EXISTS idx_orders_external_code ON orders(external_order_code) WHERE external_order_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source);

-- Thêm cột brand cho products (nếu chưa có)
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
