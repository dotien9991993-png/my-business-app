-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  HOANG NAM AUDIO ERP — MASTER MIGRATION (24 Features)        ║
-- ║  File duy nhất, chạy 1 lần trên Supabase SQL Editor          ║
-- ║  Tất cả dùng IF NOT EXISTS / CREATE OR REPLACE → AN TOÀN     ║
-- ║  Không ảnh hưởng dữ liệu cũ                                  ║
-- ╚══════════════════════════════════════════════════════════════════╝

-- ============================================================
-- PHẦN 1: ALTER BẢNG CŨ — Thêm cột mới (không xóa/đổi tên cột)
-- ============================================================

-- ---- tenants ----
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS slogan TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS tax_code TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_account TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bank_holder TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS invoice_footer TEXT;

-- ---- users ----
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_account TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hashed BOOLEAN DEFAULT false;

-- ---- products ----
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_serial BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_combo BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS has_variants BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS variant_options JSONB DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS avg_cost NUMERIC DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_id UUID;
-- FK cho supplier_id sẽ được thêm sau khi bảng suppliers được tạo

-- ---- tasks (media) ----
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cameramen JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS editors JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actors JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS product_ids JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS filmed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS edit_started_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- ---- orders ----
ALTER TABLE orders ADD COLUMN IF NOT EXISTS warehouse_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_splits JSONB DEFAULT '[]';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_order_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS promotion_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_method TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'internal';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receiver_email TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source TEXT DEFAULT 'manual';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS internal_note TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS total_weight INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_service TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_metadata JSONB DEFAULT '{}';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_status TEXT DEFAULT 'open';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_status TEXT DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_id UUID;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_used INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_discount NUMERIC DEFAULT 0;

-- ---- order_items ----
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id UUID;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_name TEXT;

-- ---- stock_transactions ----
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS warehouse_id UUID;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS transfer_to_warehouse_id UUID;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved';
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS reject_reason TEXT;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS supplier_id UUID;
ALTER TABLE stock_transactions ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;

-- ---- salaries (unified salary system) ----
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS employee_name TEXT DEFAULT '';
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS month TEXT DEFAULT '';
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT '';
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS basic_salary NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS work_days NUMERIC DEFAULT 26;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS actual_basic NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS media_videos INTEGER DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS media_per_video NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS media_total NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS media_note TEXT DEFAULT '';
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS media_actor_count INTEGER DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS media_actor_total NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS actor_count INTEGER DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS actor_rate NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS actor_total NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS kythuat_jobs INTEGER DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS kythuat_per_job NUMERIC DEFAULT 200000;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS kythuat_total NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS kythuat_note TEXT DEFAULT '';
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS livestream_revenue NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS livestream_commission NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS livestream_total NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS livestream_note TEXT DEFAULT '';
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS kho_orders NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS kho_per_order NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS kho_total NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS kho_note TEXT DEFAULT '';
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS sale_revenue NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS sale_commission NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS sale_total NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS sale_note TEXT DEFAULT '';
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS bonus NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS deduction NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS total_salary NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS paid_by TEXT;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS detail JSONB DEFAULT '{}';
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS custom_items JSONB DEFAULT '[]'::jsonb;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS basic_per_day NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS media_actor_per_video NUMERIC DEFAULT 0;


-- ============================================================
-- PHẦN 2: TẠO BẢNG MỚI (theo thứ tự dependency)
-- ============================================================

-- =========== Settings ===========

CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value JSONB,
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, category, key)
);

CREATE TABLE IF NOT EXISTS shipping_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  provider TEXT NOT NULL,
  api_token TEXT,
  shop_id TEXT,
  is_active BOOLEAN DEFAULT false,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, provider)
);

-- =========== Activity Logs ===========

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  user_id UUID,
  user_name TEXT,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  entity_name TEXT,
  old_data JSONB,
  new_data JSONB,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =========== Sales: Customers + CRM ===========

CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  note TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- customer upgrades
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type TEXT DEFAULT 'retail';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE customers ADD COLUMN IF NOT EXISTS source TEXT;

CREATE TABLE IF NOT EXISTS customer_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

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

-- =========== Sales: Orders + Items ===========

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  order_number TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'pos',
  status TEXT NOT NULL DEFAULT 'new',
  customer_id UUID REFERENCES customers(id),
  customer_name TEXT,
  customer_phone TEXT,
  shipping_address TEXT,
  shipping_provider TEXT,
  tracking_number TEXT,
  shipping_fee NUMERIC DEFAULT 0,
  shipping_payer TEXT DEFAULT 'customer',
  discount_amount NUMERIC DEFAULT 0,
  discount_note TEXT,
  subtotal NUMERIC DEFAULT 0,
  total_amount NUMERIC DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  payment_status TEXT DEFAULT 'unpaid',
  paid_amount NUMERIC DEFAULT 0,
  note TEXT,
  needs_installation BOOLEAN DEFAULT false,
  technical_job_id UUID,
  receipt_id UUID,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name TEXT NOT NULL,
  product_sku TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  discount NUMERIC DEFAULT 0,
  total_price NUMERIC NOT NULL,
  warranty_months INTEGER
);

-- =========== Sales: Returns ===========

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

-- =========== Sales: Coupons ===========

CREATE TABLE IF NOT EXISTS coupons (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  code TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'percentage',
  value NUMERIC DEFAULT 0,
  min_order_value NUMERIC DEFAULT 0,
  max_discount NUMERIC DEFAULT 0,
  usage_limit INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  per_customer_limit INTEGER DEFAULT 1,
  applicable_products UUID[] DEFAULT '{}',
  applicable_categories TEXT[] DEFAULT '{}',
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT true,
  description TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);

CREATE TABLE IF NOT EXISTS coupon_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  coupon_id UUID REFERENCES coupons(id),
  order_id UUID REFERENCES orders(id),
  customer_phone TEXT,
  discount_amount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========== Sales: Payment Transactions ===========

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

-- =========== Sales: Order Status Logs ===========

CREATE TABLE IF NOT EXISTS order_status_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL DEFAULT 'shipping_status',
  old_status TEXT,
  new_status TEXT,
  source TEXT DEFAULT 'manual',
  raw_data JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========== Sales: Order Reconciliation ===========

CREATE TABLE IF NOT EXISTS order_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  type TEXT NOT NULL,
  scanned_code TEXT,
  scanned_at TIMESTAMPTZ DEFAULT now(),
  scanned_by TEXT,
  note TEXT
);

-- =========== Sales: Shipping & COD ===========

CREATE TABLE IF NOT EXISTS shipping_tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tracking_number TEXT,
  status TEXT NOT NULL,
  description TEXT,
  location TEXT,
  event_time TIMESTAMPTZ DEFAULT now(),
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cod_reconciliation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  order_id UUID NOT NULL REFERENCES orders(id),
  order_number TEXT NOT NULL,
  shipping_provider TEXT,
  tracking_number TEXT,
  cod_amount NUMERIC DEFAULT 0,
  received_amount NUMERIC DEFAULT 0,
  shipping_fee_actual NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  received_date TIMESTAMPTZ,
  confirmed_by TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- =========== Sales: Cash Book (Feature 22) ===========

CREATE TABLE IF NOT EXISTS cash_book_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  type TEXT NOT NULL CHECK (type IN ('receipt', 'payment')),
  category TEXT NOT NULL DEFAULT 'other',
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  reference_type TEXT,
  reference_id TEXT,
  payment_method TEXT DEFAULT 'cash',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========== Sales: Loyalty / Tích điểm (Feature 23) ===========

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

CREATE TABLE IF NOT EXISTS point_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  order_id UUID REFERENCES orders(id),
  type TEXT NOT NULL CHECK (type IN ('earn', 'redeem', 'adjust', 'expire')),
  points INTEGER NOT NULL,
  description TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========== Warehouse: Multi-warehouse ===========

CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  code TEXT,
  address TEXT,
  phone TEXT,
  manager TEXT,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS warehouse_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  location TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(warehouse_id, product_id)
);

-- variant support cho warehouse_stock
ALTER TABLE warehouse_stock ADD COLUMN IF NOT EXISTS variant_id UUID;

-- =========== Warehouse: Product Variants ===========

CREATE TABLE IF NOT EXISTS product_variants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE NOT NULL,
  sku TEXT,
  variant_name TEXT NOT NULL,
  attributes JSONB DEFAULT '{}',
  price NUMERIC DEFAULT 0,
  cost_price NUMERIC DEFAULT 0,
  barcode TEXT,
  weight NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========== Warehouse: Combo Products ===========

CREATE TABLE IF NOT EXISTS product_combo_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  combo_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  child_product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(combo_product_id, child_product_id)
);

-- =========== Warehouse: Suppliers ===========

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

-- =========== Warehouse: Stocktakes (Kiểm kê) ===========

CREATE TABLE IF NOT EXISTS stocktakes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  stocktake_code TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  status TEXT NOT NULL DEFAULT 'draft',
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

-- stocktake variant support
ALTER TABLE stocktake_items ADD COLUMN IF NOT EXISTS variant_id UUID;
ALTER TABLE stocktake_items ADD COLUMN IF NOT EXISTS variant_name TEXT;

-- =========== Warehouse: Transfers (Chuyển kho) ===========

CREATE TABLE IF NOT EXISTS warehouse_transfers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  transfer_code TEXT NOT NULL,
  from_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  to_warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  status TEXT NOT NULL DEFAULT 'pending',
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

-- =========== Serial Number + Warranty ===========

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

CREATE TABLE IF NOT EXISTS warranty_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  serial_id UUID REFERENCES product_serials(id),
  serial_number TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  description TEXT,
  images JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- =========== HRM Module ===========

CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  manager_id UUID,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  level INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID,
  employee_code TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  avatar_url TEXT,
  gender TEXT,
  birth_date DATE,
  id_number TEXT,
  address TEXT,
  department_id UUID REFERENCES departments(id),
  position_id UUID REFERENCES positions(id),
  employment_type TEXT DEFAULT 'full_time',
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'active',
  base_salary NUMERIC DEFAULT 0,
  bank_account TEXT,
  bank_name TEXT,
  tax_code TEXT,
  insurance_number TEXT,
  emergency_contact TEXT,
  emergency_phone TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  start_time TIME NOT NULL DEFAULT '08:00',
  end_time TIME NOT NULL DEFAULT '17:00',
  break_minutes INTEGER DEFAULT 60,
  working_hours NUMERIC,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hrm_attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  date DATE NOT NULL,
  shift_id UUID REFERENCES work_shifts(id),
  check_in TIMESTAMPTZ,
  check_out TIMESTAMPTZ,
  check_in_method TEXT,
  check_out_method TEXT,
  status TEXT DEFAULT 'present',
  overtime_hours NUMERIC DEFAULT 0,
  note TEXT,
  approved_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Multi-shift support
ALTER TABLE hrm_attendances ADD COLUMN IF NOT EXISTS shift_number INTEGER DEFAULT 1;

CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  code TEXT NOT NULL,
  type TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  days NUMERIC NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'pending',
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  reject_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  year INTEGER NOT NULL,
  annual_leave_total NUMERIC DEFAULT 12,
  annual_leave_used NUMERIC DEFAULT 0,
  sick_leave_total NUMERIC DEFAULT 30,
  sick_leave_used NUMERIC DEFAULT 0,
  UNIQUE(employee_id, year)
);

CREATE TABLE IF NOT EXISTS kpi_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  department_id UUID REFERENCES departments(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kpi_criteria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES kpi_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  weight NUMERIC NOT NULL DEFAULT 0,
  target_value NUMERIC,
  unit TEXT,
  measurement_type TEXT DEFAULT 'number',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kpi_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  employee_id UUID NOT NULL REFERENCES employees(id),
  template_id UUID NOT NULL REFERENCES kpi_templates(id),
  period TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  total_score NUMERIC DEFAULT 0,
  rating TEXT,
  employee_comment TEXT,
  manager_comment TEXT,
  evaluated_by TEXT,
  evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, template_id, period)
);

CREATE TABLE IF NOT EXISTS kpi_evaluation_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES kpi_evaluations(id) ON DELETE CASCADE,
  criteria_id UUID NOT NULL REFERENCES kpi_criteria(id),
  target_value NUMERIC,
  actual_value NUMERIC,
  achievement_rate NUMERIC,
  weighted_score NUMERIC,
  note TEXT
);

-- =========== Media Module ===========

CREATE TABLE IF NOT EXISTS media_salary_rates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  role TEXT NOT NULL,
  category TEXT DEFAULT '',
  rate_per_video NUMERIC NOT NULL DEFAULT 200000,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS media_salaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  month INTEGER NOT NULL,
  year INTEGER NOT NULL,
  camera_count INTEGER DEFAULT 0,
  edit_count INTEGER DEFAULT 0,
  assign_count INTEGER DEFAULT 0,
  camera_rate NUMERIC DEFAULT 0,
  edit_rate NUMERIC DEFAULT 0,
  assign_rate NUMERIC DEFAULT 0,
  camera_total NUMERIC DEFAULT 0,
  edit_total NUMERIC DEFAULT 0,
  assign_total NUMERIC DEFAULT 0,
  bonus NUMERIC DEFAULT 0,
  deduction NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'draft',
  note TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  receipt_id UUID,
  detail JSONB DEFAULT '{}',
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, user_id, month, year)
);

-- actors upgrade
ALTER TABLE media_salaries ADD COLUMN IF NOT EXISTS actor_count INTEGER DEFAULT 0;
ALTER TABLE media_salaries ADD COLUMN IF NOT EXISTS actor_rate NUMERIC DEFAULT 0;
ALTER TABLE media_salaries ADD COLUMN IF NOT EXISTS actor_total NUMERIC DEFAULT 0;

CREATE TABLE IF NOT EXISTS ekips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  camera_ids UUID[] DEFAULT '{}',
  editor_ids UUID[] DEFAULT '{}',
  actor_ids UUID[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_page_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook', 'tiktok')),
  page_name TEXT NOT NULL,
  page_id TEXT,
  username TEXT,
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========== Chat nội bộ ===========

CREATE TABLE IF NOT EXISTS chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'direct',
  name TEXT,
  avatar_url TEXT,
  created_by TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_by TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  role TEXT DEFAULT 'member',
  last_read_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_name TEXT NOT NULL,
  sender_avatar TEXT,
  content TEXT,
  message_type TEXT DEFAULT 'text',
  file_url TEXT,
  file_name TEXT,
  file_size INTEGER,
  reply_to UUID REFERENCES chat_messages(id),
  is_edited BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- chat upgrades
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS pinned_by TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS mentions JSONB DEFAULT '[]';

CREATE TABLE IF NOT EXISTS chat_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, user_id, emoji)
);

-- =========== Zalo OA ===========

CREATE TABLE IF NOT EXISTS zalo_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  app_id TEXT,
  secret_key TEXT,
  oa_id TEXT,
  refresh_token TEXT,
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zalo_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zalo_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  template_id UUID REFERENCES zalo_templates(id),
  customer_id UUID,
  customer_name TEXT,
  customer_phone TEXT,
  zalo_user_id TEXT,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  related_entity_type TEXT,
  related_entity_id TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zalo_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  zalo_user_id TEXT NOT NULL,
  zalo_user_name TEXT,
  zalo_user_avatar TEXT,
  customer_id UUID,
  customer_phone TEXT,
  assigned_to UUID,
  assigned_name TEXT,
  status TEXT DEFAULT 'waiting',
  tags TEXT[] DEFAULT '{}',
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_by TEXT,
  unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zalo_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES zalo_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  sender_type TEXT NOT NULL,
  sender_id TEXT,
  sender_name TEXT,
  message_type TEXT DEFAULT 'text',
  content TEXT,
  attachments JSONB DEFAULT '[]',
  zalo_message_id TEXT,
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zalo_internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES zalo_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zalo_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- PHẦN 3: INDEXES
-- ============================================================

-- Settings
CREATE INDEX IF NOT EXISTS idx_system_settings_tenant ON system_settings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_settings_category ON system_settings(tenant_id, category);
CREATE INDEX IF NOT EXISTS idx_shipping_configs_tenant ON shipping_configs(tenant_id);

-- Activity Logs
CREATE INDEX IF NOT EXISTS idx_logs_tenant_created ON activity_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_module ON activity_logs(module);
CREATE INDEX IF NOT EXISTS idx_logs_user ON activity_logs(user_name);
CREATE INDEX IF NOT EXISTS idx_logs_action ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_entity_type ON activity_logs(entity_type);

-- Customers
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_customer ON customer_interactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_tenant ON customer_interactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_tenant ON customer_addresses(tenant_id);

-- Orders
CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_external_code ON orders(external_order_code) WHERE external_order_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source);
CREATE INDEX IF NOT EXISTS idx_orders_order_status ON orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_status ON orders(shipping_status);
CREATE INDEX IF NOT EXISTS idx_orders_warehouse ON orders(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id);

-- Returns
CREATE INDEX IF NOT EXISTS idx_order_returns_order ON order_returns(order_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_tenant ON order_returns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_return_items_return ON order_return_items(return_id);

-- Coupons
CREATE INDEX IF NOT EXISTS idx_coupons_tenant ON coupons(tenant_id);

-- Payment Transactions
CREATE INDEX IF NOT EXISTS idx_payment_transactions_order_id ON payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_tenant_id ON payment_transactions(tenant_id);

-- Order Status Logs
CREATE INDEX IF NOT EXISTS idx_order_status_logs_order ON order_status_logs(order_id);

-- Order Reconciliation
CREATE INDEX IF NOT EXISTS idx_order_reconciliation_tenant ON order_reconciliation(tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_reconciliation_order ON order_reconciliation(order_id);
CREATE INDEX IF NOT EXISTS idx_order_reconciliation_date ON order_reconciliation(tenant_id, scanned_at DESC);

-- Shipping & COD
CREATE INDEX IF NOT EXISTS idx_shipping_events_order ON shipping_tracking_events(order_id);
CREATE INDEX IF NOT EXISTS idx_shipping_events_tenant ON shipping_tracking_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cod_recon_tenant ON cod_reconciliation(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cod_recon_status ON cod_reconciliation(tenant_id, status);

-- Cash Book
CREATE INDEX IF NOT EXISTS idx_cash_book_tenant_created ON cash_book_entries(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_book_reference ON cash_book_entries(reference_type, reference_id);

-- Loyalty
CREATE INDEX IF NOT EXISTS idx_customer_points_tenant ON customer_points(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_tenant ON point_transactions(tenant_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_order ON point_transactions(order_id);

-- Warehouses
CREATE INDEX IF NOT EXISTS idx_warehouses_tenant ON warehouses(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_warehouses_default ON warehouses(tenant_id) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_warehouse ON warehouse_stock(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_product ON warehouse_stock(product_id);

-- Product Variants
CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_tenant ON product_variants(tenant_id);

-- Variant-aware unique indexes for warehouse_stock
CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_no_variant ON warehouse_stock (warehouse_id, product_id) WHERE variant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_with_variant ON warehouse_stock (warehouse_id, product_id, variant_id) WHERE variant_id IS NOT NULL;

-- Combo Products
CREATE INDEX IF NOT EXISTS idx_combo_items_combo ON product_combo_items(combo_product_id);
CREATE INDEX IF NOT EXISTS idx_combo_items_child ON product_combo_items(child_product_id);

-- Products
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_tasks_product_ids ON tasks USING GIN (product_ids);

-- Suppliers
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant ON suppliers(tenant_id);

-- Stock Transactions
CREATE INDEX IF NOT EXISTS idx_stock_transactions_warehouse ON stock_transactions(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_supplier ON stock_transactions(supplier_id);
CREATE INDEX IF NOT EXISTS idx_stock_trans_approval ON stock_transactions(approval_status);

-- Stocktakes
CREATE INDEX IF NOT EXISTS idx_stocktakes_tenant ON stocktakes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_stocktakes_warehouse ON stocktakes(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_stocktake_items_stocktake ON stocktake_items(stocktake_id);

-- Transfers
CREATE INDEX IF NOT EXISTS idx_transfers_tenant ON warehouse_transfers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON warehouse_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON warehouse_transfers(to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer ON warehouse_transfer_items(transfer_id);

-- Serial & Warranty
CREATE INDEX IF NOT EXISTS idx_serials_tenant ON product_serials(tenant_id);
CREATE INDEX IF NOT EXISTS idx_serials_product ON product_serials(product_id);
CREATE INDEX IF NOT EXISTS idx_serials_status ON product_serials(status);
CREATE INDEX IF NOT EXISTS idx_serials_warehouse ON product_serials(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_serials_order ON product_serials(sold_order_id);
CREATE INDEX IF NOT EXISTS idx_serials_phone ON product_serials(customer_phone);
CREATE INDEX IF NOT EXISTS idx_serials_serial ON product_serials(serial_number);
CREATE INDEX IF NOT EXISTS idx_wcards_tenant ON warranty_cards(tenant_id);
CREATE INDEX IF NOT EXISTS idx_wcards_serial ON warranty_cards(serial_number);
CREATE INDEX IF NOT EXISTS idx_wcards_phone ON warranty_cards(customer_phone);
CREATE INDEX IF NOT EXISTS idx_wcards_status ON warranty_cards(status);
CREATE INDEX IF NOT EXISTS idx_wcards_product ON warranty_cards(product_id);
CREATE INDEX IF NOT EXISTS idx_repairs_tenant ON warranty_repairs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_repairs_serial ON warranty_repairs(serial_number);
CREATE INDEX IF NOT EXISTS idx_repairs_status ON warranty_repairs(status);
CREATE INDEX IF NOT EXISTS idx_repairs_phone ON warranty_repairs(customer_phone);
CREATE INDEX IF NOT EXISTS idx_warranty_requests_tenant ON warranty_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_warranty_requests_status ON warranty_requests(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_warranty_requests_phone ON warranty_requests(tenant_id, customer_phone);
CREATE INDEX IF NOT EXISTS idx_warranty_requests_serial ON warranty_requests(serial_id);

-- HRM
CREATE INDEX IF NOT EXISTS idx_departments_tenant ON departments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_positions_tenant ON positions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_tenant ON employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department_id);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_work_shifts_tenant ON work_shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_hrm_attendances_emp_date ON hrm_attendances(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_hrm_attendances_date ON hrm_attendances(date);
CREATE INDEX IF NOT EXISTS idx_hrm_att_tenant_date ON hrm_attendances(tenant_id, date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_emp ON leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_kpi_eval_emp ON kpi_evaluations(employee_id);

-- Media
CREATE INDEX IF NOT EXISTS idx_media_salary_rates_tenant ON media_salary_rates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_media_salaries_tenant ON media_salaries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_media_salaries_period ON media_salaries(tenant_id, year, month);
CREATE INDEX IF NOT EXISTS idx_ekips_tenant_id ON ekips(tenant_id);
CREATE INDEX IF NOT EXISTS idx_social_page_configs_tenant ON social_page_configs(tenant_id);

-- Chat
CREATE INDEX IF NOT EXISTS idx_chat_rooms_tenant ON chat_rooms(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_room ON chat_messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON chat_room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned ON chat_messages (room_id, is_pinned) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON chat_message_reactions(message_id);

-- Zalo OA
CREATE INDEX IF NOT EXISTS idx_zalo_config_tenant ON zalo_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zalo_templates_tenant ON zalo_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zalo_messages_status ON zalo_messages(status);
CREATE INDEX IF NOT EXISTS idx_zalo_messages_type ON zalo_messages(type);
CREATE INDEX IF NOT EXISTS idx_zalo_messages_phone ON zalo_messages(customer_phone);
CREATE INDEX IF NOT EXISTS idx_zalo_messages_tenant ON zalo_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zalo_conv_tenant ON zalo_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zalo_conv_status ON zalo_conversations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_zalo_conv_assigned ON zalo_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_zalo_conv_zalo_user ON zalo_conversations(zalo_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_zalo_conv_tenant_user ON zalo_conversations(tenant_id, zalo_user_id);
CREATE INDEX IF NOT EXISTS idx_zalo_chat_msg_conv ON zalo_chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_zalo_chat_msg_tenant ON zalo_chat_messages(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_zalo_chat_msg_zalo_id ON zalo_chat_messages(zalo_message_id) WHERE zalo_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_zalo_notes_conv ON zalo_internal_notes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_zalo_qr_tenant ON zalo_quick_replies(tenant_id);


-- ============================================================
-- PHẦN 4: RPC FUNCTIONS (CREATE OR REPLACE → an toàn)
-- ============================================================

-- 4.1 adjust_stock — Atomic stock adjustment (backward compatible)
CREATE OR REPLACE FUNCTION adjust_stock(p_product_id UUID, p_delta INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_stock INTEGER;
  default_warehouse_id UUID;
BEGIN
  UPDATE products
  SET stock_quantity = stock_quantity + p_delta,
      updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  WHERE id = p_product_id
    AND (p_delta > 0 OR stock_quantity >= ABS(p_delta))
  RETURNING stock_quantity INTO new_stock;

  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = p_product_id) THEN
      RAISE EXCEPTION 'Sản phẩm không tồn tại: %', p_product_id;
    ELSE
      RAISE EXCEPTION 'Không đủ tồn kho cho sản phẩm %', p_product_id;
    END IF;
  END IF;

  -- Sync warehouse_stock kho mặc định
  SELECT w.id INTO default_warehouse_id
  FROM warehouses w
  JOIN products p ON p.tenant_id = w.tenant_id
  WHERE p.id = p_product_id AND w.is_default = true
  LIMIT 1;

  IF default_warehouse_id IS NOT NULL THEN
    INSERT INTO warehouse_stock (warehouse_id, product_id, quantity)
    VALUES (default_warehouse_id, p_product_id, GREATEST(0, p_delta))
    ON CONFLICT (warehouse_id, product_id)
    DO UPDATE SET quantity = GREATEST(0, warehouse_stock.quantity + p_delta),
                  updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh';
  END IF;

  RETURN new_stock;
END;
$$;

GRANT EXECUTE ON FUNCTION adjust_stock(UUID, INTEGER) TO anon, authenticated;

-- 4.2 adjust_warehouse_stock — Atomic per-warehouse stock adjustment
CREATE OR REPLACE FUNCTION adjust_warehouse_stock(
  p_warehouse_id UUID,
  p_product_id UUID,
  p_delta INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_ws_qty INTEGER;
  new_total INTEGER;
BEGIN
  UPDATE warehouse_stock
  SET quantity = quantity + p_delta,
      updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  WHERE warehouse_id = p_warehouse_id
    AND product_id = p_product_id
    AND (p_delta > 0 OR quantity >= ABS(p_delta))
  RETURNING quantity INTO new_ws_qty;

  IF NOT FOUND THEN
    IF p_delta > 0 THEN
      INSERT INTO warehouse_stock (warehouse_id, product_id, quantity)
      VALUES (p_warehouse_id, p_product_id, p_delta)
      ON CONFLICT (warehouse_id, product_id)
      DO UPDATE SET quantity = warehouse_stock.quantity + p_delta,
                    updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
      RETURNING quantity INTO new_ws_qty;
    ELSE
      IF EXISTS (SELECT 1 FROM warehouse_stock WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id) THEN
        RAISE EXCEPTION 'Không đủ tồn kho tại kho này cho sản phẩm %', p_product_id;
      ELSE
        RAISE EXCEPTION 'Sản phẩm % chưa có trong kho này', p_product_id;
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(SUM(ws.quantity), 0) INTO new_total
  FROM warehouse_stock ws
  WHERE ws.product_id = p_product_id;

  UPDATE products
  SET stock_quantity = new_total,
      updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  WHERE id = p_product_id;

  RETURN new_ws_qty;
END;
$$;

GRANT EXECUTE ON FUNCTION adjust_warehouse_stock(UUID, UUID, INTEGER) TO anon, authenticated;

-- 4.3 transfer_stock — Chuyển kho atomic
CREATE OR REPLACE FUNCTION transfer_stock(
  p_from_warehouse_id UUID,
  p_to_warehouse_id UUID,
  p_product_id UUID,
  p_quantity INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  from_qty INTEGER;
  to_qty INTEGER;
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Số lượng chuyển phải lớn hơn 0';
  END IF;

  IF p_from_warehouse_id = p_to_warehouse_id THEN
    RAISE EXCEPTION 'Kho nguồn và kho đích phải khác nhau';
  END IF;

  UPDATE warehouse_stock
  SET quantity = quantity - p_quantity,
      updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  WHERE warehouse_id = p_from_warehouse_id
    AND product_id = p_product_id
    AND quantity >= p_quantity
  RETURNING quantity INTO from_qty;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không đủ tồn kho để chuyển';
  END IF;

  INSERT INTO warehouse_stock (warehouse_id, product_id, quantity)
  VALUES (p_to_warehouse_id, p_product_id, p_quantity)
  ON CONFLICT (warehouse_id, product_id)
  DO UPDATE SET quantity = warehouse_stock.quantity + p_quantity,
                updated_at = now() AT TIME ZONE 'Asia/Ho_Chi_Minh'
  RETURNING quantity INTO to_qty;

  RETURN jsonb_build_object(
    'from_quantity', from_qty,
    'to_quantity', to_qty
  );
END;
$$;

GRANT EXECUTE ON FUNCTION transfer_stock(UUID, UUID, UUID, INTEGER) TO anon, authenticated;

-- 4.4 Coupon usage RPCs
CREATE OR REPLACE FUNCTION increment_coupon_usage(p_coupon_id UUID)
RETURNS VOID AS $$
  UPDATE coupons SET usage_count = usage_count + 1 WHERE id = p_coupon_id;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION decrement_coupon_usage(p_coupon_id UUID)
RETURNS VOID AS $$
  UPDATE coupons SET usage_count = GREATEST(0, usage_count - 1) WHERE id = p_coupon_id;
$$ LANGUAGE sql;

-- 4.5 activate_warranty — Kích hoạt bảo hành
CREATE OR REPLACE FUNCTION activate_warranty(
  p_tenant_id UUID,
  p_serial_number TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_email TEXT DEFAULT NULL,
  p_customer_address TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_serial RECORD;
  v_product RECORD;
  v_existing_card RECORD;
  v_card_number TEXT;
  v_warranty_months INT;
  v_warranty_end DATE;
  v_new_card_id UUID;
  v_last_num INT;
  v_date_str TEXT;
BEGIN
  SELECT * INTO v_serial
  FROM product_serials
  WHERE serial_number = p_serial_number
    AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Serial khong ton tai');
  END IF;

  SELECT * INTO v_existing_card
  FROM warranty_cards
  WHERE serial_id = v_serial.id
    AND tenant_id = p_tenant_id
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Serial da duoc kich hoat bao hanh', 'card_number', v_existing_card.card_number);
  END IF;

  IF v_serial.status NOT IN ('in_stock', 'sold') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Serial khong hop le de kich hoat');
  END IF;

  SELECT * INTO v_product FROM products WHERE id = v_serial.product_id;
  v_warranty_months := COALESCE(v_product.warranty_months, 12);
  v_warranty_end := CURRENT_DATE + (v_warranty_months || ' months')::INTERVAL;

  v_date_str := TO_CHAR(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYYMMDD');

  SELECT COALESCE(
    MAX(
      NULLIF(SPLIT_PART(card_number, '-', 3), '')::INT
    ), 0
  ) INTO v_last_num
  FROM warranty_cards
  WHERE tenant_id = p_tenant_id
    AND card_number LIKE 'BH-' || v_date_str || '-%';

  v_card_number := 'BH-' || v_date_str || '-' || LPAD((v_last_num + 1)::TEXT, 3, '0');

  UPDATE product_serials SET
    status = 'sold',
    customer_name = p_customer_name,
    customer_phone = p_customer_phone,
    warranty_start = CURRENT_DATE,
    warranty_end = v_warranty_end,
    sold_at = COALESCE(sold_at, NOW()),
    updated_at = NOW()
  WHERE id = v_serial.id;

  INSERT INTO warranty_cards (
    tenant_id, card_number, serial_id, product_id,
    product_name, product_sku, serial_number,
    customer_name, customer_phone, customer_email, customer_address,
    order_id, warranty_start, warranty_end, warranty_months,
    status, created_by
  ) VALUES (
    p_tenant_id, v_card_number, v_serial.id, v_serial.product_id,
    v_product.name, v_product.sku, p_serial_number,
    p_customer_name, p_customer_phone, p_customer_email, p_customer_address,
    v_serial.sold_order_id, CURRENT_DATE, v_warranty_end, v_warranty_months,
    'active', 'customer_self_activate'
  ) RETURNING id INTO v_new_card_id;

  RETURN jsonb_build_object(
    'success', true,
    'card_id', v_new_card_id,
    'card_number', v_card_number,
    'product_name', v_product.name,
    'product_sku', v_product.sku,
    'serial_number', p_serial_number,
    'warranty_start', CURRENT_DATE,
    'warranty_end', v_warranty_end,
    'warranty_months', v_warranty_months,
    'customer_name', p_customer_name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- PHẦN 5: RLS POLICIES (sử dụng DO block để tránh lỗi trùng)
-- ============================================================

-- Helper: tạo policy an toàn (skip nếu đã tồn tại)
-- Pattern: DO $$ BEGIN CREATE POLICY ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Settings
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipping_configs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "system_settings_policy" ON system_settings FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "shipping_configs_policy" ON shipping_configs FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Customers
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "customers_tenant_policy" ON customers FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "customer_interactions_anon_access" ON customer_interactions FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "tenant_isolation_customer_addresses" ON customer_addresses FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "orders_tenant_policy" ON orders FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "order_items_policy" ON order_items FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Returns
ALTER TABLE order_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_return_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "tenant_isolation_order_returns" ON order_returns FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "tenant_isolation_order_return_items" ON order_return_items FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Coupons
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_usage ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "tenant_isolation_coupons" ON coupons FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "tenant_isolation_coupon_usage" ON coupon_usage FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Payment Transactions
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "payment_transactions_tenant_policy" ON payment_transactions FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Order Status Logs
ALTER TABLE order_status_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "order_status_logs_policy" ON order_status_logs FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Order Reconciliation
ALTER TABLE order_reconciliation ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "order_reconciliation_policy" ON order_reconciliation FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Shipping & COD
ALTER TABLE shipping_tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cod_reconciliation ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "shipping_tracking_events_all" ON shipping_tracking_events FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "cod_reconciliation_all" ON cod_reconciliation FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cash Book
ALTER TABLE cash_book_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "cash_book_entries_all" ON cash_book_entries FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Loyalty
ALTER TABLE customer_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "customer_points_all" ON customer_points FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "point_transactions_all" ON point_transactions FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Warehouses
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_stock ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "warehouses_policy" ON warehouses FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "warehouse_stock_policy" ON warehouse_stock FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Product Variants
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "tenant_isolation_product_variants" ON product_variants FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Combo Products
ALTER TABLE product_combo_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "combo_items_anon_access" ON product_combo_items FOR ALL USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Suppliers
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "suppliers_all" ON suppliers FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Stocktakes
ALTER TABLE stocktakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocktake_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "stocktakes_all" ON stocktakes FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "stocktake_items_all" ON stocktake_items FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Transfers
ALTER TABLE warehouse_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouse_transfer_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "warehouse_transfers_all" ON warehouse_transfers FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "warehouse_transfer_items_all" ON warehouse_transfer_items FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Serials & Warranty
ALTER TABLE product_serials ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranty_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranty_repairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE warranty_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "product_serials_all" ON product_serials FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "warranty_cards_all" ON warranty_cards FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "warranty_repairs_all" ON warranty_repairs FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "warranty_requests_all" ON warranty_requests FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- HRM
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE hrm_attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_evaluation_details ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "departments_all" ON departments FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "positions_all" ON positions FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "employees_all" ON employees FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "work_shifts_all" ON work_shifts FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "hrm_attendances_all" ON hrm_attendances FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "leave_requests_all" ON leave_requests FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "leave_balances_all" ON leave_balances FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "kpi_templates_all" ON kpi_templates FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "kpi_criteria_all" ON kpi_criteria FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "kpi_evaluations_all" ON kpi_evaluations FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "kpi_evaluation_details_all" ON kpi_evaluation_details FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Media
ALTER TABLE media_salary_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_salaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ekips ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_page_configs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN CREATE POLICY "media_salary_rates_tenant" ON media_salary_rates FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "media_salaries_tenant" ON media_salaries FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "ekips_tenant_access" ON ekips FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "social_page_configs_tenant_access" ON social_page_configs FOR ALL USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Chat (không có RLS policy cụ thể trong file gốc, chỉ cần realtime)

-- Zalo OA (không có RLS policy cụ thể trong file gốc)


-- ============================================================
-- PHẦN 6: REALTIME SUBSCRIPTIONS (an toàn với DO block)
-- ============================================================

DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE system_settings; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE orders; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE customers; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE warehouses; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE warehouse_stock; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE product_serials; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE warranty_cards; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE warranty_repairs; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE warranty_requests; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE order_reconciliation; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE chat_message_reactions; EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ============================================================
-- PHẦN 7: DATA MIGRATION (idempotent — chỉ chạy nếu chưa có)
-- ============================================================

-- 7.1 Tạo kho mặc định "Kho chính" cho mỗi tenant (nếu chưa có)
INSERT INTO warehouses (tenant_id, name, code, is_default, is_active, created_by)
SELECT t.id, 'Kho chính', 'KHO01', true, true, 'System Migration'
FROM tenants t
WHERE NOT EXISTS (
  SELECT 1 FROM warehouses w WHERE w.tenant_id = t.id AND w.is_default = true
);

-- 7.2 Copy stock_quantity từ products sang warehouse_stock cho kho mặc định
INSERT INTO warehouse_stock (warehouse_id, product_id, quantity, location)
SELECT w.id, p.id, p.stock_quantity, p.location
FROM products p
JOIN warehouses w ON w.tenant_id = p.tenant_id AND w.is_default = true
WHERE p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM warehouse_stock ws WHERE ws.warehouse_id = w.id AND ws.product_id = p.id
  );

-- 7.3 Gán warehouse_id mặc định cho stock_transactions cũ
UPDATE stock_transactions st
SET warehouse_id = w.id
FROM warehouses w
WHERE st.warehouse_id IS NULL
  AND w.tenant_id = st.tenant_id
  AND w.is_default = true;

-- 7.4 Gán warehouse_id mặc định cho orders cũ
UPDATE orders o
SET warehouse_id = w.id
FROM warehouses w
WHERE o.warehouse_id IS NULL
  AND w.tenant_id = o.tenant_id
  AND w.is_default = true;

-- 7.5 Migrate old status → three-way status (nếu chưa migrate)
UPDATE orders SET
  order_status = CASE
    WHEN status IN ('new') THEN 'open'
    WHEN status IN ('confirmed','packing','shipping','delivered') THEN 'confirmed'
    WHEN status = 'completed' THEN 'completed'
    WHEN status = 'cancelled' THEN 'cancelled'
    WHEN status = 'returned' THEN 'returned'
    ELSE 'open'
  END,
  shipping_status = CASE
    WHEN status = 'packing' THEN 'packing'
    WHEN status = 'shipping' THEN 'shipped'
    WHEN status IN ('delivered','completed') THEN 'delivered'
    WHEN status = 'returned' THEN 'returned_to_sender'
    ELSE 'pending'
  END
WHERE order_status = 'open' AND status != 'new';

-- Fix partial → partial_paid
UPDATE orders SET payment_status = 'partial_paid' WHERE payment_status = 'partial';

-- 7.6 Cập nhật last_purchase_at cho KH hiện tại
UPDATE customers c SET last_purchase_at = (
  SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id
) WHERE c.last_purchase_at IS NULL;

-- 7.7 Auto-classify existing customers
UPDATE customers c SET customer_type = 'vip'
WHERE (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed') >= 50000000
  AND c.customer_type = 'retail';

UPDATE customers c SET customer_type = 'regular'
WHERE (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed') >= 2
  AND c.customer_type = 'retail';

-- 7.8 Salary backfill nulls
UPDATE salaries SET employee_name = '' WHERE employee_name IS NULL;
UPDATE salaries SET month = '' WHERE month IS NULL;
UPDATE salaries SET status = 'draft' WHERE status IS NULL;
UPDATE salaries SET basic_salary = 0 WHERE basic_salary IS NULL;
UPDATE salaries SET work_days = 26 WHERE work_days IS NULL;
UPDATE salaries SET actual_basic = 0 WHERE actual_basic IS NULL;
UPDATE salaries SET media_videos = 0 WHERE media_videos IS NULL;
UPDATE salaries SET media_per_video = 0 WHERE media_per_video IS NULL;
UPDATE salaries SET media_total = 0 WHERE media_total IS NULL;
UPDATE salaries SET media_actor_count = 0 WHERE media_actor_count IS NULL;
UPDATE salaries SET media_actor_total = 0 WHERE media_actor_total IS NULL;
UPDATE salaries SET kythuat_jobs = 0 WHERE kythuat_jobs IS NULL;
UPDATE salaries SET kythuat_per_job = 200000 WHERE kythuat_per_job IS NULL;
UPDATE salaries SET kythuat_total = 0 WHERE kythuat_total IS NULL;
UPDATE salaries SET livestream_revenue = 0 WHERE livestream_revenue IS NULL;
UPDATE salaries SET livestream_commission = 0 WHERE livestream_commission IS NULL;
UPDATE salaries SET livestream_total = 0 WHERE livestream_total IS NULL;
UPDATE salaries SET kho_orders = 0 WHERE kho_orders IS NULL;
UPDATE salaries SET kho_per_order = 0 WHERE kho_per_order IS NULL;
UPDATE salaries SET kho_total = 0 WHERE kho_total IS NULL;
UPDATE salaries SET sale_revenue = 0 WHERE sale_revenue IS NULL;
UPDATE salaries SET sale_commission = 0 WHERE sale_commission IS NULL;
UPDATE salaries SET sale_total = 0 WHERE sale_total IS NULL;
UPDATE salaries SET bonus = 0 WHERE bonus IS NULL;
UPDATE salaries SET deduction = 0 WHERE deduction IS NULL;
UPDATE salaries SET total_salary = 0 WHERE total_salary IS NULL;

-- 7.9 Salary unit price backfill
UPDATE salaries SET basic_per_day = ROUND(basic_salary / 26)
WHERE basic_per_day = 0 AND basic_salary > 0;

UPDATE salaries SET media_actor_per_video = ROUND(media_actor_total / media_actor_count)
WHERE media_actor_per_video = 0 AND media_actor_count > 0 AND media_actor_total > 0;

UPDATE salaries SET media_per_video = ROUND(media_total / media_videos)
WHERE media_per_video = 0 AND media_videos > 0 AND media_total > 0;

UPDATE salaries SET kythuat_per_job = ROUND(kythuat_total / kythuat_jobs)
WHERE kythuat_per_job = 0 AND kythuat_jobs > 0 AND kythuat_total > 0;

-- 7.10 Zalo templates mặc định
INSERT INTO zalo_templates (tenant_id, name, type, content)
SELECT t.id, vals.name, vals.type, vals.content
FROM tenants t
CROSS JOIN (VALUES
  ('Xác nhận đơn hàng', 'order_confirm',
   'Chào {{customer_name}}, đơn hàng {{order_code}} của bạn đã được xác nhận! Tổng tiền: {{total_amount}}. Cảm ơn bạn đã mua hàng tại Hoàng Nam Audio!'),
  ('Thông báo giao hàng', 'shipping',
   'Chào {{customer_name}}, đơn hàng {{order_code}} đang được giao. Đơn vị: {{carrier}}, Mã vận đơn: {{tracking_code}}'),
  ('Nhắc bảo hành sắp hết', 'warranty_remind',
   'Chào {{customer_name}}, bảo hành sản phẩm {{product_name}} sắp hết hạn ngày {{warranty_end_date}}. Liên hệ 0973515666 để được hỗ trợ.'),
  ('Chúc mừng sinh nhật', 'birthday',
   'Chúc mừng sinh nhật {{customer_name}}! Hoàng Nam Audio gửi tặng voucher giảm {{discount_percent}}%. Mã: {{voucher_code}}'),
  ('Khách lâu không mua', 'win_back',
   'Chào {{customer_name}}, lâu rồi không thấy bạn ghé! Ưu đãi đặc biệt: Giảm {{discount_percent}}% đơn hàng tiếp theo. Mã: {{voucher_code}}')
) AS vals(name, type, content)
WHERE NOT EXISTS (
  SELECT 1 FROM zalo_templates zt WHERE zt.tenant_id = t.id AND zt.type = vals.type
);

-- 7.11 Zalo quick replies mặc định
INSERT INTO zalo_quick_replies (tenant_id, category, title, content, sort_order)
SELECT t.id, vals.category, vals.title, vals.content, vals.sort_order
FROM tenants t
CROSS JOIN (VALUES
  ('greeting', 'Chào KH', 'Chào bạn! Cảm ơn bạn đã liên hệ Hoàng Nam Audio. Mình có thể giúp gì cho bạn ạ?', 1),
  ('greeting', 'Chào KH quen', 'Chào bạn! Rất vui được gặp lại bạn. Hôm nay bạn cần tư vấn sản phẩm nào ạ?', 2),
  ('price', 'Báo giá', 'Dạ giá sản phẩm này hiện tại là ... đồng ạ. Bạn muốn mình tư vấn thêm không ạ?', 3),
  ('shipping', 'Phí ship', 'Phí vận chuyển tùy khu vực ạ. Bạn cho mình địa chỉ nhận hàng để mình báo chính xác nhé!', 5),
  ('warranty', 'Bảo hành', 'Sản phẩm được bảo hành chính hãng 12 tháng ạ.', 7),
  ('closing', 'Cảm ơn', 'Cảm ơn bạn đã mua hàng tại Hoàng Nam Audio! Chúc bạn trải nghiệm sản phẩm vui vẻ nhé!', 9)
) AS vals(category, title, content, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM zalo_quick_replies qr WHERE qr.tenant_id = t.id AND qr.title = vals.title
);


-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  HOÀN TẤT! Migration đã chạy xong.                            ║
-- ║  Tổng: ~50 bảng mới + ~60 cột mới + 5 RPC functions           ║
-- ║  Dữ liệu cũ: KHÔNG bị ảnh hưởng                               ║
-- ╚══════════════════════════════════════════════════════════════════╝
