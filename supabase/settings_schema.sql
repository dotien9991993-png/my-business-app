-- ============================================================
-- CẤU HÌNH HỆ THỐNG: Settings Schema
-- Chạy thủ công trong Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. BẢNG system_settings (key-value per tenant)
-- ============================================================

CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, category, key)
);

CREATE INDEX IF NOT EXISTS idx_system_settings_tenant ON system_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(tenant_id, category);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "system_settings_policy" ON system_settings FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE system_settings;

-- ============================================================
-- 2. BẢNG shipping_configs (API tokens riêng)
-- ============================================================

CREATE TABLE IF NOT EXISTS shipping_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  provider TEXT NOT NULL,
  api_token TEXT,
  shop_id TEXT,
  is_active BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_shipping_configs_tenant ON shipping_configs(tenant_id);

ALTER TABLE shipping_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipping_configs_policy" ON shipping_configs FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 3. MỞ RỘNG BẢNG tenants
-- ============================================================

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_code TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_account TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_holder TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_footer TEXT;
