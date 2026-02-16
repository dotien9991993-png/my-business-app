-- ═══════════════════════════════════════
-- FIX DUPLICATE EMPLOYEES
-- ═══════════════════════════════════════

-- Bước 1: Kiểm tra nhân viên trùng (cùng user_id hoặc cùng full_name)
-- Chạy SELECT này trước để xem có bao nhiêu bản trùng:

SELECT
  COALESCE(user_id::text, full_name) as group_key,
  full_name,
  user_id,
  COUNT(*) as total,
  array_agg(id) as ids,
  array_agg(employee_code ORDER BY employee_code) as codes
FROM employees
GROUP BY COALESCE(user_id::text, full_name), full_name, user_id
HAVING COUNT(*) > 1;

-- Bước 2: Xóa bản trùng, giữ bản có employee_code nhỏ nhất (NV-001 > NV-011)
-- Logic: partition theo user_id (nếu có) hoặc full_name, giữ row_number = 1

DELETE FROM employees
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      full_name,
      user_id,
      employee_code,
      ROW_NUMBER() OVER (
        PARTITION BY COALESCE(user_id::text, full_name)
        ORDER BY employee_code ASC
      ) as rn
    FROM employees
  ) sub
  WHERE rn > 1
);

-- Bước 3: Verify - kiểm tra không còn trùng
SELECT
  COALESCE(user_id::text, full_name) as group_key,
  COUNT(*) as total
FROM employees
GROUP BY COALESCE(user_id::text, full_name)
HAVING COUNT(*) > 1;
-- Kết quả mong đợi: 0 rows
