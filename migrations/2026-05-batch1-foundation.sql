-- =====================================================================
-- BATCH 1: Foundation — UNIQUE indexes + RPC sinh số sequential + warehouse_stock tenant
-- Ngày: 2026-05
-- =====================================================================
-- Chạy trong SQL Editor. Tất cả bọc trong DO block / IF NOT EXISTS để chạy idempotent.

-- =====================================================================
-- 1. UNIQUE indexes — chống trùng số chứng từ
-- =====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_unique_number
  ON orders(tenant_id, order_number)
  WHERE order_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_unique_sku
  ON products(tenant_id, sku)
  WHERE sku IS NOT NULL AND sku <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_unique_barcode
  ON products(tenant_id, barcode)
  WHERE barcode IS NOT NULL AND barcode <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_tx_unique_number
  ON stock_transactions(tenant_id, transaction_number)
  WHERE transaction_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_unique_number
  ON receipts_payments(tenant_id, receipt_number)
  WHERE receipt_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transfers_unique_code
  ON warehouse_transfers(tenant_id, transfer_code)
  WHERE transfer_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stocktakes_unique_code
  ON stocktakes(tenant_id, stocktake_code)
  WHERE stocktake_code IS NOT NULL;

-- =====================================================================
-- 2. Bảng document_counters — đếm tăng dần per-tenant per-loại
-- =====================================================================
CREATE TABLE IF NOT EXISTS document_counters (
  tenant_id UUID NOT NULL,
  doc_type TEXT NOT NULL,          -- 'order', 'receipt', 'stock_tx', 'transfer', 'stocktake', 'sku', 'supplier_return', ...
  scope_key TEXT NOT NULL,         -- thường là 'YYYYMMDD' cho daily, hoặc 'YYYYMM' cho monthly
  last_value BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (tenant_id, doc_type, scope_key)
);

CREATE INDEX IF NOT EXISTS idx_doc_counters_lookup
  ON document_counters(tenant_id, doc_type);

-- =====================================================================
-- 3. RPC: next_doc_number — sinh số tăng dần atomic (SELECT FOR UPDATE)
-- =====================================================================
CREATE OR REPLACE FUNCTION next_doc_number(
  p_tenant UUID,
  p_doc_type TEXT,
  p_scope_key TEXT,
  p_prefix TEXT DEFAULT '',
  p_pad INTEGER DEFAULT 4
) RETURNS TEXT AS $$
DECLARE
  next_val BIGINT;
  result TEXT;
BEGIN
  -- INSERT new row nếu chưa có, hoặc UPDATE +1 với UPSERT atomic
  INSERT INTO document_counters AS dc (tenant_id, doc_type, scope_key, last_value, updated_at)
  VALUES (p_tenant, p_doc_type, p_scope_key, 1, now())
  ON CONFLICT (tenant_id, doc_type, scope_key)
  DO UPDATE SET
    last_value = dc.last_value + 1,
    updated_at = now()
  RETURNING last_value INTO next_val;

  result := p_prefix || LPAD(next_val::TEXT, p_pad, '0');
  RETURN result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION next_doc_number IS
'Sinh số chứng từ tăng dần atomic per (tenant, doc_type, scope_key).
VD: SELECT next_doc_number(tenant_id, ''order'', ''20260510'', ''DH-20260510-'', 3)
    → ''DH-20260510-001'' lần đầu, ''DH-20260510-002'' lần sau';

-- =====================================================================
-- 4. RPC: gen_order_number — wrapper cho order
-- =====================================================================
CREATE OR REPLACE FUNCTION gen_order_number(p_tenant UUID) RETURNS TEXT AS $$
DECLARE
  today_str TEXT := TO_CHAR(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD');
BEGIN
  RETURN next_doc_number(p_tenant, 'order', today_str, 'DH-' || today_str || '-', 3);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION gen_receipt_number(p_tenant UUID) RETURNS TEXT AS $$
DECLARE
  today_str TEXT := TO_CHAR(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD');
BEGIN
  RETURN next_doc_number(p_tenant, 'receipt', today_str, 'PT-' || today_str || '-', 3);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION gen_stock_tx_number(p_tenant UUID, p_type TEXT) RETURNS TEXT AS $$
DECLARE
  today_str TEXT := TO_CHAR(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD');
  prefix TEXT;
BEGIN
  prefix := CASE p_type
    WHEN 'import' THEN 'PN'
    WHEN 'export' THEN 'PX'
    WHEN 'adjust' THEN 'PD'
    ELSE 'PK'
  END;
  RETURN next_doc_number(p_tenant, 'stock_tx_' || p_type, today_str, prefix || '-' || today_str || '-', 4);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION gen_transfer_code(p_tenant UUID) RETURNS TEXT AS $$
DECLARE
  today_str TEXT := TO_CHAR(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD');
BEGIN
  RETURN next_doc_number(p_tenant, 'transfer', today_str, 'CK-' || today_str || '-', 3);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION gen_stocktake_code(p_tenant UUID) RETURNS TEXT AS $$
DECLARE
  today_str TEXT := TO_CHAR(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD');
BEGIN
  RETURN next_doc_number(p_tenant, 'stocktake', today_str, 'KK-' || today_str || '-', 3);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION gen_supplier_return_code(p_tenant UUID) RETURNS TEXT AS $$
DECLARE
  today_str TEXT := TO_CHAR(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD');
BEGIN
  RETURN next_doc_number(p_tenant, 'sup_return', today_str, 'TRNCC-' || today_str || '-', 3);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION gen_sku(p_tenant UUID) RETURNS TEXT AS $$
DECLARE
  yyyymm TEXT := TO_CHAR(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMM');
BEGIN
  RETURN next_doc_number(p_tenant, 'sku', yyyymm, 'SP-' || yyyymm || '-', 4);
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 5. warehouse_stock — Thêm cột tenant_id (FIX BẢO MẬT)
-- =====================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'warehouse_stock' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE warehouse_stock ADD COLUMN tenant_id UUID;

    -- Backfill từ warehouses
    UPDATE warehouse_stock ws
    SET tenant_id = w.tenant_id
    FROM warehouses w
    WHERE ws.warehouse_id = w.id;

    -- NOT NULL + FK
    ALTER TABLE warehouse_stock ALTER COLUMN tenant_id SET NOT NULL;
    ALTER TABLE warehouse_stock
      ADD CONSTRAINT warehouse_stock_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES tenants(id);

    CREATE INDEX IF NOT EXISTS idx_warehouse_stock_tenant
      ON warehouse_stock(tenant_id);
  END IF;
END $$;

-- Trigger: tự set tenant_id khi insert (lấy từ warehouse)
CREATE OR REPLACE FUNCTION set_warehouse_stock_tenant() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT tenant_id INTO NEW.tenant_id FROM warehouses WHERE id = NEW.warehouse_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS warehouse_stock_set_tenant ON warehouse_stock;
CREATE TRIGGER warehouse_stock_set_tenant
  BEFORE INSERT ON warehouse_stock
  FOR EACH ROW EXECUTE FUNCTION set_warehouse_stock_tenant();

-- =====================================================================
-- 6. Verify
-- =====================================================================
SELECT
  'unique_indexes' AS check_name,
  COUNT(*) AS count,
  CASE WHEN COUNT(*) >= 7 THEN '✅ OK' ELSE '⚠️ Thiếu index' END AS status
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_orders_unique_number','idx_products_unique_sku','idx_products_unique_barcode',
    'idx_stock_tx_unique_number','idx_receipts_unique_number',
    'idx_transfers_unique_code','idx_stocktakes_unique_code'
  )
UNION ALL
SELECT
  'rpc_functions',
  COUNT(*),
  CASE WHEN COUNT(*) >= 7 THEN '✅ OK' ELSE '⚠️ Thiếu RPC' END
FROM pg_proc
WHERE proname IN (
  'next_doc_number','gen_order_number','gen_receipt_number',
  'gen_stock_tx_number','gen_transfer_code','gen_stocktake_code',
  'gen_supplier_return_code','gen_sku'
)
UNION ALL
SELECT
  'warehouse_stock_tenant_id',
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'warehouse_stock' AND column_name = 'tenant_id'
  ) THEN 1 ELSE 0 END,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'warehouse_stock' AND column_name = 'tenant_id'
  ) THEN '✅ OK' ELSE '❌ Chưa có cột tenant_id' END;

-- Test sinh 3 số đơn liên tiếp (verify atomic)
SELECT gen_order_number((SELECT id FROM tenants LIMIT 1)) AS order_1;
SELECT gen_order_number((SELECT id FROM tenants LIMIT 1)) AS order_2;
SELECT gen_order_number((SELECT id FROM tenants LIMIT 1)) AS order_3;
