-- =============================================
-- Migration: Thêm liên kết sản phẩm cho video tasks
-- =============================================

-- Thêm cột product_ids (JSONB array of UUID strings) vào bảng tasks
-- Giống pattern cameramen, editors, actors
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS product_ids JSONB DEFAULT '[]';

-- Index GIN để query nhanh theo product_id
CREATE INDEX IF NOT EXISTS idx_tasks_product_ids ON tasks USING GIN (product_ids);
