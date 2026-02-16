-- =============================================
-- HỆ THỐNG CHAT NỘI BỘ
-- =============================================

-- Phòng chat (dùng cho cả 1-1 và nhóm)
CREATE TABLE IF NOT EXISTS chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  type TEXT NOT NULL DEFAULT 'direct', -- direct (1-1), group (nhóm)
  name TEXT, -- NULL cho direct, tên nhóm cho group
  avatar_url TEXT,
  created_by TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_by TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Thành viên phòng chat
CREATE TABLE IF NOT EXISTS chat_room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  role TEXT DEFAULT 'member', -- admin, member
  last_read_at TIMESTAMPTZ DEFAULT now(), -- thời điểm đọc cuối → tính tin chưa đọc
  is_active BOOLEAN DEFAULT true,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- Tin nhắn
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  sender_name TEXT NOT NULL,
  sender_avatar TEXT,
  content TEXT, -- nội dung text
  message_type TEXT DEFAULT 'text', -- text, image, file, system
  file_url TEXT, -- URL file/ảnh (Supabase Storage)
  file_name TEXT,
  file_size INTEGER,
  reply_to UUID REFERENCES chat_messages(id), -- trả lời tin nhắn
  is_edited BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX idx_chat_messages_room ON chat_messages(room_id, created_at DESC);
CREATE INDEX idx_chat_members_user ON chat_room_members(user_id);
CREATE INDEX idx_chat_rooms_tenant ON chat_rooms(tenant_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at DESC);

-- Supabase Realtime: enable cho chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
