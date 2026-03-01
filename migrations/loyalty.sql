-- Feature 23: Loyalty / Tích điểm khách hàng

-- Bảng điểm KH
CREATE TABLE IF NOT EXISTS customer_points (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  total_points INTEGER DEFAULT 0,
  used_points INTEGER DEFAULT 0,
  available_points INTEGER GENERATED ALWAYS AS (total_points - used_points) STORED,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, customer_id)
);

-- Lịch sử điểm
CREATE TABLE IF NOT EXISTS point_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  order_id UUID REFERENCES orders(id),
  type TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'adjust', 'expire')),
  points INTEGER NOT NULL, -- + earn, - redeem
  description TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_customer_points_tenant ON customer_points(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_tenant ON point_transactions(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_order ON point_transactions(order_id);

-- Thêm field vào orders cho việc dùng điểm
ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_used INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_discount NUMERIC DEFAULT 0;

-- RLS
ALTER TABLE customer_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_points_tenant_isolation" ON customer_points
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY "point_transactions_tenant_isolation" ON point_transactions
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
