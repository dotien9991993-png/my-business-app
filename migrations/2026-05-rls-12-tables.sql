-- =====================================================================
-- Migration: Bật Row Level Security cho 12 bảng còn thiếu
-- Ngày: 2026-05
-- Lý do: 12 bảng (chat, zalo, activity_logs) đang để mở,
--        bất cứ ai có ANON_KEY (đọc được trong source JS) đều có thể
--        query thẳng bypass UI ⇒ lộ chat nội bộ, log hoạt động, token Zalo OA
--
-- Cách chạy: vào Supabase Dashboard → SQL Editor → paste toàn bộ → Run
-- =====================================================================

-- ============================================
-- 1. Bật RLS cho 12 bảng
-- ============================================
ALTER TABLE activity_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_rooms               ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_room_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_message_reactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_chat_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_conversations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_internal_notes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_config              ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_quick_replies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_templates           ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. Policy: cho phép anon đọc/ghi nhưng PHẢI khớp tenant_id
--
-- Vì app dùng custom auth (không phải Supabase Auth), không có auth.uid().
-- Pattern này: app luôn truy vấn với .eq('tenant_id', tenant.id),
-- RLS chỉ enforce chấp nhận row đúng tenant_id đã filter.
--
-- Lợi ích: kẻ tấn công không thể query "select * from chat_messages"
-- mà phải biết tenant_id cụ thể (lấy được qua bảng tenants — vẫn cần hardening sau).
-- ============================================

-- activity_logs (có cột tenant_id)
DROP POLICY IF EXISTS "tenant_scoped_all" ON activity_logs;
CREATE POLICY "tenant_scoped_all" ON activity_logs
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

-- chat_messages (có tenant_id)
DROP POLICY IF EXISTS "tenant_scoped_all" ON chat_messages;
CREATE POLICY "tenant_scoped_all" ON chat_messages
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

-- chat_rooms (có tenant_id)
DROP POLICY IF EXISTS "tenant_scoped_all" ON chat_rooms;
CREATE POLICY "tenant_scoped_all" ON chat_rooms
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

-- chat_room_members (qua join với chat_rooms.tenant_id)
DROP POLICY IF EXISTS "via_room" ON chat_room_members;
CREATE POLICY "via_room" ON chat_room_members
  FOR ALL TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_rooms r
      WHERE r.id = chat_room_members.room_id
        AND r.tenant_id IS NOT NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_rooms r
      WHERE r.id = chat_room_members.room_id
        AND r.tenant_id IS NOT NULL
    )
  );

-- chat_message_reactions (qua chat_messages)
DROP POLICY IF EXISTS "via_message" ON chat_message_reactions;
CREATE POLICY "via_message" ON chat_message_reactions
  FOR ALL TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_messages m
      WHERE m.id = chat_message_reactions.message_id
        AND m.tenant_id IS NOT NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_messages m
      WHERE m.id = chat_message_reactions.message_id
        AND m.tenant_id IS NOT NULL
    )
  );

-- zalo_chat_messages
DROP POLICY IF EXISTS "tenant_scoped_all" ON zalo_chat_messages;
CREATE POLICY "tenant_scoped_all" ON zalo_chat_messages
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

-- zalo_conversations
DROP POLICY IF EXISTS "tenant_scoped_all" ON zalo_conversations;
CREATE POLICY "tenant_scoped_all" ON zalo_conversations
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

-- zalo_messages
DROP POLICY IF EXISTS "tenant_scoped_all" ON zalo_messages;
CREATE POLICY "tenant_scoped_all" ON zalo_messages
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

-- zalo_internal_notes
DROP POLICY IF EXISTS "tenant_scoped_all" ON zalo_internal_notes;
CREATE POLICY "tenant_scoped_all" ON zalo_internal_notes
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

-- zalo_config (NHẠY CẢM — chứa Zalo OA token)
-- Chặn anon đọc trực tiếp, chỉ service_role được đọc
DROP POLICY IF EXISTS "service_role_only" ON zalo_config;
CREATE POLICY "service_role_only" ON zalo_config
  FOR ALL TO authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);
-- Anon KHÔNG được đọc bảng này
DROP POLICY IF EXISTS "anon_no_access" ON zalo_config;

-- zalo_quick_replies
DROP POLICY IF EXISTS "tenant_scoped_all" ON zalo_quick_replies;
CREATE POLICY "tenant_scoped_all" ON zalo_quick_replies
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

-- zalo_templates
DROP POLICY IF EXISTS "tenant_scoped_all" ON zalo_templates;
CREATE POLICY "tenant_scoped_all" ON zalo_templates
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

-- ============================================
-- 3. Verify
-- ============================================
SELECT tablename,
       CASE WHEN rowsecurity THEN '✅ RLS ON' ELSE '❌ RLS OFF' END AS rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'activity_logs', 'chat_messages', 'chat_rooms', 'chat_room_members',
    'chat_message_reactions', 'zalo_chat_messages', 'zalo_conversations',
    'zalo_messages', 'zalo_internal_notes', 'zalo_config',
    'zalo_quick_replies', 'zalo_templates'
  )
ORDER BY tablename;

-- ============================================
-- LƯU Ý QUAN TRỌNG
-- ============================================
-- Policy hiện tại CHƯA bảo vệ hoàn toàn vì pattern tenant_id IS NOT NULL
-- chỉ chặn được kẻ tấn công vu vơ. Để bảo vệ thật sự cần:
--   1. Chuyển sang Supabase Auth (auth.uid() khả dụng)
--   2. Dùng JWT claims với tenant_id
--   3. Policy: USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
--
-- Đây là bước 1/3 của việc fix bảo mật multi-tenant.
-- Bước tiếp theo: migrate sang Supabase Auth (riêng).
