-- Chat Attachments & Pin Messages Migration
-- Thêm khả năng đính kèm dữ liệu business vào tin nhắn và ghim tin nhắn

-- Attachments: JSONB array chứa thông tin đính kèm (đơn hàng, task, sản phẩm, etc.)
-- Cấu trúc: [{ type, id, title, subtitle, amount, status, status_label }]
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

-- Pin messages
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS pinned_by TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

-- Index cho pin queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned ON chat_messages (room_id, is_pinned) WHERE is_pinned = true;
