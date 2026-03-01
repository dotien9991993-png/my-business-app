-- Liên kết sản phẩm với nhà cung cấp
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);

-- Theo dõi thanh toán cho phiếu nhập kho
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
