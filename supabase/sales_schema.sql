-- ============================================================
-- MODULE SALES: Schema cho bán hàng (POS + Online)
-- Chạy thủ công trong Supabase SQL Editor
-- ============================================================

-- 1. Bảng khách hàng
CREATE TABLE IF NOT EXISTS customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  name            TEXT NOT NULL,
  phone           TEXT,
  email           TEXT,
  address         TEXT,
  note            TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ
);

CREATE INDEX idx_customers_tenant ON customers(tenant_id);
CREATE INDEX idx_customers_phone ON customers(tenant_id, phone);

-- 2. Bảng đơn hàng
CREATE TABLE IF NOT EXISTS orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id),
  order_number      TEXT NOT NULL,
  order_type        TEXT NOT NULL DEFAULT 'pos',        -- pos | online
  status            TEXT NOT NULL DEFAULT 'new',        -- new, confirmed, packing, shipping, delivered, completed, cancelled, returned
  customer_id       UUID REFERENCES customers(id),
  customer_name     TEXT,
  customer_phone    TEXT,
  shipping_address  TEXT,
  shipping_provider TEXT,                                -- GHN, GHTK, Viettel Post, J&T, Grab, Tự giao
  tracking_number   TEXT,
  shipping_fee      NUMERIC DEFAULT 0,
  shipping_payer    TEXT DEFAULT 'customer',             -- customer | shop
  discount_amount   NUMERIC DEFAULT 0,
  discount_note     TEXT,
  subtotal          NUMERIC DEFAULT 0,
  total_amount      NUMERIC DEFAULT 0,
  payment_method    TEXT DEFAULT 'cash',                 -- cash | transfer | debt
  payment_status    TEXT DEFAULT 'unpaid',               -- unpaid | paid | partial
  paid_amount       NUMERIC DEFAULT 0,
  note              TEXT,
  needs_installation BOOLEAN DEFAULT false,
  technical_job_id  UUID,
  receipt_id        UUID,
  created_by        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ
);

CREATE INDEX idx_orders_tenant ON orders(tenant_id);
CREATE INDEX idx_orders_status ON orders(tenant_id, status);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_date ON orders(tenant_id, created_at DESC);

-- 3. Bảng chi tiết đơn hàng
CREATE TABLE IF NOT EXISTS order_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES products(id),
  product_name    TEXT NOT NULL,
  product_sku     TEXT,
  quantity        INTEGER NOT NULL DEFAULT 1,
  unit_price      NUMERIC NOT NULL,
  discount        NUMERIC DEFAULT 0,
  total_price     NUMERIC NOT NULL,
  warranty_months INTEGER
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);

-- 4. RLS Policies (nếu RLS đang bật)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_tenant_policy" ON customers
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "orders_tenant_policy" ON orders
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "order_items_policy" ON order_items
  FOR ALL USING (true) WITH CHECK (true);

-- 5. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE customers;
