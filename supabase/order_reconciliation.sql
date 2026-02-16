-- ============================================================
-- ĐỐI SOÁT ĐƠN HÀNG: Order Reconciliation Schema
-- Chạy thủ công trong Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS order_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  type TEXT NOT NULL,        -- 'delivery_confirm', 'return_confirm'
  scanned_code TEXT,
  scanned_at TIMESTAMPTZ DEFAULT now(),
  scanned_by TEXT,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_reconciliation_tenant ON order_reconciliation(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_reconciliation_order ON order_reconciliation(order_id);
CREATE INDEX IF NOT EXISTS idx_order_reconciliation_date ON order_reconciliation(tenant_id, scanned_at DESC);

ALTER TABLE order_reconciliation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "order_reconciliation_policy" ON order_reconciliation FOR ALL USING (true) WITH CHECK (true);
ALTER PUBLICATION supabase_realtime ADD TABLE order_reconciliation;
