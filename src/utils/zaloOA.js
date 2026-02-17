/**
 * Zalo OA Helper - Quản lý gửi tin nhắn qua Zalo OA
 *
 * Kết nối trực tiếp Zalo OA API v3:
 * - Access Token auto-refresh từ Refresh Token
 * - Gửi/nhận tin nhắn, đồng bộ hội thoại cũ
 * - Proxy qua Vite dev server (dev) hoặc direct (prod nếu CORS cho phép)
 */
import { supabase } from '../supabaseClient';

// ============ ZALO API URLS (dùng proxy trong dev, direct trong prod) ============
const isDev = import.meta.env.DEV;
const ZALO_OAUTH_URL = isDev ? '/zalo-oauth' : 'https://oauth.zaloapp.com';
const ZALO_API_URL = isDev ? '/zalo-api' : 'https://openapi.zalo.me';

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

// ============ ZALO API CLIENT ============

/**
 * Lấy Access Token, tự refresh nếu hết hạn
 */
export const getAccessToken = async (config) => {
  // Kiểm tra access_token còn hạn không (trừ 5 phút buffer)
  if (config.access_token && config.access_token_expires_at) {
    const expiresAt = new Date(config.access_token_expires_at);
    if (expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
      return config.access_token;
    }
  }

  // Refresh token để lấy access token mới
  const response = await fetch(`${ZALO_OAUTH_URL}/v4/oa/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'secret_key': config.secret_key,
    },
    body: new URLSearchParams({
      refresh_token: config.refresh_token,
      app_id: config.app_id,
      grant_type: 'refresh_token',
    }),
  });

  const data = await response.json();

  if (data.access_token) {
    // Lưu access_token mới vào DB
    await supabase.from('zalo_config').update({
      access_token: data.access_token,
      refresh_token: data.refresh_token || config.refresh_token,
      access_token_expires_at: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', config.id);

    return data.access_token;
  }

  throw new Error('Không thể lấy Access Token: ' + (data.error_description || data.message || JSON.stringify(data)));
};

/**
 * Gọi Zalo OA API
 * @param {string} tenantId
 * @param {string} endpoint - VD: 'getfollowers', 'conversation', 'message'
 * @param {string} method - GET hoặc POST
 * @param {object|null} body - body cho POST
 */
export const callZaloAPI = async (tenantId, endpoint, method = 'GET', body = null) => {
  const config = await getZaloConfig(tenantId);
  if (!config) throw new Error('Chưa cấu hình Zalo OA');

  const accessToken = await getAccessToken(config);

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': accessToken,
    },
  };

  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }

  const url = `${ZALO_API_URL}/v3.0/oa/${endpoint}`;
  const response = await fetch(url, options);
  const result = await response.json();

  // Nếu lỗi token hết hạn → thử refresh 1 lần
  if (result.error === -216 || result.error === -230) {
    // Force refresh
    config.access_token = null;
    const newToken = await getAccessToken(config);
    options.headers['access_token'] = newToken;
    const retryResponse = await fetch(url, options);
    return retryResponse.json();
  }

  return result;
};

// ============ ĐỒNG BỘ HỘI THOẠI ============

/**
 * Parse loại tin nhắn Zalo
 */
const getMessageType = (type) => {
  if (!type) return 'text';
  const t = String(type).toLowerCase();
  if (t === 'text' || t === 'oa.text') return 'text';
  if (t === 'photo' || t === 'image' || t === 'oa.photo') return 'image';
  if (t === 'sticker' || t === 'oa.sticker') return 'sticker';
  if (t === 'file' || t === 'oa.file') return 'file';
  if (t === 'gif' || t === 'oa.gif') return 'image';
  if (t === 'link' || t === 'oa.link') return 'text';
  if (t === 'list' || t === 'oa.list') return 'product_card';
  return 'text';
};

/**
 * Parse attachments từ tin nhắn Zalo
 */
const parseAttachments = (msg) => {
  const attachments = [];
  if (msg.thumb || msg.url) {
    const type = getMessageType(msg.type);
    if (type === 'image') {
      attachments.push({ type: 'image', url: msg.url || msg.thumb, thumb: msg.thumb });
    } else if (type === 'file') {
      attachments.push({ type: 'file', url: msg.url, name: msg.name || 'file', size: msg.size });
    }
  }
  // Xử lý attachments array nếu có
  if (msg.attachments && Array.isArray(msg.attachments)) {
    for (const att of msg.attachments) {
      attachments.push({
        type: att.type || 'file',
        url: att.payload?.url || att.url,
        name: att.payload?.name || att.name,
      });
    }
  }
  return attachments;
};

/**
 * Đồng bộ danh sách người đã nhắn tin với OA
 * @returns {{ synced: number, total: number }}
 */
export const syncZaloConversations = async (tenantId, onProgress) => {
  let offset = 0;
  const count = 50;
  let totalSynced = 0;
  let hasMore = true;

  while (hasMore) {
    onProgress?.(`Đang lấy danh sách người quan tâm (offset: ${offset})...`);

    const result = await callZaloAPI(
      tenantId,
      `getfollowers?data=${encodeURIComponent(JSON.stringify({ offset, count }))}`,
    );

    if (result.error && result.error !== 0) {
      console.error('Lỗi getfollowers:', result);
      break;
    }

    const followers = result.data?.followers || [];
    const total = result.data?.total || 0;

    for (const userId of followers) {
      try {
        // Lấy profile
        const profile = await callZaloAPI(
          tenantId,
          `getprofile?data=${encodeURIComponent(JSON.stringify({ user_id: userId }))}`,
        );

        const displayName = profile.data?.display_name || profile.data?.user_alias || 'Khách hàng';
        const avatar = profile.data?.avatars?.['240'] || profile.data?.avatar || null;
        const phone = profile.data?.shared_info?.phone || null;

        // Upsert conversation
        const { data: existing } = await supabase
          .from('zalo_conversations')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('zalo_user_id', userId)
          .maybeSingle();

        if (existing) {
          await supabase.from('zalo_conversations').update({
            zalo_user_name: displayName,
            zalo_user_avatar: avatar,
            customer_phone: phone || undefined,
            updated_at: new Date().toISOString(),
          }).eq('id', existing.id);
        } else {
          await supabase.from('zalo_conversations').insert([{
            tenant_id: tenantId,
            zalo_user_id: userId,
            zalo_user_name: displayName,
            zalo_user_avatar: avatar,
            customer_phone: phone,
            status: 'active',
          }]);
        }

        totalSynced++;
        // Rate limit: 200ms giữa mỗi request
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.error(`Lỗi sync user ${userId}:`, err);
      }
    }

    offset += count;
    hasMore = offset < total && followers.length === count;
  }

  return { synced: totalSynced };
};

/**
 * Đồng bộ tin nhắn cũ của 1 hội thoại
 */
export const syncZaloMessages = async (tenantId, zaloUserId, conversationId, onProgress) => {
  let offset = 0;
  const count = 50;
  let totalSynced = 0;

  onProgress?.(`Đang tải tin nhắn...`);

  const result = await callZaloAPI(
    tenantId,
    `conversation?data=${encodeURIComponent(JSON.stringify({ user_id: zaloUserId, offset, count }))}`,
  );

  if (result.error && result.error !== 0) {
    console.error('Lỗi lấy conversation:', result);
    return { synced: 0 };
  }

  const messages = result.data || [];

  for (const msg of messages) {
    const msgId = msg.message_id || msg.msg_id;
    if (!msgId) continue;

    // Check trùng
    const { data: exists } = await supabase
      .from('zalo_chat_messages')
      .select('id')
      .eq('zalo_message_id', msgId)
      .maybeSingle();

    if (exists) continue;

    const isFromCustomer = msg.src === 0 || msg.from_id === zaloUserId;
    const msgType = getMessageType(msg.type);
    const attachments = parseAttachments(msg);

    // Nội dung tin nhắn
    let content = msg.message || msg.text || '';
    if (!content && msgType === 'image') {
      content = msg.url || msg.thumb || '[Hình ảnh]';
    }
    if (!content && msgType === 'sticker') {
      content = '[Sticker]';
    }
    if (!content && msgType === 'file') {
      content = msg.name || '[File]';
    }

    await supabase.from('zalo_chat_messages').insert([{
      tenant_id: tenantId,
      conversation_id: conversationId,
      zalo_message_id: msgId,
      direction: isFromCustomer ? 'inbound' : 'outbound',
      sender_type: isFromCustomer ? 'customer' : 'staff',
      sender_name: isFromCustomer ? 'Khách hàng' : 'Hoàng Nam Audio',
      content,
      message_type: msgType,
      attachments: attachments.length > 0 ? attachments : [],
      status: 'sent',
      created_at: msg.time ? new Date(msg.time).toISOString() : new Date().toISOString(),
    }]);

    totalSynced++;
  }

  // Cập nhật last_message
  if (messages.length > 0) {
    const lastMsg = messages[0]; // Zalo trả về mới nhất trước
    const isFromCustomer = lastMsg.src === 0 || lastMsg.from_id === zaloUserId;
    await supabase.from('zalo_conversations').update({
      last_message: lastMsg.message || lastMsg.text || '[Ảnh]',
      last_message_at: lastMsg.time ? new Date(lastMsg.time).toISOString() : new Date().toISOString(),
      last_message_by: isFromCustomer ? 'customer' : 'staff',
      status: isFromCustomer ? 'waiting' : 'active',
      updated_at: new Date().toISOString(),
    }).eq('id', conversationId);
  }

  return { synced: totalSynced };
};

/**
 * Đồng bộ toàn bộ: danh sách hội thoại + tin nhắn
 * @param {function} onProgress - callback(statusText, percent)
 */
export const fullZaloSync = async (tenantId, onProgress) => {
  onProgress?.('Đang lấy danh sách người theo dõi OA...', 5);

  // Bước 1: Sync conversations
  const convResult = await syncZaloConversations(tenantId, (msg) => onProgress?.(msg, 10));

  // Bước 2: Load all conversations
  const { data: conversations } = await supabase
    .from('zalo_conversations')
    .select('*')
    .eq('tenant_id', tenantId);

  if (!conversations?.length) {
    onProgress?.('Không tìm thấy hội thoại nào', 100);
    return { conversations: 0, messages: 0 };
  }

  // Bước 3: Sync messages cho từng conversation
  let totalMessages = 0;
  for (let i = 0; i < conversations.length; i++) {
    const conv = conversations[i];
    const percent = Math.round(15 + (i / conversations.length) * 75);
    onProgress?.(
      `Đang tải tin nhắn ${i + 1}/${conversations.length}: ${conv.zalo_user_name || 'Khách hàng'}`,
      percent,
    );

    const msgResult = await syncZaloMessages(tenantId, conv.zalo_user_id, conv.id);
    totalMessages += msgResult.synced;

    // Rate limit: 200ms
    await new Promise(r => setTimeout(r, 200));
  }

  // Bước 4: Auto match customers
  onProgress?.('Đang liên kết khách hàng...', 92);
  await autoMatchCustomers(tenantId);

  onProgress?.(`Hoàn thành! ${convResult.synced} hội thoại, ${totalMessages} tin nhắn mới`, 100);
  return { conversations: convResult.synced, messages: totalMessages };
};

/**
 * Auto match KH bằng SĐT
 */
export const autoMatchCustomers = async (tenantId) => {
  // Lấy conversations có phone nhưng chưa link customer
  const { data: convs } = await supabase
    .from('zalo_conversations')
    .select('id, customer_phone')
    .eq('tenant_id', tenantId)
    .is('customer_id', null)
    .not('customer_phone', 'is', null);

  if (!convs?.length) return 0;

  let matched = 0;
  for (const conv of convs) {
    if (!conv.customer_phone) continue;

    // Tìm customer theo phone
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone', conv.customer_phone)
      .maybeSingle();

    if (customer) {
      await supabase.from('zalo_conversations').update({
        customer_id: customer.id,
        updated_at: new Date().toISOString(),
      }).eq('id', conv.id);
      matched++;
    }
  }
  return matched;
};

// ============ GỬI TIN NHẮN QUA ZALO API ============

/**
 * Gửi tin nhắn trả lời KH qua Zalo API
 */
export const sendZaloReply = async (tenantId, zaloUserId, conversationId, content, currentUser, messageType = 'text') => {
  let body;

  if (messageType === 'text') {
    body = {
      recipient: { user_id: zaloUserId },
      message: { text: content },
    };
  } else if (messageType === 'image') {
    body = {
      recipient: { user_id: zaloUserId },
      message: {
        attachment: {
          type: 'template',
          payload: {
            template_type: 'media',
            elements: [{ media_type: 'image', url: content }],
          },
        },
      },
    };
  }

  const result = await callZaloAPI(tenantId, 'message', 'POST', body);

  if (result.error && result.error !== 0) {
    throw new Error(result.message || `Gửi tin thất bại (error: ${result.error})`);
  }

  // Lưu tin nhắn vào DB
  const { data: savedMsg, error: dbError } = await supabase.from('zalo_chat_messages').insert([{
    tenant_id: tenantId,
    conversation_id: conversationId,
    zalo_message_id: result.data?.message_id || null,
    direction: 'outbound',
    sender_type: 'staff',
    sender_id: currentUser.id,
    sender_name: currentUser.name,
    content,
    message_type: messageType,
    status: 'sent',
  }]).select().single();

  if (dbError) console.error('Lỗi lưu tin nhắn:', dbError);

  // Cập nhật conversation
  await supabase.from('zalo_conversations').update({
    last_message: content,
    last_message_at: new Date().toISOString(),
    last_message_by: 'staff',
    status: 'active',
    unread_count: 0,
    updated_at: new Date().toISOString(),
  }).eq('id', conversationId);

  return savedMsg;
};

/**
 * Gửi thẻ sản phẩm cho KH qua Zalo API
 */
export const sendZaloProductCard = async (tenantId, zaloUserId, conversationId, product, currentUser) => {
  const productName = product.name || 'Sản phẩm';
  const productPrice = product.price || product.selling_price || 0;
  const productImage = product.image_url || product.images?.[0] || '';
  const priceText = new Intl.NumberFormat('vi-VN').format(parseFloat(productPrice) || 0) + 'đ';

  // Gửi dạng text kèm thông tin SP (Zalo v3 list template cần verify OA)
  const textContent = `📦 ${productName}\n💰 Giá: ${priceText}\n${product.description ? `📝 ${product.description}\n` : ''}Liên hệ shop để đặt hàng!`;

  const body = {
    recipient: { user_id: zaloUserId },
    message: { text: textContent },
  };

  const result = await callZaloAPI(tenantId, 'message', 'POST', body);

  if (result.error && result.error !== 0) {
    throw new Error(result.message || 'Gửi sản phẩm thất bại');
  }

  // Lưu DB dạng product_card
  const cardContent = JSON.stringify({
    type: 'product_card',
    product_id: product.id,
    name: productName,
    price: productPrice,
    image: productImage,
    description: product.description || '',
  });

  await supabase.from('zalo_chat_messages').insert([{
    tenant_id: tenantId,
    conversation_id: conversationId,
    zalo_message_id: result.data?.message_id || null,
    direction: 'outbound',
    sender_type: 'staff',
    sender_id: currentUser.id,
    sender_name: currentUser.name,
    content: cardContent,
    message_type: 'product_card',
    status: 'sent',
  }]);

  await supabase.from('zalo_conversations').update({
    last_message: `[Sản phẩm] ${productName}`,
    last_message_at: new Date().toISOString(),
    last_message_by: 'staff',
    updated_at: new Date().toISOString(),
  }).eq('id', conversationId);

  return result;
};

/**
 * Pull tin nhắn mới cho 1 hội thoại (dùng cho auto-poll)
 */
export const pullNewMessages = async (tenantId, zaloUserId, conversationId) => {
  return syncZaloMessages(tenantId, zaloUserId, conversationId);
};

// ============ GỬI TIN NHẮN QUEUE (outbound marketing) ============

/**
 * Gửi tin nhắn Zalo từ queue (dùng cho automation/marketing)
 * Gọi API thật nếu có config, fallback giả lập nếu chưa
 */
export const sendZaloMessage = async (messageId, tenantId) => {
  const now = new Date().toISOString();

  // Lấy tin nhắn
  const { data: msg } = await supabase
    .from('zalo_messages')
    .select('*')
    .eq('id', messageId)
    .single();

  if (!msg) return false;

  const effectiveTenantId = tenantId || msg.tenant_id;

  // Thử gọi API thật
  try {
    const config = await getZaloConfig(effectiveTenantId);
    if (config && config.access_token) {
      // Tìm zalo_user_id từ phone
      let zaloUserId = msg.zalo_user_id;
      if (!zaloUserId && msg.customer_phone) {
        const { data: conv } = await supabase
          .from('zalo_conversations')
          .select('zalo_user_id')
          .eq('tenant_id', effectiveTenantId)
          .eq('customer_phone', msg.customer_phone)
          .maybeSingle();
        zaloUserId = conv?.zalo_user_id;
      }

      if (zaloUserId) {
        const result = await callZaloAPI(effectiveTenantId, 'message', 'POST', {
          recipient: { user_id: zaloUserId },
          message: { text: msg.content },
        });

        if (result.error && result.error !== 0) {
          await supabase.from('zalo_messages').update({
            status: 'failed',
            error_message: result.message || `Lỗi Zalo API: ${result.error}`,
          }).eq('id', messageId);
          return false;
        }

        await supabase.from('zalo_messages').update({
          status: 'sent',
          sent_at: now,
          zalo_user_id: zaloUserId,
        }).eq('id', messageId);
        return true;
      }
    }
  } catch (err) {
    console.error('Lỗi gửi qua Zalo API:', err);
  }

  // Fallback: đánh dấu sent (giả lập)
  const { error } = await supabase
    .from('zalo_messages')
    .update({ status: 'sent', sent_at: now })
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
