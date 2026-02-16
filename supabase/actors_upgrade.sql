-- ============================================
-- Actors Upgrade - Database Migration
-- Chạy thủ công trên Supabase Dashboard > SQL Editor
-- ============================================

-- Thêm cột actors vào bảng tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actors JSONB DEFAULT '[]';

-- Thêm cột actor vào bảng media_salaries
ALTER TABLE media_salaries ADD COLUMN IF NOT EXISTS actor_count INTEGER DEFAULT 0;
ALTER TABLE media_salaries ADD COLUMN IF NOT EXISTS actor_rate NUMERIC DEFAULT 0;
ALTER TABLE media_salaries ADD COLUMN IF NOT EXISTS actor_total NUMERIC DEFAULT 0;
