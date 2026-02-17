/**
 * Zalo OA Automation - Tự động gửi tin nhắn theo kịch bản
 */
import { supabase } from '../supabaseClient';
import { getTemplate, fillTemplate, queueZaloMessage } from './zaloOA';

const formatMoney = (amount) => {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
};

// ============ A. XÁC NHẬN ĐƠN HÀNG ============

export const sendOrderConfirmation = async (tenantId, order, customer) => {
  if (!customer?.phone) return null;

  const template = await getTemplate(tenantId, 'order_confirm');
  if (!template) return null;

  const products = (order.items || []).map(i => i.product_name || i.name).join(', ');
  const content = fillTemplate(template.content, {
    customer_name: customer.name || customer.customer_name || 'Quý khách',
    order_code: order.order_code || order.code || '',
    total_amount: formatMoney(order.total_amount || order.total || 0),
    products: products || 'Sản phẩm đã đặt',
  });

  return queueZaloMessage({
    tenantId,
    templateId: template.id,
    customerId: customer.id,
    customerName: customer.name || customer.customer_name,
    customerPhone: customer.phone,
    type: 'order_confirm',
    content,
    relatedEntityType: 'order',
    relatedEntityId: order.id,
  });
};

// ============ B. THÔNG BÁO GIAO HÀNG ============

export const sendShippingNotification = async (tenantId, order, customer, trackingInfo = {}) => {
  if (!customer?.phone) return null;

  const template = await getTemplate(tenantId, 'shipping');
  if (!template) return null;

  const content = fillTemplate(template.content, {
    customer_name: customer.name || customer.customer_name || 'Quý khách',
    order_code: order.order_code || order.code || '',
    carrier: trackingInfo.carrier || 'Đang cập nhật',
    tracking_code: trackingInfo.tracking_code || 'Đang cập nhật',
    estimated_date: trackingInfo.estimated_date || 'Trong 2-3 ngày',
  });

  return queueZaloMessage({
    tenantId,
    templateId: template.id,
    customerId: customer.id,
    customerName: customer.name || customer.customer_name,
    customerPhone: customer.phone,
    type: 'shipping',
    content,
    relatedEntityType: 'order',
    relatedEntityId: order.id,
  });
};

// ============ C. NHẮC BẢO HÀNH SẮP HẾT ============

export const checkWarrantyReminders = async (tenantId) => {
  const today = new Date();
  const thirtyDaysLater = new Date(today);
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
  const todayStr = today.toISOString().slice(0, 10);
  const futureStr = thirtyDaysLater.toISOString().slice(0, 10);

  // Lấy thẻ BH sắp hết hạn
  const { data: cards, error } = await supabase
    .from('warranty_cards')
    .select('id, customer_name, customer_phone, product_name, end_date')
    .eq('tenant_id', tenantId)
    .gte('end_date', todayStr)
    .lte('end_date', futureStr)
    .eq('status', 'active');

  if (error || !cards?.length) return 0;

  // Lấy tin đã gửi loại warranty_remind trong tháng
  const { data: sentMsgs } = await supabase
    .from('zalo_messages')
    .select('related_entity_id')
    .eq('tenant_id', tenantId)
    .eq('type', 'warranty_remind')
    .gte('created_at', todayStr.slice(0, 7) + '-01');

  const sentIds = new Set((sentMsgs || []).map(m => m.related_entity_id));

  const template = await getTemplate(tenantId, 'warranty_remind');
  if (!template) return 0;

  let queued = 0;
  for (const card of cards) {
    if (sentIds.has(card.id)) continue;
    if (!card.customer_phone) continue;

    const daysRemaining = Math.ceil((new Date(card.end_date) - today) / (1000 * 60 * 60 * 24));
    const content = fillTemplate(template.content, {
      customer_name: card.customer_name || 'Quý khách',
      product_name: card.product_name || 'Sản phẩm',
      warranty_end_date: new Date(card.end_date).toLocaleDateString('vi-VN'),
      days_remaining: String(daysRemaining),
    });

    await queueZaloMessage({
      tenantId,
      templateId: template.id,
      customerName: card.customer_name,
      customerPhone: card.customer_phone,
      type: 'warranty_remind',
      content,
      relatedEntityType: 'warranty_card',
      relatedEntityId: card.id,
    });
    queued++;
  }
  return queued;
};

// ============ D. CHÚC MỪNG SINH NHẬT ============

export const checkBirthdayGreetings = async (tenantId) => {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  // Query customers có ngày sinh trùng hôm nay (tháng + ngày)
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, name, phone, birth_date')
    .eq('tenant_id', tenantId)
    .not('birth_date', 'is', null)
    .not('phone', 'is', null);

  if (error || !customers?.length) return 0;

  // Filter theo ngày sinh
  const birthdayCustomers = customers.filter(c => {
    if (!c.birth_date) return false;
    const bd = c.birth_date.slice(5); // "MM-DD"
    return bd === `${month}-${day}`;
  });

  if (birthdayCustomers.length === 0) return 0;

  // Check đã gửi năm nay chưa
  const yearStr = String(today.getFullYear());
  const { data: sentMsgs } = await supabase
    .from('zalo_messages')
    .select('customer_id')
    .eq('tenant_id', tenantId)
    .eq('type', 'birthday')
    .gte('created_at', `${yearStr}-01-01`);

  const sentCustomerIds = new Set((sentMsgs || []).map(m => m.customer_id));

  const template = await getTemplate(tenantId, 'birthday');
  if (!template) return 0;

  let queued = 0;
  for (const cust of birthdayCustomers) {
    if (sentCustomerIds.has(cust.id)) continue;

    const content = fillTemplate(template.content, {
      customer_name: cust.name || 'Quý khách',
      discount_percent: '10',
      voucher_code: `BD${yearStr}${cust.id.slice(0, 4).toUpperCase()}`,
      voucher_expiry: new Date(today.getTime() + 30 * 86400000).toLocaleDateString('vi-VN'),
    });

    await queueZaloMessage({
      tenantId,
      templateId: template.id,
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone,
      type: 'birthday',
      content,
    });
    queued++;
  }
  return queued;
};

// ============ E. KHÁCH LÂU KHÔNG MUA ============

export const checkWinBackCustomers = async (tenantId) => {
  const today = new Date();
  const sixtyDaysAgo = new Date(today);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const cutoffStr = sixtyDaysAgo.toISOString().slice(0, 10);

  // Lấy KH có đơn hàng cuối cùng > 60 ngày
  const { data: customers, error } = await supabase
    .from('customers')
    .select('id, name, phone, last_order_date')
    .eq('tenant_id', tenantId)
    .not('phone', 'is', null)
    .not('last_order_date', 'is', null)
    .lt('last_order_date', cutoffStr);

  if (error || !customers?.length) return 0;

  // Check đã gửi win_back trong 30 ngày gần
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const { data: sentMsgs } = await supabase
    .from('zalo_messages')
    .select('customer_id')
    .eq('tenant_id', tenantId)
    .eq('type', 'win_back')
    .gte('created_at', thirtyDaysAgo.toISOString());

  const recentlySent = new Set((sentMsgs || []).map(m => m.customer_id));

  const template = await getTemplate(tenantId, 'win_back');
  if (!template) return 0;

  let queued = 0;
  for (const cust of customers) {
    if (recentlySent.has(cust.id)) continue;

    const content = fillTemplate(template.content, {
      customer_name: cust.name || 'Quý khách',
      discount_percent: '15',
      voucher_code: `WB${cust.id.slice(0, 6).toUpperCase()}`,
    });

    await queueZaloMessage({
      tenantId,
      templateId: template.id,
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone,
      type: 'win_back',
      content,
    });
    queued++;
  }
  return queued;
};
