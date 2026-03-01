-- ============================================================
-- Migration: Sales Features (3, 4)
-- Customer Addresses + Order Returns
-- Chạy trên Supabase SQL Editor
-- ============================================================

-- ---- Feature 3: Multiple Delivery Addresses ----

CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Nhà',
  recipient_name TEXT,
  recipient_phone TEXT,
  address TEXT NOT NULL,
  ward TEXT,
  district TEXT,
  province TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_customer_addresses" ON customer_addresses
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_tenant ON customer_addresses(tenant_id);


-- ---- Feature 4: Partial Order Returns ----

CREATE TABLE IF NOT EXISTS order_returns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  return_code TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  total_refund NUMERIC(15,2) DEFAULT 0,
  refund_method TEXT DEFAULT 'cash',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_return_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id UUID NOT NULL REFERENCES order_returns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(15,2) NOT NULL,
  subtotal NUMERIC(15,2) NOT NULL,
  condition TEXT DEFAULT 'good',
  note TEXT
);

ALTER TABLE order_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_order_returns" ON order_returns
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

CREATE POLICY "tenant_isolation_order_return_items" ON order_return_items
  FOR ALL USING (
    return_id IN (SELECT id FROM order_returns WHERE tenant_id = current_setting('app.tenant_id', true)::uuid)
  );

CREATE INDEX IF NOT EXISTS idx_order_returns_order ON order_returns(order_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_tenant ON order_returns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_return_items_return ON order_return_items(return_id);
