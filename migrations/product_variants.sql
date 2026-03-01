-- ============================================
-- Migration: Product variants
-- ============================================

-- 1. Product variants table
CREATE TABLE IF NOT EXISTS product_variants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  sku TEXT,
  variant_name TEXT NOT NULL,
  attributes JSONB DEFAULT '{}',
  price NUMERIC DEFAULT 0,
  cost_price NUMERIC DEFAULT 0,
  barcode TEXT,
  weight NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_tenant ON product_variants(tenant_id);
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_product_variants" ON product_variants
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- 2. Add variant fields to products
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_options JSONB DEFAULT '[]';

-- 3. Add variant_id to order_items
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_name TEXT;

-- 4. Add variant_id to warehouse_stock
ALTER TABLE warehouse_stock ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES product_variants(id);

-- 5. Unique indexes for warehouse_stock (variant-aware)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_no_variant
  ON warehouse_stock (warehouse_id, product_id) WHERE variant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_with_variant
  ON warehouse_stock (warehouse_id, product_id, variant_id) WHERE variant_id IS NOT NULL;
