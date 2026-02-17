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
    if (action === 'get_token') {
      // Lấy access token từ refresh token
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

    if (action === 'api_call') {
      // Gọi Zalo OA API
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

      const response = await fetch(
        `https://openapi.zalo.me/v3.0/oa/${params.endpoint}`,
        fetchOptions,
      );

      const data = await response.json();
      return res.status(200).json(data);
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('Zalo proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
