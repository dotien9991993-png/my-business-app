/**
 * Vercel Serverless Function - Viettel Post API Proxy
 * Bypass CORS khi gọi VTP API từ browser
 *
 * POST /api/viettelpost
 * Body: { action, token, ...params }
 */

import { createClient } from '@supabase/supabase-js';

const BASE_URL = 'https://partner.viettelpost.vn/v2';

const ALLOWED_ORIGINS = [
  'https://in.hoangnamaudio.vn',
  'https://hoangnamaudio.vn',
  'http://localhost:5173'
];

// Rate limiting (60 req/min/IP for bulk push support)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 60;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimitMap.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) return false;
  return true;
}

function getCorsOrigin(req) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)
    || /^https:\/\/[a-z0-9-]+\.hoangnamaudio\.vn$/.test(origin)
    || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
    return origin;
  }
  return ALLOWED_ORIGINS[0];
}

// Auto-refresh VTP token khi hết hạn
async function refreshVtpToken(tenantId, oldToken) {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return null;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Tìm VTP credentials trong system_settings
    const { data: cred } = await supabase
      .from('system_settings')
      .select('value')
      .eq('category', 'shipping')
      .eq('key', 'vtp_credentials')
      .eq('tenant_id', tenantId)
      .single();

    if (!cred?.value?.username || !cred?.value?.password) {
      console.log('[VTP] No stored credentials for tenant:', tenantId);
      return null;
    }

    // Login VTP
    const loginResp = await fetch(BASE_URL + '/user/Login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ USERNAME: cred.value.username, PASSWORD: cred.value.password }),
    });
    const loginData = await loginResp.json();

    if (!loginData?.data?.token) {
      console.error('[VTP] Auto-refresh login failed:', loginData?.message);
      return null;
    }

    const newToken = loginData.data.token;
    console.log('[VTP] Token refreshed successfully for tenant:', tenantId);

    // Update token in shipping_configs
    await supabase.from('shipping_configs').update({
      api_token: newToken,
      updated_at: new Date().toISOString(),
    }).eq('tenant_id', tenantId).eq('provider', 'viettel_post');

    return newToken;
  } catch (err) {
    console.error('[VTP] Token refresh error:', err.message);
    return null;
  }
}

// Detect token expired from VTP response
function isTokenExpired(rawText, httpStatus) {
  if (!rawText || rawText.trim() === '') return true;
  try {
    const json = JSON.parse(rawText);
    if (json.status === -108 || json.status === 401) return true;
    if (json.error === true && /token|auth|unauthorized|hết hạn|expired/i.test(json.message || '')) return true;
  } catch (_) { /* not json */ }
  return httpStatus === 401;
}

export default async function handler(req, res) {
  const corsOrigin = getCorsOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' });
  }

  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    const { action, token, tenantId, ...params } = req.body;

    if (!action) {
      return res.status(400).json({ error: 'Missing action' });
    }

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Token'] = token;

    let url, method = 'GET', body = null;

    if (action === 'login') {
      url = BASE_URL + '/user/Login';
      method = 'POST';
      body = JSON.stringify({ USERNAME: params.username, PASSWORD: params.password });
    } else if (action === 'getProvinces' || action === 'get_provinces') {
      url = BASE_URL + '/categories/listProvince';
    } else if (action === 'getDistricts' || action === 'get_districts') {
      url = BASE_URL + '/categories/listDistrict?provinceId=' + params.provinceId;
    } else if (action === 'getWards' || action === 'get_wards') {
      url = BASE_URL + '/categories/listWards?districtId=' + params.districtId;
    } else if (action === 'getPrice' || action === 'calculate_fee') {
      url = BASE_URL + '/order/getPrice';
      method = 'POST';
      body = JSON.stringify(params.data || params.body);
    } else if (action === 'createOrder' || action === 'create_order') {
      const orderBody = params.orderData;
      if (!orderBody) {
        return res.status(400).json({ error: true, message: 'Missing orderData' });
      }
      if (!token) {
        return res.status(400).json({ error: true, message: 'Missing VTP token. Vui lòng kết nối lại Viettel Post trong Cài đặt.' });
      }

      const vtpUrl = BASE_URL + '/order/createOrder';
      console.log('[VTP createOrder] Token length:', token?.length, 'Body keys:', Object.keys(orderBody).join(','));

      // Attempt createOrder with retry on token expiry
      let currentToken = token;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const vtpResp = await fetch(vtpUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Token': currentToken },
            body: JSON.stringify(orderBody)
          });

          const rawText = await vtpResp.text();
          console.log('[VTP createOrder] Attempt', attempt + 1, 'HTTP:', vtpResp.status, 'Len:', rawText?.length);

          if (isTokenExpired(rawText, vtpResp.status) && attempt === 0 && tenantId) {
            console.log('[VTP createOrder] Token expired, attempting refresh...');
            const newToken = await refreshVtpToken(tenantId, currentToken);
            if (newToken) {
              currentToken = newToken;
              continue; // retry with new token
            }
            return res.status(200).json({
              error: true,
              token_expired: true,
              message: 'Token VTP hết hạn. Vui lòng đăng nhập lại trong Cài đặt > Vận chuyển.',
            });
          }

          if (!rawText || rawText.trim() === '') {
            return res.status(200).json({
              error: true,
              token_expired: true,
              message: `VTP trả về response rỗng (HTTP ${vtpResp.status}). Token có thể hết hạn.`
            });
          }

          try {
            const data = JSON.parse(rawText);
            // Return refreshed token to frontend if we refreshed
            if (attempt === 1) data._refreshed_token = currentToken;
            return res.status(200).json(data);
          } catch (_e) {
            return res.status(200).json({
              error: true,
              message: 'VTP response không phải JSON: ' + rawText.substring(0, 500)
            });
          }
        } catch (fetchErr) {
          console.error('[VTP createOrder] Fetch error:', fetchErr);
          return res.status(200).json({ error: true, message: 'Lỗi kết nối VTP: ' + fetchErr.message });
        }
      }

      return res.status(200).json({ error: true, message: 'VTP request failed after retry' });
    } else if (action === 'getTracking' || action === 'get_order_detail') {
      const id = params.orderNumber || params.orderId;
      url = BASE_URL + '/order/getTracking?ORDER_NUMBER=' + id;
    } else if (action === 'cancelOrder') {
      url = BASE_URL + '/order/UpdateOrder';
      method = 'POST';
      body = JSON.stringify({ TYPE: 4, ORDER_NUMBER: params.orderNumber, NOTE: params.note || 'Hủy đơn' });
    } else if (action === 'get_services') {
      url = BASE_URL + '/categories/listService';
      method = 'POST';
      body = JSON.stringify({});
    } else if (action === 'get_price_all') {
      url = BASE_URL + '/order/getPriceAll';
      method = 'POST';
      body = JSON.stringify(params.data || params.body);
    } else {
      return res.status(400).json({ error: 'Invalid action: ' + action });
    }

    const fetchOptions = { method, headers };
    if (body) fetchOptions.body = body;

    const response = await fetch(url, fetchOptions);
    const text = await response.text();

    try {
      const data = JSON.parse(text);
      return res.status(200).json(data);
    } catch (_e) {
      return res.status(200).json({ raw: text, error: 'Invalid JSON from VTP' });
    }
  } catch (error) {
    console.error('VTP proxy error:', error);
    return res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại sau.' });
  }
}
