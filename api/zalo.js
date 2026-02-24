/**
 * Vercel Serverless Function - Zalo OA API Proxy
 * Tránh CORS khi gọi Zalo API từ browser
 */

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
  // Cho phép tất cả subdomain *.hoangnamaudio.vn và *.vercel.app
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

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit check
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.' });
  }

  // Validate request body
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const { action, ...params } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Missing action' });
  }

  try {
    // === Lấy OAuth URL (cho nút "Kết nối Zalo OA") ===
    if (action === 'get_oauth_url') {
      const APP_ID = process.env.ZALO_APP_ID;
      const REDIRECT_URI =
        process.env.ZALO_REDIRECT_URI || `https://${req.headers.host}/api/zalo-callback`;

      if (!APP_ID) {
        return res.status(500).json({ error: 'Server chưa cấu hình ZALO_APP_ID' });
      }

      const state = params.state || '';
      const url =
        `https://oauth.zaloapp.com/v4/oa/permission?app_id=${APP_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&state=${encodeURIComponent(state)}`;

      return res.status(200).json({ url });
    }

    // === Refresh access token từ refresh token ===
    if (action === 'refresh_token') {
      const response = await fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'secret_key': (params.secret_key || '').trim(),
        },
        body: new URLSearchParams({
          refresh_token: (params.refresh_token || '').trim(),
          app_id: (params.app_id || '').trim(),
          grant_type: 'refresh_token',
        }).toString(),
      });

      const data = await response.json();
      return res.status(200).json(data);
    }

    // === Gọi Zalo OA API ===
    if (action === 'api_call') {
      const apiUrl = `https://openapi.zalo.me/v3.0/oa/${params.endpoint}`;

      const fetchOptions = {
        method: params.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          'access_token': params.access_token,
        },
      };

      if (params.body && params.method === 'POST') {
        fetchOptions.body = JSON.stringify(params.body);
      }

      const response = await fetch(apiUrl, fetchOptions);
      const data = await response.json();
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('Zalo proxy error:', error);
    return res.status(500).json({ error: 'Lỗi máy chủ. Vui lòng thử lại sau.' });
  }
}
