/**
 * Vercel Serverless Function - Viettel Post API Proxy
 * Bypass CORS khi gọi VTP API từ browser
 *
 * POST /api/viettelpost
 * Body: { action, token, ...params }
 */

const BASE_URL = 'https://partner.viettelpost.vn/v2';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, token, ...params } = req.body;

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Token'] = token;

    let url, method = 'GET', body = null;

    switch (action) {
      case 'login':
        url = `${BASE_URL}/user/Login`;
        method = 'POST';
        body = JSON.stringify({ USERNAME: params.username, PASSWORD: params.password });
        break;
      case 'getProvinces':
        url = `${BASE_URL}/categories/listProvince`;
        break;
      case 'getDistricts':
        url = `${BASE_URL}/categories/listDistrict?provinceId=${params.provinceId}`;
        break;
      case 'getWards':
        url = `${BASE_URL}/categories/listWards?districtId=${params.districtId}`;
        break;
      case 'getPrice':
        url = `${BASE_URL}/order/getPrice`;
        method = 'POST';
        body = JSON.stringify(params.data);
        break;
      case 'createOrder':
        url = `${BASE_URL}/order/createOrder`;
        method = 'POST';
        body = JSON.stringify(params.data);
        break;
      case 'getTracking':
        url = `${BASE_URL}/order/getTracking?ORDER_NUMBER=${params.orderNumber}`;
        break;
      case 'cancelOrder':
        url = `${BASE_URL}/order/UpdateOrder`;
        method = 'POST';
        body = JSON.stringify({ TYPE: 4, ORDER_NUMBER: params.orderNumber, NOTE: params.note || 'Hủy đơn' });
        break;
      // Legacy action names (backward compat with viettelpostApi.js)
      case 'get_provinces':
        url = `${BASE_URL}/categories/listProvinceById?provinceId=-1`;
        break;
      case 'get_districts':
        url = `${BASE_URL}/categories/listDistrict?provinceId=${params.provinceId}`;
        break;
      case 'get_wards':
        url = `${BASE_URL}/categories/listWards?districtId=${params.districtId}`;
        break;
      case 'calculate_fee':
        url = `${BASE_URL}/order/getPrice`;
        method = 'POST';
        body = JSON.stringify(params.body);
        break;
      case 'create_order':
        url = `${BASE_URL}/order/createOrder`;
        method = 'POST';
        body = JSON.stringify(params.body);
        break;
      case 'get_order_detail':
        url = `${BASE_URL}/order/detail?orderId=${params.orderId}`;
        break;
      case 'get_services':
        url = `${BASE_URL}/categories/listService`;
        method = 'POST';
        body = JSON.stringify({});
        break;
      default:
        return res.status(400).json({ error: 'Invalid action: ' + action });
    }

    const fetchOptions = { method, headers };
    if (body) fetchOptions.body = body;

    const response = await fetch(url, fetchOptions);
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('VTP proxy error:', error);
    return res.status(500).json({ error: error.message });
  }
};
