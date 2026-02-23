-- =============================================
-- Orders Shipping Upgrade Migration
-- Thêm cột mới cho orders + 2 bảng mới
-- =============================================

-- Thêm cột mới cho orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receiver_email TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source TEXT DEFAULT 'manual';  -- manual, zalo, haravan, web
ALTER TABLE orders ADD COLUMN IF NOT EXISTS internal_note TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_weight INTEGER DEFAULT 0;  -- grams
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_service TEXT;  -- VCN, VTK, etc.

-- Bảng shipping tracking events (timeline)
CREATE TABLE IF NOT EXISTS shipping_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tracking_number TEXT,
  status TEXT NOT NULL,
  description TEXT,
  location TEXT,
  event_time TIMESTAMPTZ DEFAULT now(),
  source TEXT DEFAULT 'manual',  -- manual, vtp_api
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shipping_events_order ON shipping_tracking_events(order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_events_tenant ON shipping_tracking_events(tenant_id);

-- Bảng COD reconciliation
CREATE TABLE IF NOT EXISTS cod_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  order_number TEXT NOT NULL,
  shipping_provider TEXT,
  tracking_number TEXT,
  cod_amount NUMERIC DEFAULT 0,
  received_amount NUMERIC DEFAULT 0,
  shipping_fee_actual NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',  -- pending, received, confirmed, disputed
  received_date TIMESTAMPTZ,
  confirmed_by TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cod_recon_tenant ON cod_reconciliation(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cod_recon_status ON cod_reconciliation(tenant_id, status);

-- RLS policies
ALTER TABLE shipping_tracking_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "shipping_tracking_events_all" ON shipping_tracking_events FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE cod_reconciliation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cod_reconciliation_all" ON cod_reconciliation FOR ALL USING (true) WITH CHECK (true);
