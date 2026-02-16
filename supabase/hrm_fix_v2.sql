-- =============================================
-- HRM Fix V2: Sửa lỗi kiểu dữ liệu INTEGER vs UUID
-- =============================================
-- NGUYÊN NHÂN: Bảng employees cũ có id kiểu INTEGER (SERIAL)
-- nhưng các bảng HRM mới cần employee_id UUID.
--
-- GIẢI PHÁP: Drop toàn bộ bảng HRM rồi tạo lại đồng bộ UUID.
-- ⚠️ CHỈ CHẠY NẾU các bảng HRM chưa có data quan trọng!
--
-- BƯỚC 0: Kiểm tra trước khi chạy (chạy riêng dòng này để xem):
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name = 'employees' ORDER BY ordinal_position;
-- =============================================

-- BƯỚC 1: Drop tất cả bảng HRM theo thứ tự phụ thuộc (con trước, cha sau)
DROP TABLE IF EXISTS kpi_evaluation_details CASCADE;
DROP TABLE IF EXISTS kpi_evaluations CASCADE;
DROP TABLE IF EXISTS kpi_criteria CASCADE;
DROP TABLE IF EXISTS kpi_templates CASCADE;
DROP TABLE IF EXISTS leave_balances CASCADE;
DROP TABLE IF EXISTS leave_requests CASCADE;
DROP TABLE IF EXISTS hrm_attendances CASCADE;
DROP TABLE IF EXISTS work_shifts CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS positions CASCADE;
DROP TABLE IF EXISTS departments CASCADE;

-- BƯỚC 2: Tạo lại toàn bộ với UUID nhất quán

-- Phòng ban
CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  manager_id UUID,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Chức vụ
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  level INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Nhân viên
CREATE TABLE employees (
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
  start_date DATE NOT NULL,
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

-- Ca làm việc
CREATE TABLE work_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INTEGER DEFAULT 60,
  working_hours NUMERIC,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Chấm công nhân sự
CREATE TABLE hrm_attendances (
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
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- Đơn từ
CREATE TABLE leave_requests (
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

-- Phép năm
CREATE TABLE leave_balances (
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

-- Mẫu KPI
CREATE TABLE kpi_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name TEXT NOT NULL,
  department_id UUID REFERENCES departments(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tiêu chí KPI
CREATE TABLE kpi_criteria (
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

-- Đánh giá KPI
CREATE TABLE kpi_evaluations (
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

-- Chi tiết đánh giá KPI
CREATE TABLE kpi_evaluation_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id UUID NOT NULL REFERENCES kpi_evaluations(id) ON DELETE CASCADE,
  criteria_id UUID NOT NULL REFERENCES kpi_criteria(id),
  target_value NUMERIC,
  actual_value NUMERIC,
  achievement_rate NUMERIC,
  weighted_score NUMERIC,
  note TEXT
);

-- BƯỚC 3: Indexes
CREATE INDEX idx_employees_tenant ON employees(tenant_id);
CREATE INDEX idx_employees_dept ON employees(department_id);
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_employees_user_id ON employees(user_id);
CREATE INDEX idx_hrm_attendances_emp_date ON hrm_attendances(employee_id, date);
CREATE INDEX idx_hrm_attendances_date ON hrm_attendances(date);
CREATE INDEX idx_leave_requests_emp ON leave_requests(employee_id);
CREATE INDEX idx_kpi_eval_emp ON kpi_evaluations(employee_id);
CREATE INDEX idx_departments_tenant ON departments(tenant_id);
CREATE INDEX idx_positions_tenant ON positions(tenant_id);
CREATE INDEX idx_work_shifts_tenant ON work_shifts(tenant_id);

-- BƯỚC 4: RLS policies
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

CREATE POLICY departments_all ON departments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY positions_all ON positions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY employees_all ON employees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY work_shifts_all ON work_shifts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY hrm_attendances_all ON hrm_attendances FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY leave_requests_all ON leave_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY leave_balances_all ON leave_balances FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY kpi_templates_all ON kpi_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY kpi_criteria_all ON kpi_criteria FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY kpi_evaluations_all ON kpi_evaluations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY kpi_evaluation_details_all ON kpi_evaluation_details FOR ALL USING (true) WITH CHECK (true);
