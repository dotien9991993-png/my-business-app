-- ============================================================
-- RLS POLICIES cho bảng `salaries`
-- Apply trên Supabase Dashboard → SQL Editor
-- ============================================================
--
-- ⚠️ LƯU Ý QUAN TRỌNG:
-- App này dùng CUSTOM AUTH (bcrypt password trong bảng users),
-- KHÔNG dùng Supabase Auth. Vì vậy auth.uid() sẽ trả NULL trong
-- mọi request từ client → RLS dựa vào auth.uid() sẽ BLOCK MỌI THỨ.
--
-- Có 2 lựa chọn để bảo mật:
--
-- Lựa chọn A (KHUYẾN NGHỊ): Migrate sang Supabase Auth
--   - Tạo Supabase Auth users tương ứng cho mỗi user trong bảng users
--   - Link bằng auth.users.id = users.id
--   - Dùng supabase.auth.signInWithPassword khi đăng nhập
--   - Sau đó RLS bên dưới sẽ hoạt động
--
-- Lựa chọn B (TẠM THỜI): Application-level filtering (đã làm)
--   - Mọi query trong code đã có .eq('user_id', currentUser.id)
--   - Disable RLS hoặc set policy "true" cho phép tất cả
--   - Dựa vào trust client code — KÉM bảo mật hơn
--
-- File này thiết lập RLS cho lựa chọn A. Nếu vẫn dùng custom auth,
-- ĐỪNG chạy file này — sẽ block hết các query.
-- ============================================================

-- Bật RLS
ALTER TABLE salaries ENABLE ROW LEVEL SECURITY;

-- Drop policies cũ nếu tồn tại
DROP POLICY IF EXISTS "users_view_own_salary" ON salaries;
DROP POLICY IF EXISTS "admin_view_all_salaries" ON salaries;
DROP POLICY IF EXISTS "admin_manage_salaries" ON salaries;

-- ============================================================
-- POLICY 1: Nhân viên xem lương của chính mình
-- ============================================================
CREATE POLICY "users_view_own_salary" ON salaries
  FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- POLICY 2: Admin xem tất cả lương trong cùng tenant
-- ============================================================
CREATE POLICY "admin_view_all_salaries" ON salaries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.tenant_id = salaries.tenant_id
        AND (u.role = 'Admin' OR u.role = 'admin' OR u.role = 'Manager')
    )
  );

-- ============================================================
-- POLICY 3: Chỉ admin/manager mới insert/update/delete
-- ============================================================
CREATE POLICY "admin_manage_salaries" ON salaries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.tenant_id = salaries.tenant_id
        AND (u.role = 'Admin' OR u.role = 'admin' OR u.role = 'Manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid()
        AND u.tenant_id = salaries.tenant_id
        AND (u.role = 'Admin' OR u.role = 'admin' OR u.role = 'Manager')
    )
  );

-- ============================================================
-- THÊM column 'detail' (JSONB) nếu chưa có
-- ============================================================
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS detail JSONB DEFAULT '{}'::jsonb;

-- ============================================================
-- THÊM unique constraint để upsert hoạt động đúng
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'salaries_tenant_user_month_unique'
  ) THEN
    ALTER TABLE salaries ADD CONSTRAINT salaries_tenant_user_month_unique
      UNIQUE (tenant_id, user_id, month);
  END IF;
END $$;

-- ============================================================
-- INDEX để query nhanh
-- ============================================================
CREATE INDEX IF NOT EXISTS salaries_user_id_idx ON salaries(user_id);
CREATE INDEX IF NOT EXISTS salaries_tenant_month_idx ON salaries(tenant_id, month);
CREATE INDEX IF NOT EXISTS salaries_status_idx ON salaries(status);
