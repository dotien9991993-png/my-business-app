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
