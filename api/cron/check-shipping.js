/**
 * Vercel Cron Job - Check VTP Shipping Status
 * Runs every 2 hours: 0 *​/2 * * *
 * Polls VTP API for orders with active shipping, updates status
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

const VTP_BASE = 'https://partner.viettelpost.vn/v2';

const mapVtpStatusCode = (code) => {
  const c = parseInt(code);
  if (c >= 100 && c <= 102) return 'shipped';
  if (c >= 103 && c <= 104) return 'in_transit';
  if (c >= 200 && c <= 201) return 'delivered';
  if (c === 300) return 'delivery_failed';
  if (c >= 400 && c <= 401) return 'returned_to_sender';
  if (c >= 500) return 'delivery_failed';
  return null;
};

const mapLegacy = (ss) => {
  const m = { shipped: 'shipping', in_transit: 'shipping', delivered: 'delivered', delivery_failed: 'shipping', returned_to_sender: 'returned' };
  return m[ss] || null;
};

export default async function handler(req, res) {
  // Verify cron secret (Vercel adds this header)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow in development or when no CRON_SECRET set
    if (process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // Get all active shipping configs with VTP tokens
    const { data: configs } = await supabase
      .from('shipping_configs')
      .select('tenant_id, api_token')
      .eq('provider', 'viettel_post')
      .eq('is_active', true);

    if (!configs || configs.length === 0) {
      return res.status(200).json({ ok: true, message: 'No active VTP configs' });
    }

    let totalChecked = 0;
    let totalUpdated = 0;

    for (const config of configs) {
      // Get orders with active shipping for this tenant
      const { data: orders } = await supabase
        .from('orders')
        .select('id, tenant_id, order_number, tracking_number, shipping_status, order_status, payment_status, payment_method, total_amount, paid_amount, shipping_metadata, status')
        .eq('tenant_id', config.tenant_id)
        .in('shipping_status', ['shipped', 'in_transit', 'pickup'])
        .not('tracking_number', 'is', null)
        .limit(50);

      if (!orders || orders.length === 0) continue;

      for (const order of orders) {
        const vtpCode = order.shipping_metadata?.vtp_order_code || order.tracking_number;
        if (!vtpCode) continue;

        totalChecked++;

        try {
          // Call VTP API to get order detail
          const vtpRes = await fetch(`${VTP_BASE}/order/getOrderDetail`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Token: config.api_token },
            body: JSON.stringify({ ORDER_NUMBER: vtpCode }),
          });
          const vtpData = await vtpRes.json();

          if (!vtpData || vtpData.status !== 200 || !vtpData.data) continue;

          const statusCode = vtpData.data.ORDER_STATUS || vtpData.data.STATUS_ID;
          const statusName = vtpData.data.STATUS_NAME || '';
          const newShippingStatus = mapVtpStatusCode(statusCode);

          if (!newShippingStatus || newShippingStatus === order.shipping_status) continue;

          const updates = {
            shipping_status: newShippingStatus,
            updated_at: new Date().toISOString(),
          };
          const legacyStatus = mapLegacy(newShippingStatus);
          if (legacyStatus) updates.status = legacyStatus;

          // Auto: delivered + COD → paid
          if (newShippingStatus === 'delivered' && order.payment_method === 'cod') {
            updates.payment_status = 'paid';
            updates.paid_amount = order.total_amount;
          }
          // Auto: delivered + paid → completed
          const effPayment = updates.payment_status || order.payment_status;
          if (newShippingStatus === 'delivered' && effPayment === 'paid') {
            updates.order_status = 'completed';
            updates.status = 'completed';
          }

          await supabase.from('orders').update(updates).eq('id', order.id);

          // Log
          await supabase.from('order_status_logs').insert([{
            tenant_id: order.tenant_id,
            order_id: order.id,
            field_name: 'shipping_status',
            old_status: order.shipping_status,
            new_status: newShippingStatus,
            source: 'polling',
            raw_data: vtpData.data,
            created_by: 'Cron: check-shipping',
          }]);

          // Tracking event
          await supabase.from('shipping_tracking_events').insert([{
            tenant_id: order.tenant_id,
            order_id: order.id,
            tracking_number: vtpCode,
            status: statusName || newShippingStatus,
            description: `Auto polling: ${statusName || newShippingStatus}`,
            source: 'vtp_polling',
            event_time: new Date().toISOString(),
          }]);

          totalUpdated++;
          console.log(`[Check Shipping] ${order.order_number}: ${order.shipping_status} → ${newShippingStatus}`);
        } catch (apiErr) {
          console.error(`[Check Shipping] Error for ${order.order_number}:`, apiErr.message);
        }
      }
    }

    return res.status(200).json({
      ok: true,
      checked: totalChecked,
      updated: totalUpdated,
    });
  } catch (err) {
    console.error('[Check Shipping] Error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
