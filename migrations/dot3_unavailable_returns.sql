-- ============ UNAVAILABLE STOCK ============
-- Thêm cột unavailable vào warehouse_stock
ALTER TABLE warehouse_stock ADD COLUMN IF NOT EXISTS unavailable_quantity INTEGER DEFAULT 0;

-- Log thay đổi unavailable
CREATE TABLE stock_unavailable_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  product_id UUID NOT NULL REFERENCES products(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  reason TEXT NOT NULL, -- demo, repair, hold, damaged
  quantity INTEGER NOT NULL,
  action TEXT NOT NULL, -- lock, release
  note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE stock_unavailable_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON stock_unavailable_log FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE INDEX idx_sul_tenant ON stock_unavailable_log(tenant_id);
CREATE INDEX idx_sul_product ON stock_unavailable_log(product_id);

-- ============ SUPPLIER RETURNS ============
CREATE TABLE supplier_returns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  return_number TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  po_id UUID REFERENCES purchase_orders(id),
  status TEXT DEFAULT 'draft', -- draft, confirmed, completed, cancelled
  return_date DATE DEFAULT CURRENT_DATE,
  reason TEXT,
  total_amount NUMERIC DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE supplier_return_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  return_id UUID NOT NULL REFERENCES supplier_returns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_price NUMERIC DEFAULT 0,
  reason TEXT,
  warehouse_id UUID REFERENCES warehouses(id)
);

ALTER TABLE supplier_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_return_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON supplier_returns FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY "sr_items_via_return" ON supplier_return_items FOR ALL USING (true);
CREATE INDEX idx_sr_tenant ON supplier_returns(tenant_id);
CREATE INDEX idx_sr_supplier ON supplier_returns(supplier_id);
CREATE INDEX idx_sr_status ON supplier_returns(status);

-- ============ RETURN RECEIPTS (Biên bản hoàn hàng) ============
CREATE TABLE return_receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  receipt_number TEXT NOT NULL,
  supplier_return_id UUID NOT NULL REFERENCES supplier_returns(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  status TEXT DEFAULT 'draft', -- draft, inspecting, completed
  inspection_date DATE DEFAULT CURRENT_DATE,
  inspector_id UUID REFERENCES users(id),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE return_receipt_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id UUID NOT NULL REFERENCES return_receipts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  return_quantity INTEGER NOT NULL DEFAULT 0,
  good_quantity INTEGER DEFAULT 0,
  damaged_quantity INTEGER DEFAULT 0,
  missing_quantity INTEGER DEFAULT 0,
  warehouse_id UUID REFERENCES warehouses(id),
  notes TEXT
);

ALTER TABLE return_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_receipt_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON return_receipts FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY "rr_items_via_receipt" ON return_receipt_items FOR ALL USING (true);
CREATE INDEX idx_rr_tenant ON return_receipts(tenant_id);
CREATE INDEX idx_rr_supplier ON return_receipts(supplier_id);
