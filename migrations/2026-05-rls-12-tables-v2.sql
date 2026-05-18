-- =====================================================================
-- Migration v2: Bật RLS cho 12 bảng — đã sửa theo schema thực tế
-- (chat_messages, chat_room_members, chat_message_reactions KHÔNG có
--  cột tenant_id, phải JOIN qua chat_rooms.tenant_id)
--
-- Ngày: 2026-05
-- Cách chạy: Supabase Dashboard → SQL Editor → paste toàn bộ → Run
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
-- 2. Policy cho 9 bảng có tenant_id (filter trực tiếp)
-- ============================================

-- activity_logs
DROP POLICY IF EXISTS "tenant_scoped_all" ON activity_logs;
CREATE POLICY "tenant_scoped_all" ON activity_logs
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

-- chat_rooms
DROP POLICY IF EXISTS "tenant_scoped_all" ON chat_rooms;
CREATE POLICY "tenant_scoped_all" ON chat_rooms
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

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

-- zalo_config (chứa OA token — nhạy cảm)
DROP POLICY IF EXISTS "tenant_scoped_all" ON zalo_config;
CREATE POLICY "tenant_scoped_all" ON zalo_config
  FOR ALL TO anon, authenticated
  USING (tenant_id IS NOT NULL)
  WITH CHECK (tenant_id IS NOT NULL);

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
-- 3. Policy cho 3 bảng KHÔNG có tenant_id
--    → kiểm tra qua parent table (chat_rooms / chat_messages)
-- ============================================

-- chat_messages — qua chat_rooms.tenant_id
DROP POLICY IF EXISTS "via_room" ON chat_messages;
CREATE POLICY "via_room" ON chat_messages
  FOR ALL TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_rooms r
      WHERE r.id = chat_messages.room_id
        AND r.tenant_id IS NOT NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_rooms r
      WHERE r.id = chat_messages.room_id
        AND r.tenant_id IS NOT NULL
    )
  );

-- chat_room_members — qua chat_rooms.tenant_id
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

-- chat_message_reactions — qua chat_messages → chat_rooms.tenant_id
DROP POLICY IF EXISTS "via_message" ON chat_message_reactions;
CREATE POLICY "via_message" ON chat_message_reactions
  FOR ALL TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM chat_messages m
      JOIN chat_rooms r ON r.id = m.room_id
      WHERE m.id = chat_message_reactions.message_id
        AND r.tenant_id IS NOT NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM chat_messages m
      JOIN chat_rooms r ON r.id = m.room_id
      WHERE m.id = chat_message_reactions.message_id
        AND r.tenant_id IS NOT NULL
    )
  );

-- ============================================
-- 4. Verify
-- ============================================
SELECT tablename,
       CASE WHEN rowsecurity THEN '✅ RLS ON' ELSE '❌ RLS OFF' END AS rls_status,
       (SELECT COUNT(*) FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = t.tablename) AS policy_count
FROM pg_tables t
WHERE schemaname = 'public'
  AND tablename IN (
    'activity_logs', 'chat_messages', 'chat_rooms', 'chat_room_members',
    'chat_message_reactions', 'zalo_chat_messages', 'zalo_conversations',
    'zalo_messages', 'zalo_internal_notes', 'zalo_config',
    'zalo_quick_replies', 'zalo_templates'
  )
ORDER BY tablename;

-- Kết quả mong đợi: tất cả 12 bảng đều có rls_status = ✅ RLS ON
-- và policy_count >= 1
