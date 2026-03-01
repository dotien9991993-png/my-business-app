-- ============================================
-- Migration: Coupons / Promotions
-- ============================================

-- 1. Coupons table
CREATE TABLE IF NOT EXISTS coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'percentage',
  value NUMERIC DEFAULT 0,
  min_order_value NUMERIC DEFAULT 0,
  max_discount NUMERIC DEFAULT 0,
  usage_limit INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  per_customer_limit INTEGER DEFAULT 1,
  applicable_products UUID[] DEFAULT '{}',
  applicable_categories TEXT[] DEFAULT '{}',
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  description TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_coupons_tenant ON coupons(tenant_id);
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_coupons" ON coupons
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- 2. Coupon usage tracking
CREATE TABLE IF NOT EXISTS coupon_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  coupon_id UUID REFERENCES coupons(id),
  order_id UUID REFERENCES orders(id),
  customer_phone TEXT,
  discount_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE coupon_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_coupon_usage" ON coupon_usage
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- 3. Add coupon fields to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES coupons(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;

-- 4. RPC for atomic usage count
CREATE OR REPLACE FUNCTION increment_coupon_usage(p_coupon_id UUID)
RETURNS VOID AS $$
  UPDATE coupons SET usage_count = usage_count + 1 WHERE id = p_coupon_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION decrement_coupon_usage(p_coupon_id UUID)
RETURNS VOID AS $$
  UPDATE coupons SET usage_count = GREATEST(0, usage_count - 1) WHERE id = p_coupon_id;
$$ LANGUAGE sql;
