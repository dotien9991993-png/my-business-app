/**
 * Vercel Serverless Function - Viettel Post API Proxy
 * Bypass CORS khi gọi VTP API từ browser
 *
 * POST /api/viettelpost
 * Body: { action, token, ...params }
 */

const BASE_URL = 'https://partner.viettelpost.vn/v2';

const ALLOWED_ORIGINS = [
  'https://in.hoangnamaudio.vn',
  'https://hoangnamaudio.vn',
  'http://localhost:5173'
];

// Rate limiting đơn giản (Map-based, 30 req/min/IP)
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 30;

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

export default async function handler(req, res) {
  const corsOrigin = getCorsOrigin(req);
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limit check
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' });
  }

  // Validate request body
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  try {
    const { action, token, ...params } = req.body;

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
      url = BASE_URL + '/order/createOrder';
      method = 'POST';
      body = JSON.stringify(params.data || params.body);
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
