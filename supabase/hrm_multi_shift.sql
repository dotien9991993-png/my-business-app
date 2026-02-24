-- Migration: Cho phép chấm công nhiều ca trong 1 ngày
-- Drop UNIQUE constraint (employee_id, date) → cho phép nhiều record/ngày/NV

-- 1. Drop unique constraint
ALTER TABLE hrm_attendances DROP CONSTRAINT IF EXISTS hrm_attendances_employee_id_date_key;

-- 2. Thêm cột shift_number (ca số mấy)
ALTER TABLE hrm_attendances ADD COLUMN IF NOT EXISTS shift_number INTEGER DEFAULT 1;

-- 3. Index mới cho query theo employee + date (không unique)
CREATE INDEX IF NOT EXISTS idx_hrm_att_emp_date ON hrm_attendances(employee_id, date);
CREATE INDEX IF NOT EXISTS idx_hrm_att_tenant_date ON hrm_attendances(tenant_id, date);
