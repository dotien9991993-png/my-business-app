/**
 * Vercel Serverless Function - Viettel Post API Proxy
 * Bypass CORS khi gọi VTP API từ browser
 *
 * POST /api/viettelpost
 * Body: { action, token, ...params }
 */

const BASE_URL = 'https://partner.viettelpost.vn/v2';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { action, token, ...params } = req.body || {};

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
    } catch (e) {
      return res.status(200).json({ raw: text, error: 'Invalid JSON from VTP' });
    }
  } catch (error) {
    return res.status(500).json({ error: error.message, stack: error.stack });
  }
}
