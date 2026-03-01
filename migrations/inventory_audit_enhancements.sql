-- Feature 16: Kiểm kê tồn kho enhancements
-- Thêm variant_id vào stocktake_items để hỗ trợ kiểm kê theo biến thể
ALTER TABLE stocktake_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);
ALTER TABLE stocktake_items ADD COLUMN IF NOT EXISTS variant_name TEXT;
