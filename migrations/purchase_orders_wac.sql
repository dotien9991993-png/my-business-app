-- =====================================================
-- Purchase Orders + Supplier Payments + WAC (Cost Price History)
-- Chạy trong Supabase SQL Editor
-- =====================================================

-- purchase_orders
CREATE TABLE purchase_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  po_number TEXT NOT NULL,
  supplier_id UUID REFERENCES suppliers(id),
  status TEXT DEFAULT 'draft', -- draft, confirmed, partial, received, cancelled
  order_date DATE DEFAULT CURRENT_DATE,
  expected_date DATE,
  notes TEXT,
  total_amount NUMERIC DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- purchase_order_items
CREATE TABLE purchase_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  po_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  received_quantity INTEGER DEFAULT 0,
  unit_price NUMERIC DEFAULT 0,
  notes TEXT
);

-- supplier_payments
CREATE TABLE supplier_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_date DATE DEFAULT CURRENT_DATE,
  reference_number TEXT,
  notes TEXT,
  stock_transaction_id UUID REFERENCES stock_transactions(id),
  po_id UUID REFERENCES purchase_orders(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- cost_price_history (audit trail cho WAC)
CREATE TABLE cost_price_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  product_id UUID NOT NULL REFERENCES products(id),
  old_avg_cost NUMERIC,
  new_avg_cost NUMERIC,
  import_quantity INTEGER,
  import_price NUMERIC,
  stock_transaction_id UUID REFERENCES stock_transactions(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON purchase_orders FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY "tenant_isolation" ON supplier_payments FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY "tenant_isolation" ON cost_price_history FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY "po_items_via_po" ON purchase_order_items FOR ALL USING (true);

-- Indexes
CREATE INDEX idx_po_tenant ON purchase_orders(tenant_id);
CREATE INDEX idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_sp_tenant ON supplier_payments(tenant_id);
CREATE INDEX idx_sp_supplier ON supplier_payments(supplier_id);
CREATE INDEX idx_cph_product ON cost_price_history(product_id);
