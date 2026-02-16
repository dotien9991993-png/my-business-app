-- ============================================================
-- Serial Number + Warranty System
-- Tables: product_serials, warranty_cards, warranty_repairs
-- ALTER: products.has_serial, orders.payment_splits
-- ============================================================

-- 1. ALTER existing tables (safe, IF NOT EXISTS)
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_serial BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_splits JSONB DEFAULT '[]';

-- 2. product_serials
CREATE TABLE IF NOT EXISTS product_serials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  product_id UUID NOT NULL REFERENCES products(id),
  serial_number TEXT NOT NULL,
  batch_number TEXT,
  manufacturing_date DATE,
  status TEXT NOT NULL DEFAULT 'in_stock'
    CHECK (status IN ('in_stock','sold','returned','defective','warranty_repair','scrapped')),
  warehouse_id UUID REFERENCES warehouses(id),
  sold_order_id UUID REFERENCES orders(id),
  sold_at TIMESTAMPTZ,
  warranty_start DATE,
  warranty_end DATE,
  customer_name TEXT,
  customer_phone TEXT,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, serial_number)
);

CREATE INDEX IF NOT EXISTS idx_serials_tenant ON product_serials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_serials_product ON product_serials(product_id);
CREATE INDEX IF NOT EXISTS idx_serials_status ON product_serials(status);
CREATE INDEX IF NOT EXISTS idx_serials_warehouse ON product_serials(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_serials_order ON product_serials(sold_order_id);
CREATE INDEX IF NOT EXISTS idx_serials_phone ON product_serials(customer_phone);
CREATE INDEX IF NOT EXISTS idx_serials_serial ON product_serials(serial_number);

-- 3. warranty_cards
CREATE TABLE IF NOT EXISTS warranty_cards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  card_number TEXT NOT NULL,
  serial_id UUID REFERENCES product_serials(id),
  product_id UUID REFERENCES products(id),
  product_name TEXT,
  product_sku TEXT,
  serial_number TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_email TEXT,
  customer_address TEXT,
  order_id UUID REFERENCES orders(id),
  warranty_start DATE,
  warranty_end DATE,
  warranty_months INT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','expired','voided','extended')),
  extended_months INT DEFAULT 0,
  void_reason TEXT,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, card_number)
);

CREATE INDEX IF NOT EXISTS idx_wcards_tenant ON warranty_cards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wcards_serial ON warranty_cards(serial_number);
CREATE INDEX IF NOT EXISTS idx_wcards_phone ON warranty_cards(customer_phone);
CREATE INDEX IF NOT EXISTS idx_wcards_status ON warranty_cards(status);
CREATE INDEX IF NOT EXISTS idx_wcards_product ON warranty_cards(product_id);

-- 4. warranty_repairs
CREATE TABLE IF NOT EXISTS warranty_repairs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  repair_number TEXT NOT NULL,
  serial_id UUID REFERENCES product_serials(id),
  warranty_card_id UUID REFERENCES warranty_cards(id),
  product_name TEXT,
  serial_number TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','diagnosing','repairing','done','returned','cancelled')),
  repair_type TEXT NOT NULL DEFAULT 'warranty'
    CHECK (repair_type IN ('warranty','paid')),
  symptom TEXT,
  diagnosis TEXT,
  solution TEXT,
  parts_used JSONB DEFAULT '[]',
  labor_cost NUMERIC DEFAULT 0,
  parts_cost NUMERIC DEFAULT 0,
  total_cost NUMERIC DEFAULT 0,
  is_warranty_covered BOOLEAN DEFAULT true,
  receipt_id UUID,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  diagnosed_at TIMESTAMPTZ,
  repaired_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  returned_at TIMESTAMPTZ,
  technician TEXT,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, repair_number)
);

CREATE INDEX IF NOT EXISTS idx_repairs_tenant ON warranty_repairs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_repairs_serial ON warranty_repairs(serial_number);
CREATE INDEX IF NOT EXISTS idx_repairs_status ON warranty_repairs(status);
CREATE INDEX IF NOT EXISTS idx_repairs_phone ON warranty_repairs(customer_phone);

-- 5. RLS policies (open, same pattern as existing tables)
ALTER TABLE product_serials ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranty_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranty_repairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_serials_all" ON product_serials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "warranty_cards_all" ON warranty_cards FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "warranty_repairs_all" ON warranty_repairs FOR ALL USING (true) WITH CHECK (true);

-- 6. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE product_serials;
ALTER PUBLICATION supabase_realtime ADD TABLE warranty_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE warranty_repairs;
