-- ============================================================
-- Fix task status inconsistency
-- Một số task có completed_at/edited_at/filmed_at set
-- nhưng status vẫn = 'Nháp' hoặc giá trị cũ không khớp.
--
-- Chạy 1 lần trên Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Task đã hoàn thành (completed_at set) nhưng status != 'Hoàn Thành'
UPDATE tasks
SET status = 'Hoàn Thành'
WHERE completed_at IS NOT NULL
  AND status != 'Hoàn Thành';

-- 2. Task đã dựng (edited_at set, chưa completed) nhưng status không đúng
UPDATE tasks
SET status = 'Đang Edit'
WHERE edited_at IS NOT NULL
  AND completed_at IS NULL
  AND status NOT IN ('Đang Edit', 'Hoàn Thành');

-- 3. Task đã quay (filmed_at set, chưa edited/completed) nhưng status không đúng
UPDATE tasks
SET status = 'Đã Quay'
WHERE filmed_at IS NOT NULL
  AND edited_at IS NULL
  AND completed_at IS NULL
  AND status NOT IN ('Đã Quay', 'Đang Edit', 'Hoàn Thành');

-- Kiểm tra kết quả
SELECT status, COUNT(*) as count
FROM tasks
GROUP BY status
ORDER BY count DESC;
