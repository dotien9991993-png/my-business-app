-- =====================================================================
-- Migration v2: Trigger gọi Edge Function send-push khi có notification mới
-- (Đã sửa cách lưu config — Supabase managed không cho ALTER DATABASE)
-- Ngày: 2026-05
--
-- ⚠️ QUAN TRỌNG — TRƯỚC KHI CHẠY:
-- 1. Edge Function send-push phải được deploy trước
--    (xem supabase/functions/send-push/index.ts)
-- 2. Sửa 2 dòng có dấu << ĐỔI >> ở phần dưới với giá trị thật của bạn
-- =====================================================================

-- ============================================
-- 1. Bật extension http (cần cho net.http_post)
-- ============================================
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- 2. Bảng device_tokens (nếu chưa có)
-- ============================================
CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_tenant ON device_tokens(tenant_id);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_scoped_all" ON device_tokens;
CREATE POLICY "tenant_scoped_all" ON device_tokens
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

-- ============================================
-- 3. Thêm cột silent vào notifications nếu chưa có
-- ============================================
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS silent BOOLEAN DEFAULT false;

-- ============================================
-- 4. Function trigger_send_push — gọi Edge Function gửi push
--
-- ⚠️ HARDCODE config trong function (vì Supabase không cho ALTER DATABASE)
-- Khi đổi service_role_key, phải DROP + CREATE lại function này.
-- ============================================
CREATE OR REPLACE FUNCTION trigger_send_push() RETURNS TRIGGER AS $$
DECLARE
  -- ============================================
  -- << ĐỔI 2 DÒNG NÀY VỚI GIÁ TRỊ THẬT >>
  -- ============================================
  function_url CONSTANT TEXT := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push';
  service_key  CONSTANT TEXT := 'YOUR_SERVICE_ROLE_KEY';
  -- ============================================
  payload JSONB;
BEGIN
  -- Skip nếu notification không có user_id
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  -- Skip nếu notification được đánh dấu silent
  IF NEW.silent = true THEN RETURN NEW; END IF;

  -- Skip nếu chưa cấu hình
  IF function_url LIKE '%YOUR_PROJECT_REF%' OR service_key LIKE '%YOUR_SERVICE_ROLE_KEY%' THEN
    RAISE WARNING 'trigger_send_push chưa được cấu hình URL/key';
    RETURN NEW;
  END IF;

  payload := jsonb_build_object(
    'user_id', NEW.user_id,
    'tenant_id', NEW.tenant_id,
    'title', COALESCE(NEW.title, 'Thông báo'),
    'body', COALESCE(NEW.message, ''),
    'data', jsonb_build_object(
      'type', NEW.type,
      'id', NEW.related_id,
      'notification_id', NEW.id
    )
  );

  -- Gọi Edge Function async (không block insert)
  PERFORM net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := payload
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Không fail insert nếu push lỗi
  RAISE WARNING 'Lỗi gửi push: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 5. Trigger
-- ============================================
DROP TRIGGER IF EXISTS on_notification_insert ON notifications;
CREATE TRIGGER on_notification_insert
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION trigger_send_push();

-- ============================================
-- 6. Verify
-- ============================================
SELECT
  'device_tokens' AS object,
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'device_tokens')
       THEN '✅ ready' ELSE '❌ missing' END AS status
UNION ALL
SELECT 'pg_net extension',
  CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
       THEN '✅ ready' ELSE '❌ missing' END
UNION ALL
SELECT 'trigger_send_push function',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trigger_send_push')
       THEN '✅ ready' ELSE '❌ missing' END
UNION ALL
SELECT 'on_notification_insert trigger',
  CASE WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_notification_insert')
       THEN '✅ ready' ELSE '❌ missing' END;

-- ============================================
-- KIỂM TRA SAU KHI CHẠY:
-- ============================================
-- Tất cả 4 dòng phải hiển thị ✅ ready
--
-- ⚠️ Function vẫn chưa hoạt động cho đến khi:
-- 1. Edge Function send-push được deploy (qua Supabase CLI)
-- 2. URL + service_key trong function trigger_send_push được thay đúng
--
-- Test push (sau khi đã deploy Edge Function + sửa URL/key):
-- INSERT INTO notifications (user_id, tenant_id, type, title, message)
-- VALUES (
--   'YOUR_USER_ID',  -- user của bạn
--   'YOUR_TENANT_ID', -- tenant của bạn
--   'task',
--   'Test Push',
--   'Đây là tin nhắn thử push notification'
-- );
-- → Nếu device đã đăng ký, sẽ nhận push trong vài giây.
