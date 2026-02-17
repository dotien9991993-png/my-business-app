/**
 * Zalo OA Helper - Quản lý gửi tin nhắn qua Zalo OA
 *
 * LƯU Ý: Zalo API cần gọi từ BACKEND (secret key).
 * Hiện tại dùng cách: lưu tin vào DB (queue) → gửi thủ công hoặc qua Edge Function.
 */
import { supabase } from '../supabaseClient';

// ============ TEMPLATE HELPERS ============

/**
 * Lấy template theo type
 */
export const getTemplate = async (tenantId, type) => {
  const { data, error } = await supabase
    .from('zalo_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('type', type)
    .eq('is_active', true)
    .single();

  if (error) return null;
  return data;
};

/**
 * Lấy tất cả templates
 */
export const getTemplates = async (tenantId) => {
  const { data, error } = await supabase
    .from('zalo_templates')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at');

  if (error) return [];
  return data || [];
};

/**
 * Điền placeholder vào template content
 * VD: fillTemplate("Chào {{name}}", { name: "Anh Tuấn" }) → "Chào Anh Tuấn"
 */
export const fillTemplate = (content, data) => {
  if (!content) return '';
  return content.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] ?? '');
};

// ============ MESSAGE QUEUE ============

/**
 * Thêm tin nhắn vào hàng đợi (lưu DB, status=pending)
 */
export const queueZaloMessage = async ({
  tenantId,
  templateId,
  customerId,
  customerName,
  customerPhone,
  type,
  content,
  relatedEntityType,
  relatedEntityId,
}) => {
  const { data, error } = await supabase
    .from('zalo_messages')
    .insert([{
      tenant_id: tenantId,
      template_id: templateId || null,
      customer_id: customerId || null,
      customer_name: customerName,
      customer_phone: customerPhone,
      type: type || 'manual',
      content,
      status: 'pending',
      related_entity_type: relatedEntityType || null,
      related_entity_id: relatedEntityId || null,
    }])
    .select()
    .single();

  if (error) {
    console.error('Lỗi tạo tin nhắn Zalo:', error);
    return null;
  }
  return data;
};

/**
 * Lấy config Zalo OA
 */
export const getZaloConfig = async (tenantId) => {
  const { data, error } = await supabase
    .from('zalo_config')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .single();

  if (error) return null;
  return data;
};

/**
 * Gửi tin nhắn Zalo (placeholder - sẽ kết nối API sau)
 * Hiện tại: cập nhật status trong DB
 */
export const sendZaloMessage = async (messageId) => {
  // TODO: Khi có Zalo API config, gọi API thật ở đây
  // Hiện tại giả lập thành công → cập nhật status = 'sent'
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('zalo_messages')
    .update({
      status: 'sent',
      sent_at: now,
    })
    .eq('id', messageId);

  if (error) {
    console.error('Lỗi cập nhật trạng thái tin nhắn:', error);
    return false;
  }
  return true;
};

/**
 * Gửi hàng loạt tin nhắn pending
 */
export const sendPendingMessages = async (tenantId) => {
  const { data: pending, error } = await supabase
    .from('zalo_messages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'pending')
    .order('created_at')
    .limit(50);

  if (error || !pending?.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;
  for (const msg of pending) {
    const ok = await sendZaloMessage(msg.id);
    if (ok) sent++;
    else failed++;
  }

  return { sent, failed };
};

/**
 * Lấy lịch sử tin nhắn
 */
export const getMessageHistory = async (tenantId, { status, type, from, to, page = 0, pageSize = 20 } = {}) => {
  let query = supabase
    .from('zalo_messages')
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1);

  if (status && status !== 'all') query = query.eq('status', status);
  if (type && type !== 'all') query = query.eq('type', type);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to + 'T23:59:59');

  const { data, error, count } = await query;
  if (error) return { data: [], count: 0 };
  return { data: data || [], count: count || 0 };
};

/**
 * Thống kê tin nhắn theo tháng
 */
export const getMessageStats = async (tenantId, monthStr) => {
  // monthStr format: '2026-02'
  const from = `${monthStr}-01`;
  const nextMonth = new Date(from);
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const to = nextMonth.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('zalo_messages')
    .select('status')
    .eq('tenant_id', tenantId)
    .gte('created_at', from)
    .lt('created_at', to);

  if (error) return { total: 0, sent: 0, failed: 0, read: 0 };

  const list = data || [];
  return {
    total: list.length,
    sent: list.filter(m => m.status === 'sent' || m.status === 'delivered' || m.status === 'read').length,
    failed: list.filter(m => m.status === 'failed').length,
    read: list.filter(m => m.status === 'read').length,
  };
};

// ============ TYPE LABELS ============

export const ZALO_MSG_TYPES = {
  order_confirm: { label: 'Xác nhận đơn hàng', icon: '📦', color: 'green' },
  shipping: { label: 'Thông báo giao hàng', icon: '🚚', color: 'blue' },
  warranty_remind: { label: 'Nhắc bảo hành', icon: '🛡️', color: 'orange' },
  birthday: { label: 'Chúc mừng sinh nhật', icon: '🎂', color: 'pink' },
  win_back: { label: 'Khách lâu không mua', icon: '💌', color: 'purple' },
  manual: { label: 'Gửi thủ công', icon: '✉️', color: 'gray' },
};

export const ZALO_MSG_STATUSES = {
  pending: { label: 'Chờ gửi', icon: '⏳', color: 'yellow' },
  sent: { label: 'Đã gửi', icon: '✅', color: 'green' },
  failed: { label: 'Lỗi', icon: '❌', color: 'red' },
  delivered: { label: 'Đã nhận', icon: '📬', color: 'blue' },
  read: { label: 'Đã đọc', icon: '👀', color: 'green' },
};
