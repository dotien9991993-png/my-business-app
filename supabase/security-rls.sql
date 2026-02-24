-- ============================================================
-- Supabase Row Level Security (RLS) - Reference SQL
-- ============================================================
-- TRẠNG THÁI: Hiện tại RLS đang dùng USING (true) cho hầu hết bảng.
-- File này là reference để upgrade RLS policies sau khi migrate sang
-- Supabase Auth hoặc custom JWT authentication.
--
-- YÊU CẦU: Cần có cơ chế truyền tenant_id qua JWT claims hoặc
-- Supabase Auth metadata để enforce RLS ở database level.
--
-- VÍ DỤ: Nếu dùng custom JWT với claim `tenant_id`:
--   auth.jwt() ->> 'tenant_id' = tenant_id::text
-- ============================================================

-- ---- Helper function: lấy tenant_id từ JWT ----
-- (Tạo sau khi có JWT authentication)
-- CREATE OR REPLACE FUNCTION get_current_tenant_id()
-- RETURNS uuid AS $$
--   SELECT (auth.jwt() ->> 'tenant_id')::uuid;
-- $$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ============================================================
-- Bảng: users
-- ============================================================
-- DROP POLICY IF EXISTS "tenant_isolation_users" ON users;
-- CREATE POLICY "tenant_isolation_users" ON users
--   FOR ALL
--   USING (tenant_id = get_current_tenant_id())
--   WITH CHECK (tenant_id = get_current_tenant_id());

-- ============================================================
-- Bảng: tasks (media tasks)
-- ============================================================
-- DROP POLICY IF EXISTS "tenant_isolation_tasks" ON tasks;
-- CREATE POLICY "tenant_isolation_tasks" ON tasks
--   FOR ALL
--   USING (tenant_id = get_current_tenant_id())
--   WITH CHECK (tenant_id = get_current_tenant_id());

-- ============================================================
-- Bảng: technical_jobs
-- ============================================================
-- DROP POLICY IF EXISTS "tenant_isolation_technical_jobs" ON technical_jobs;
-- CREATE POLICY "tenant_isolation_technical_jobs" ON technical_jobs
--   FOR ALL
--   USING (tenant_id = get_current_tenant_id())
--   WITH CHECK (tenant_id = get_current_tenant_id());

-- ============================================================
-- Bảng: receipts_payments (tài chính)
-- ============================================================
-- DROP POLICY IF EXISTS "tenant_isolation_receipts_payments" ON receipts_payments;
-- CREATE POLICY "tenant_isolation_receipts_payments" ON receipts_payments
--   FOR ALL
--   USING (tenant_id = get_current_tenant_id())
--   WITH CHECK (tenant_id = get_current_tenant_id());

-- ============================================================
-- Bảng: products
-- ============================================================
-- DROP POLICY IF EXISTS "tenant_isolation_products" ON products;
-- CREATE POLICY "tenant_isolation_products" ON products
--   FOR ALL
--   USING (tenant_id = get_current_tenant_id())
--   WITH CHECK (tenant_id = get_current_tenant_id());

-- ============================================================
-- Bảng: orders
-- ============================================================
-- DROP POLICY IF EXISTS "tenant_isolation_orders" ON orders;
-- CREATE POLICY "tenant_isolation_orders" ON orders
--   FOR ALL
--   USING (tenant_id = get_current_tenant_id())
--   WITH CHECK (tenant_id = get_current_tenant_id());

-- ============================================================
-- Bảng: warehouse_transactions
-- ============================================================
-- DROP POLICY IF EXISTS "tenant_isolation_warehouse_transactions" ON warehouse_transactions;
-- CREATE POLICY "tenant_isolation_warehouse_transactions" ON warehouse_transactions
--   FOR ALL
--   USING (tenant_id = get_current_tenant_id())
--   WITH CHECK (tenant_id = get_current_tenant_id());

-- ============================================================
-- Bảng: notifications
-- ============================================================
-- DROP POLICY IF EXISTS "tenant_isolation_notifications" ON notifications;
-- CREATE POLICY "tenant_isolation_notifications" ON notifications
--   FOR ALL
--   USING (tenant_id = get_current_tenant_id())
--   WITH CHECK (tenant_id = get_current_tenant_id());

-- ============================================================
-- Bảng: attendances
-- ============================================================
-- DROP POLICY IF EXISTS "tenant_isolation_attendances" ON attendances;
-- CREATE POLICY "tenant_isolation_attendances" ON attendances
--   FOR ALL
--   USING (tenant_id = get_current_tenant_id())
--   WITH CHECK (tenant_id = get_current_tenant_id());

-- ============================================================
-- Bảng: zalo_config (nhạy cảm - chứa tokens)
-- ============================================================
-- DROP POLICY IF EXISTS "tenant_isolation_zalo_config" ON zalo_config;
-- CREATE POLICY "tenant_isolation_zalo_config" ON zalo_config
--   FOR ALL
--   USING (tenant_id = get_current_tenant_id())
--   WITH CHECK (tenant_id = get_current_tenant_id());

-- ============================================================
-- GHI CHÚ TRIỂN KHAI:
-- 1. Migrate auth system sang Supabase Auth hoặc custom JWT
-- 2. Uncomment và chạy từng policy
-- 3. Test kỹ với multiple tenants
-- 4. Xóa các policy USING (true) cũ trước khi enable mới
-- 5. Backup database trước khi thay đổi RLS
-- ============================================================
