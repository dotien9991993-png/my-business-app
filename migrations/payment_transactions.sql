-- Feature 17: Thanh toán 1 phần - Bảng lịch sử thanh toán
CREATE TABLE IF NOT EXISTS payment_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tenant_id ON payment_transactions(tenant_id);

-- RLS
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_transactions_tenant_policy" ON payment_transactions
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
