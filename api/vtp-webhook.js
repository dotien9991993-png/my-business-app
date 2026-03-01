/**
 * Vercel Serverless Function - VTP Webhook
 * POST /api/vtp-webhook
 * Receives VTP status updates and auto-updates order shipping_status
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

// Map VTP status codes → shipping_status
const mapVtpStatus = (statusCode) => {
  const code = parseInt(statusCode);
  if (code >= 100 && code <= 102) return 'shipped';     // Lấy hàng
  if (code >= 103 && code <= 104) return 'in_transit';   // Đang vận chuyển
  if (code >= 200 && code <= 201) return 'delivered';    // Đã giao
  if (code === 300) return 'delivery_failed';            // Giao thất bại
  if (code >= 400 && code <= 401) return 'returned_to_sender'; // Hoàn hàng
  if (code >= 500) return 'delivery_failed';             // Lỗi
  return null;
};

// Map VTP status to legacy status
const mapLegacyStatus = (shippingStatus) => {
  const map = {
    shipped: 'shipping',
    in_transit: 'shipping',
    delivered: 'delivered',
    delivery_failed: 'shipping',
    returned_to_sender: 'returned',
  };
  return map[shippingStatus] || null;
};

export default async function handler(req, res) {
  // Only accept POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify webhook token
  const webhookToken = process.env.VTP_WEBHOOK_TOKEN;
  if (webhookToken) {
    const authHeader = req.headers['x-webhook-token'] || req.headers.authorization || req.query.token;
    if (authHeader !== webhookToken && authHeader !== `Bearer ${webhookToken}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const payload = req.body;
    if (!payload) {
      return res.status(400).json({ error: 'Empty body' });
    }

    // VTP webhook format: { ORDER_NUMBER, ORDER_STATUS, STATUS_NAME, ... }
    const trackingNumber = payload.ORDER_NUMBER || payload.order_number || payload.tracking_number;
    const statusCode = payload.ORDER_STATUS || payload.order_status || payload.status_code;
    const statusName = payload.STATUS_NAME || payload.status_name || '';

    if (!trackingNumber) {
      return res.status(400).json({ error: 'Missing tracking number' });
    }

    const newShippingStatus = mapVtpStatus(statusCode);
    if (!newShippingStatus) {
      // Unknown status, just log it
      console.log('[VTP Webhook] Unknown status code:', statusCode, 'for', trackingNumber);
      return res.status(200).json({ ok: true, skipped: true, reason: 'Unknown status code' });
    }

    // Find order by tracking_number
    const { data: order, error: findErr } = await supabase
      .from('orders')
      .select('id, tenant_id, order_number, shipping_status, order_status, payment_status, payment_method, total_amount, paid_amount, status')
      .eq('tracking_number', trackingNumber)
      .single();

    if (findErr || !order) {
      console.log('[VTP Webhook] Order not found for tracking:', trackingNumber);
      return res.status(200).json({ ok: true, skipped: true, reason: 'Order not found' });
    }

    // Skip if status hasn't changed
    if (order.shipping_status === newShippingStatus) {
      return res.status(200).json({ ok: true, skipped: true, reason: 'Status unchanged' });
    }

    const oldShippingStatus = order.shipping_status;
    const updates = {
      shipping_status: newShippingStatus,
      updated_at: new Date().toISOString(),
    };

    // Update legacy status
    const legacyStatus = mapLegacyStatus(newShippingStatus);
    if (legacyStatus) updates.status = legacyStatus;

    // Auto: delivered + COD → payment_status = 'paid'
    if (newShippingStatus === 'delivered' && order.payment_method === 'cod') {
      updates.payment_status = 'paid';
      updates.paid_amount = order.total_amount;
    }

    // Auto: delivered + paid → order_status = 'completed'
    const effectivePaymentStatus = updates.payment_status || order.payment_status;
    if (newShippingStatus === 'delivered' && effectivePaymentStatus === 'paid') {
      updates.order_status = 'completed';
      updates.status = 'completed';
    }

    // Update order
    await supabase.from('orders').update(updates).eq('id', order.id);

    // Log status change
    await supabase.from('order_status_logs').insert([{
      tenant_id: order.tenant_id,
      order_id: order.id,
      field_name: 'shipping_status',
      old_status: oldShippingStatus,
      new_status: newShippingStatus,
      source: 'webhook',
      raw_data: payload,
      created_by: 'VTP Webhook',
    }]);

    // Insert tracking event
    await supabase.from('shipping_tracking_events').insert([{
      tenant_id: order.tenant_id,
      order_id: order.id,
      tracking_number: trackingNumber,
      status: statusName || newShippingStatus,
      description: `VTP Webhook: ${statusName || newShippingStatus}`,
      source: 'vtp_webhook',
      event_time: new Date().toISOString(),
    }]);

    console.log(`[VTP Webhook] Updated ${order.order_number}: ${oldShippingStatus} → ${newShippingStatus}`);

    return res.status(200).json({
      ok: true,
      order_number: order.order_number,
      old_status: oldShippingStatus,
      new_status: newShippingStatus,
    });
  } catch (err) {
    console.error('[VTP Webhook] Error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
