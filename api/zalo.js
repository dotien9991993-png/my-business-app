/**
 * Vercel Serverless Function - Zalo OA API Proxy
 * Tránh CORS khi gọi Zalo API từ browser
 */
export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action, ...params } = req.body;

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
      console.log('[Zalo Proxy] API call:', params.method || 'GET', apiUrl);

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
      console.log('[Zalo Proxy] API response:', JSON.stringify(data).substring(0, 300));
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('Zalo proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
