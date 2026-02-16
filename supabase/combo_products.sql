-- =============================================
-- Combo/Bundle Products Migration
-- Thêm sản phẩm combo: tồn kho tính từ SP con
-- =============================================

-- 1. Thêm cột is_combo vào products
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_combo BOOLEAN DEFAULT false;

-- 2. Bảng liên kết combo với SP con
CREATE TABLE IF NOT EXISTS product_combo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  combo_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  child_product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(combo_product_id, child_product_id)
);

CREATE INDEX IF NOT EXISTS idx_combo_items_combo ON product_combo_items(combo_product_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_child ON product_combo_items(child_product_id);

-- RLS
ALTER TABLE product_combo_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "combo_items_tenant_policy" ON product_combo_items
  FOR ALL USING (tenant_id = (current_setting('app.tenant_id', true))::uuid);

CREATE POLICY "combo_items_anon_access" ON product_combo_items
  FOR ALL USING (true);
