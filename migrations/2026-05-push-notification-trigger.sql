-- =====================================================================
-- Migration: Trigger gọi Edge Function send-push khi có notification mới
-- Ngày: 2026-05
-- Yêu cầu: Edge Function send-push đã deploy
--          (xem supabase/functions/send-push/index.ts)
-- =====================================================================

-- ============================================
-- 1. Bảng device_tokens (nếu chưa có)
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
-- 2. Cấu hình Edge Function URL
-- ============================================
-- ⚠️ QUAN TRỌNG: thay YOUR_PROJECT_REF bằng project ref Supabase của bạn
-- Ref tìm ở Supabase Dashboard → Settings → General → "Reference ID"
-- VD: nếu ref là "abcdefghij" thì URL là:
--     https://abcdefghij.supabase.co/functions/v1/send-push

-- Lưu URL + service role key vào pg settings để trigger dùng
-- (cần quyền postgres để chạy)

-- Cách lấy service_role_key: Dashboard → Settings → API → "service_role" (secret)

ALTER DATABASE postgres SET app.settings.edge_function_url = 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push';
ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';

-- ============================================
-- 3. Function gọi Edge Function send-push
-- ============================================
CREATE OR REPLACE FUNCTION trigger_send_push() RETURNS TRIGGER AS $$
DECLARE
  function_url TEXT;
  service_key TEXT;
  payload JSONB;
BEGIN
  -- Skip nếu notification không có user_id
  IF NEW.user_id IS NULL THEN RETURN NEW; END IF;

  -- Skip nếu notification được đánh dấu silent (không gửi push)
  IF NEW.silent = true THEN RETURN NEW; END IF;

  function_url := current_setting('app.settings.edge_function_url', true);
  service_key := current_setting('app.settings.service_role_key', true);

  IF function_url IS NULL OR service_key IS NULL THEN
    RAISE WARNING 'Edge function URL/key chưa được cấu hình';
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
-- 4. Bật extension http (cần để net.http_post)
-- ============================================
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================
-- 5. Trigger
-- ============================================
DROP TRIGGER IF EXISTS on_notification_insert ON notifications;
CREATE TRIGGER on_notification_insert
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION trigger_send_push();

-- ============================================
-- 6. (Optional) Thêm cột silent vào notifications nếu chưa có
-- ============================================
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS silent BOOLEAN DEFAULT false;

-- ============================================
-- TEST:
-- ============================================
-- INSERT INTO notifications (user_id, tenant_id, type, title, message)
-- VALUES (
--   'YOUR_USER_ID',
--   'YOUR_TENANT_ID',
--   'task',
--   'Test Push',
--   'Đây là tin nhắn thử push notification'
-- );
-- → Nếu device đã đăng ký, sẽ nhận push trong vài giây.
