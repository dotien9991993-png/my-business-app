-- ========================================
-- Warehouse Upgrade Migration
-- Adds: avg_cost, stocktakes, transfers, suppliers
-- ========================================

-- Phase 1: Product columns
ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_cost NUMERIC DEFAULT 0;

-- Phase 2: Stocktakes (Kiem ke)
CREATE TABLE IF NOT EXISTS stocktakes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  stocktake_code TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  status TEXT NOT NULL DEFAULT 'draft', -- draft, in_progress, completed, cancelled
  note TEXT,
  total_items INTEGER DEFAULT 0,
  total_diff INTEGER DEFAULT 0,
  created_by TEXT,
  completed_by TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stocktake_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stocktake_id UUID NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name TEXT,
  product_sku TEXT,
  system_qty INTEGER NOT NULL DEFAULT 0,
  actual_qty INTEGER,
  diff INTEGER GENERATED ALWAYS AS (COALESCE(actual_qty, 0) - system_qty) STORED,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stocktakes_tenant ON stocktakes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stocktakes_warehouse ON stocktakes(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_items_stocktake ON stocktake_items(stocktake_id);

-- Phase 3: Transfers (Chuyen kho)
CREATE TABLE IF NOT EXISTS warehouse_transfers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  transfer_code TEXT NOT NULL,
  from_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  to_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_transit, received, cancelled
  note TEXT,
  total_items INTEGER DEFAULT 0,
  created_by TEXT,
  confirmed_by TEXT,
  received_by TEXT,
  confirmed_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_transfer_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_id UUID NOT NULL REFERENCES warehouse_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name TEXT,
  product_sku TEXT,
  sent_qty INTEGER NOT NULL DEFAULT 0,
  received_qty INTEGER,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transfers_tenant ON warehouse_transfers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON warehouse_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON warehouse_transfers(to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON warehouse_transfer_items(transfer_id);

-- Phase 5: Suppliers (Nha cung cap)
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  contact_person TEXT,
  tax_code TEXT,
  bank_account TEXT,
  bank_name TEXT,
  note TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  total_imports INTEGER DEFAULT 0,
  total_amount NUMERIC DEFAULT 0,
  debt_amount NUMERIC DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);

-- Add supplier_id to stock_transactions
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_supplier ON stock_transactions(supplier_id);

-- Enable RLS
ALTER TABLE stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocktake_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_transfer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all for authenticated users - tenant filtering done in app)
CREATE POLICY "stocktakes_all" ON stocktakes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "stocktake_items_all" ON stocktake_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "warehouse_transfers_all" ON warehouse_transfers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "warehouse_transfer_items_all" ON warehouse_transfer_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "suppliers_all" ON suppliers FOR ALL USING (true) WITH CHECK (true);
