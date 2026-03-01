-- ============================================
-- Migration: Order status logs for tracking
-- ============================================

CREATE TABLE IF NOT EXISTS order_status_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL DEFAULT 'shipping_status',
  old_status TEXT,
  new_status TEXT,
  source TEXT DEFAULT 'manual',
  raw_data JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_order_status_logs_order ON order_status_logs(order_id);
ALTER TABLE order_status_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_status_logs" ON order_status_logs
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
