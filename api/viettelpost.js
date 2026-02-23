/**
 * Vercel Serverless Function - Viettel Post API Proxy
 * Bypass CORS khi gọi VTP API từ browser
 *
 * POST /api/viettelpost
 * Body: { action, token, ...params }
 */

const VTP_BASE = 'https://partner.viettelpost.vn/v2';

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

  const { action, token, ...params } = req.body;

  if (!action) {
    return res.status(400).json({ error: 'Missing action' });
  }

  try {
    let vtpUrl;
    let method = 'GET';
    let body = null;

    switch (action) {
      case 'get_provinces':
        vtpUrl = `${VTP_BASE}/categories/listProvinceById?provinceId=-1`;
        break;

      case 'get_districts':
        vtpUrl = `${VTP_BASE}/categories/listDistrict?provinceId=${params.provinceId}`;
        break;

      case 'get_wards':
        vtpUrl = `${VTP_BASE}/categories/listWards?districtId=${params.districtId}`;
        break;

      case 'calculate_fee':
        vtpUrl = `${VTP_BASE}/order/getPrice`;
        method = 'POST';
        body = params.body;
        break;

      case 'create_order':
        vtpUrl = `${VTP_BASE}/order/createOrder`;
        method = 'POST';
        body = params.body;
        break;

      case 'get_order_detail':
        vtpUrl = `${VTP_BASE}/order/detail?orderId=${params.orderId}`;
        break;

      case 'get_services':
        vtpUrl = `${VTP_BASE}/categories/listService`;
        method = 'POST';
        body = {};
        break;

      case 'login':
        vtpUrl = `${VTP_BASE}/user/Login`;
        method = 'POST';
        body = params.body;
        break;

      default:
        return res.status(400).json({ error: `Invalid action: ${action}` });
    }

    const fetchOpts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Token': token } : {})
      }
    };
    if (body) {
      fetchOpts.body = JSON.stringify(body);
    }

    const response = await fetch(vtpUrl, fetchOpts);
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('VTP proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
}
