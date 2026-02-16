-- ============================================================
-- VIETTEL POST INTEGRATION: Migration
-- Chạy thủ công trong Supabase SQL Editor
-- ============================================================

-- Thêm cột shipping_metadata để lưu structured address + VTP order data
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_metadata JSONB DEFAULT '{}';
