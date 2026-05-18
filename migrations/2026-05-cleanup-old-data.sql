-- =====================================================================
-- Migration: Cleanup data cũ định kỳ — giảm DB size, tăng tốc query
-- Ngày: 2026-05
-- Cách dùng: chạy 1 lần để cleanup ngay,
--           + setup pg_cron để tự chạy mỗi tuần
-- =====================================================================

-- ============================================
-- 1. Cleanup activity_logs > 90 ngày
-- (App ghi 144 chỗ → bảng này phình rất nhanh)
-- ============================================
DELETE FROM activity_logs
WHERE created_at < NOW() - INTERVAL '90 days';

-- ============================================
-- 2. Cleanup notifications đã đọc > 30 ngày
-- ============================================
DELETE FROM notifications
WHERE is_read = true
  AND read_at < NOW() - INTERVAL '30 days';

-- Xóa luôn notifications chưa đọc nhưng đã quá 90 ngày (chắc user không còn quan tâm)
DELETE FROM notifications
WHERE created_at < NOW() - INTERVAL '90 days';

-- ============================================
-- 3. Cleanup chat_messages đã xóa (soft delete) > 30 ngày
-- ============================================
DELETE FROM chat_messages
WHERE is_deleted = true
  AND created_at < NOW() - INTERVAL '30 days';

-- ============================================
-- 4. Cleanup shipping_tracking_events cũ > 60 ngày
-- (mỗi đơn hàng có nhiều event tracking)
-- ============================================
DELETE FROM shipping_tracking_events
WHERE created_at < NOW() - INTERVAL '60 days';

-- ============================================
-- 5. Vacuum để reclaim disk space
-- ============================================
VACUUM ANALYZE activity_logs;
VACUUM ANALYZE notifications;
VACUUM ANALYZE chat_messages;
VACUUM ANALYZE shipping_tracking_events;

-- ============================================
-- 6. Setup pg_cron tự cleanup hằng tuần
-- (Chỉ chạy được nếu đã enable pg_cron extension)
-- ============================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Job chạy 3h sáng Chủ nhật mỗi tuần
SELECT cron.schedule(
  'weekly-cleanup',
  '0 3 * * 0',
  $$
  DELETE FROM activity_logs WHERE created_at < NOW() - INTERVAL '90 days';
  DELETE FROM notifications WHERE is_read = true AND read_at < NOW() - INTERVAL '30 days';
  DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '90 days';
  DELETE FROM chat_messages WHERE is_deleted = true AND created_at < NOW() - INTERVAL '30 days';
  DELETE FROM shipping_tracking_events WHERE created_at < NOW() - INTERVAL '60 days';
  $$
);

-- ============================================
-- VERIFY
-- ============================================
SELECT
  'activity_logs' AS table_name,
  pg_size_pretty(pg_total_relation_size('activity_logs')) AS size,
  (SELECT COUNT(*) FROM activity_logs) AS row_count
UNION ALL
SELECT 'notifications',
  pg_size_pretty(pg_total_relation_size('notifications')),
  (SELECT COUNT(*) FROM notifications)
UNION ALL
SELECT 'chat_messages',
  pg_size_pretty(pg_total_relation_size('chat_messages')),
  (SELECT COUNT(*) FROM chat_messages)
UNION ALL
SELECT 'shipping_tracking_events',
  pg_size_pretty(pg_total_relation_size('shipping_tracking_events')),
  (SELECT COUNT(*) FROM shipping_tracking_events);
