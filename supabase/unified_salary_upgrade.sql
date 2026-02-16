-- ============================================
-- Unified Salary System - Comprehensive Column Upgrade
-- Chạy trên Supabase Dashboard > SQL Editor
-- Safe to run multiple times (IF NOT EXISTS)
-- ============================================

-- =====================
-- FIX: user_id UUID → TEXT (users table dùng TEXT id)
-- =====================
-- Xóa FK constraint nếu có (bỏ qua lỗi nếu không tồn tại)
DO $$ BEGIN
  ALTER TABLE salaries DROP CONSTRAINT IF EXISTS salaries_user_id_fkey;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
-- Chuyển user_id sang TEXT
ALTER TABLE salaries ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;

-- =====================
-- THÔNG TIN CƠ BẢN
-- =====================
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS employee_name TEXT DEFAULT '';
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS month TEXT DEFAULT '';
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT '';
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- =====================
-- LƯƠNG CƠ BẢN
-- =====================
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS basic_salary NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS work_days NUMERIC DEFAULT 26;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS actual_basic NUMERIC DEFAULT 0;

-- =====================
-- MEDIA (Quay & Dựng)
-- =====================
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS media_videos INTEGER DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS media_per_video NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS media_total NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS media_note TEXT DEFAULT '';

-- =====================
-- MEDIA (Diễn viên)
-- =====================
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS media_actor_count INTEGER DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS media_actor_total NUMERIC DEFAULT 0;

-- =====================
-- KỸ THUẬT
-- =====================
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS kythuat_jobs INTEGER DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS kythuat_per_job NUMERIC DEFAULT 200000;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS kythuat_total NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS kythuat_note TEXT DEFAULT '';

-- =====================
-- LIVESTREAM
-- =====================
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS livestream_revenue NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS livestream_commission NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS livestream_total NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS livestream_note TEXT DEFAULT '';

-- =====================
-- KHO
-- =====================
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS kho_orders NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS kho_per_order NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS kho_total NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS kho_note TEXT DEFAULT '';

-- =====================
-- SALE
-- =====================
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS sale_revenue NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS sale_commission NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS sale_total NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS sale_note TEXT DEFAULT '';

-- =====================
-- THƯỞNG / KHẤU TRỪ / GHI CHÚ
-- =====================
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS bonus NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS deduction NUMERIC DEFAULT 0;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS total_salary NUMERIC DEFAULT 0;

-- =====================
-- DUYỆT & THANH TOÁN
-- =====================
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS paid_by TEXT;

-- =====================
-- DETAIL (JSONB - lưu task/job IDs)
-- =====================
ALTER TABLE salaries ADD COLUMN IF NOT EXISTS detail JSONB DEFAULT '{}';

-- =====================
-- BACKFILL nulls cho dữ liệu cũ
-- =====================
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
