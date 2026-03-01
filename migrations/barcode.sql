-- Feature 24: Barcode sản phẩm
-- products.barcode đã tồn tại, chỉ cần index

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
