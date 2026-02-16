-- ============================================
-- Media Module Upgrade - Database Migration
-- Chạy thủ công trên Supabase Dashboard > SQL Editor
-- ============================================

-- 1A. Thêm cột vào bảng tasks (KHÔNG xóa/sửa cột cũ)
-- Cameramen & Editors (JSONB arrays, giống pattern technicians trong technical_jobs)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS cameramen JSONB DEFAULT '[]';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS editors JSONB DEFAULT '[]';

-- Timeline tracking
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS filmed_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS edit_started_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 1B. Bảng mới: media_salary_rates (đơn giá theo vai trò)
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
CREATE INDEX IF NOT EXISTS idx_media_salary_rates_tenant ON media_salary_rates(tenant_id);

-- 1C. Bảng mới: media_salaries (bảng lương media hàng tháng)
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
CREATE INDEX IF NOT EXISTS idx_media_salaries_tenant ON media_salaries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_media_salaries_period ON media_salaries(tenant_id, year, month);

-- Enable RLS
ALTER TABLE media_salary_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_salaries ENABLE ROW LEVEL SECURITY;

-- RLS policies (cho phép authenticated users truy cập theo tenant)
CREATE POLICY "media_salary_rates_tenant" ON media_salary_rates
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "media_salaries_tenant" ON media_salaries
  FOR ALL USING (true) WITH CHECK (true);
