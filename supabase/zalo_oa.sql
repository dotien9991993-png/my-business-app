-- ═══════════════════════════════════════
-- ZALO OA INTEGRATION
-- ═══════════════════════════════════════

-- 1. Bảng cấu hình Zalo OA
CREATE TABLE IF NOT EXISTS zalo_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  app_id TEXT,
  secret_key TEXT,
  oa_id TEXT,
  refresh_token TEXT,
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zalo_config_tenant ON zalo_config(tenant_id);

-- 2. Bảng template tin nhắn
CREATE TABLE IF NOT EXISTS zalo_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- order_confirm, shipping, warranty_remind, birthday, win_back
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zalo_templates_tenant ON zalo_templates(tenant_id);

-- 3. Bảng lịch sử gửi tin
CREATE TABLE IF NOT EXISTS zalo_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  template_id UUID REFERENCES zalo_templates(id),
  customer_id UUID,
  customer_name TEXT,
  customer_phone TEXT,
  zalo_user_id TEXT,
  type TEXT NOT NULL, -- order_confirm, shipping, warranty_remind, birthday, win_back, manual
  content TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, sent, failed, delivered, read
  error_message TEXT,
  related_entity_type TEXT, -- order, warranty_card
  related_entity_id TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zalo_messages_status ON zalo_messages(status);
CREATE INDEX IF NOT EXISTS idx_zalo_messages_type ON zalo_messages(type);
CREATE INDEX IF NOT EXISTS idx_zalo_messages_phone ON zalo_messages(customer_phone);
CREATE INDEX IF NOT EXISTS idx_zalo_messages_tenant ON zalo_messages(tenant_id);

-- 4. Insert template mặc định
INSERT INTO zalo_templates (tenant_id, name, type, content)
SELECT t.id, vals.name, vals.type, vals.content
FROM tenants t
CROSS JOIN (VALUES
  ('Xác nhận đơn hàng', 'order_confirm',
   'Chào {{customer_name}}, đơn hàng {{order_code}} của bạn đã được xác nhận!
💰 Tổng tiền: {{total_amount}}
📦 Sản phẩm: {{products}}
Cảm ơn bạn đã mua hàng tại Hoàng Nam Audio! 🎵'),

  ('Thông báo giao hàng', 'shipping',
   'Chào {{customer_name}}, đơn hàng {{order_code}} đang được giao đến bạn!
🚚 Đơn vị vận chuyển: {{carrier}}
📋 Mã vận đơn: {{tracking_code}}
Dự kiến giao: {{estimated_date}}'),

  ('Nhắc bảo hành sắp hết', 'warranty_remind',
   'Chào {{customer_name}}, bảo hành sản phẩm {{product_name}} của bạn sắp hết hạn!
📅 Ngày hết hạn: {{warranty_end_date}}
⏰ Còn lại: {{days_remaining}} ngày
Liên hệ 0973515666 để được hỗ trợ gia hạn bảo hành.'),

  ('Chúc mừng sinh nhật', 'birthday',
   '🎂 Chúc mừng sinh nhật {{customer_name}}!
Hoàng Nam Audio gửi tặng bạn voucher giảm {{discount_percent}}% cho đơn hàng tiếp theo.
🎁 Mã voucher: {{voucher_code}}
⏰ Có hiệu lực đến: {{voucher_expiry}}
Chúc bạn có ngày sinh nhật vui vẻ! 🎉'),

  ('Khách lâu không mua', 'win_back',
   'Chào {{customer_name}}, lâu rồi không thấy bạn ghé Hoàng Nam Audio!
🎵 Chúng tôi có nhiều sản phẩm mới dành cho bạn.
🎁 Ưu đãi đặc biệt: Giảm {{discount_percent}}% đơn hàng tiếp theo.
Mã: {{voucher_code}}')
) AS vals(name, type, content)
WHERE NOT EXISTS (
  SELECT 1 FROM zalo_templates zt WHERE zt.tenant_id = t.id AND zt.type = vals.type
)
LIMIT 5;

-- ═══════════════════════════════════════
-- ZALO OA CHAT (nhận + trả lời tin nhắn KH)
-- ═══════════════════════════════════════

-- 5. Bảng hội thoại Zalo
CREATE TABLE IF NOT EXISTS zalo_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  zalo_user_id TEXT NOT NULL,
  zalo_user_name TEXT,
  zalo_user_avatar TEXT,
  customer_id UUID, -- link với bảng customers (auto-match by phone)
  customer_phone TEXT,
  assigned_to UUID, -- user_id nhân viên phụ trách
  assigned_name TEXT,
  status TEXT DEFAULT 'waiting', -- waiting, active, resolved
  tags TEXT[] DEFAULT '{}',
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_by TEXT, -- 'customer' hoặc 'staff'
  unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zalo_conv_tenant ON zalo_conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_zalo_conv_status ON zalo_conversations(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_zalo_conv_assigned ON zalo_conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_zalo_conv_zalo_user ON zalo_conversations(zalo_user_id);

-- 6. Bảng tin nhắn Zalo chat
CREATE TABLE IF NOT EXISTS zalo_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES zalo_conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL, -- 'inbound' (KH gửi) hoặc 'outbound' (shop trả lời)
  sender_type TEXT NOT NULL, -- 'customer' hoặc 'staff'
  sender_id TEXT, -- zalo_user_id hoặc user_id
  sender_name TEXT,
  message_type TEXT DEFAULT 'text', -- text, image, file, product_card, sticker
  content TEXT,
  attachments JSONB DEFAULT '[]',
  zalo_message_id TEXT, -- ID tin nhắn từ Zalo API
  status TEXT DEFAULT 'sent', -- sent, delivered, seen, failed
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zalo_chat_msg_conv ON zalo_chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_zalo_chat_msg_tenant ON zalo_chat_messages(tenant_id);

-- 7. Bảng ghi chú nội bộ (KH không thấy)
CREATE TABLE IF NOT EXISTS zalo_internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES zalo_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zalo_notes_conv ON zalo_internal_notes(conversation_id);

-- 8. Bảng trả lời nhanh
CREATE TABLE IF NOT EXISTS zalo_quick_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  category TEXT NOT NULL, -- greeting, price, shipping, warranty, closing
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zalo_qr_tenant ON zalo_quick_replies(tenant_id);

-- 9. Insert trả lời nhanh mặc định
INSERT INTO zalo_quick_replies (tenant_id, category, title, content, sort_order)
SELECT t.id, vals.category, vals.title, vals.content, vals.sort_order
FROM tenants t
CROSS JOIN (VALUES
  ('greeting', 'Chào KH', 'Chào bạn! Cảm ơn bạn đã liên hệ Hoàng Nam Audio. Mình có thể giúp gì cho bạn ạ?', 1),
  ('greeting', 'Chào KH quen', 'Chào bạn! Rất vui được gặp lại bạn. Hôm nay bạn cần tư vấn sản phẩm nào ạ?', 2),
  ('price', 'Báo giá', 'Dạ giá sản phẩm này hiện tại là ... đồng ạ. Bạn muốn mình tư vấn thêm không ạ?', 3),
  ('price', 'Giá ưu đãi', 'Hiện tại shop đang có chương trình ưu đãi, bạn sẽ được giảm ...% khi mua sản phẩm này ạ!', 4),
  ('shipping', 'Phí ship', 'Phí vận chuyển tùy khu vực ạ. Bạn cho mình địa chỉ nhận hàng để mình báo chính xác nhé!', 5),
  ('shipping', 'Thời gian giao', 'Đơn hàng sẽ được giao trong 2-3 ngày làm việc ạ. Nếu nội thành HCM thì 1-2 ngày thôi ạ!', 6),
  ('warranty', 'Bảo hành', 'Sản phẩm được bảo hành chính hãng 12 tháng ạ. Nếu có vấn đề bạn mang ra cửa hàng mình hỗ trợ ngay!', 7),
  ('warranty', 'Đổi trả', 'Shop hỗ trợ đổi trả trong 7 ngày nếu sản phẩm lỗi từ nhà sản xuất ạ.', 8),
  ('closing', 'Cảm ơn', 'Cảm ơn bạn đã mua hàng tại Hoàng Nam Audio! Chúc bạn trải nghiệm sản phẩm vui vẻ nhé!', 9),
  ('closing', 'Hẹn gặp lại', 'Cảm ơn bạn đã quan tâm! Nếu cần tư vấn thêm, bạn cứ nhắn tin cho mình nhé. Chúc bạn ngày vui!', 10)
) AS vals(category, title, content, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM zalo_quick_replies qr WHERE qr.tenant_id = t.id AND qr.title = vals.title
);
