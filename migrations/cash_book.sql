-- Feature 22: Sổ quỹ (Cash Book)
-- Bảng ghi nhận thu/chi tự động + thủ công

CREATE TABLE IF NOT EXISTS cash_book_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  type TEXT NOT NULL CHECK (type IN ('receipt', 'payment')),
  category TEXT NOT NULL DEFAULT 'other',
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  reference_type TEXT, -- 'order' | 'stock_import' | 'supplier' | 'return' | null
  reference_id TEXT,
  payment_method TEXT DEFAULT 'cash',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast tenant + time queries
CREATE INDEX IF NOT EXISTS idx_cash_book_tenant_created ON cash_book_entries(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_book_reference ON cash_book_entries(reference_type, reference_id);

-- RLS
ALTER TABLE cash_book_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_book_entries_tenant_isolation" ON cash_book_entries
  FOR ALL USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
