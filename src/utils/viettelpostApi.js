/**
 * Viettel Post API Utility
 * Gọi qua proxy /api/viettelpost để bypass CORS
 */

const PROXY_URL = '/api/viettelpost';

// ---- In-memory cache ----
let provincesCache = null;
const districtsCache = new Map();
const wardsCache = new Map();

async function vtpProxy(action, token, params = {}) {
  try {
    const resp = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, token, ...params })
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { success: false, data: null, error: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
    }
    const json = await resp.json();

    // VTP response format: { status: 200, error: false, message: "Success", data: ... }
    // Error format: { status: -108, error: true, message: "..." } hoặc { status: 400/401/500, ... }
    // Check success: status phải là 200 VÀ error không phải true
    if (json.error === true || (json.status != null && json.status !== 200)) {
      const msg = json.message || json.error_message || JSON.stringify(json).slice(0, 300);
      console.warn('[VTP] API error:', action, msg);
      return { success: false, data: null, error: msg };
    }

    // Nếu có json.data → trả data, nếu không có status field (raw response) → trả json
    return { success: true, data: json.data != null ? json.data : json, error: null };
  } catch (err) {
    return { success: false, data: null, error: err.message || 'Không thể kết nối Viettel Post' };
  }
}

// ---- Categories ----

export async function getProvinces(token) {
  if (provincesCache) return { success: true, data: provincesCache, error: null };
  const result = await vtpProxy('get_provinces', token);
  if (result.success && Array.isArray(result.data)) {
    provincesCache = result.data;
  }
  return result;
}

export async function getDistricts(token, provinceId) {
  const key = String(provinceId);
  if (districtsCache.has(key)) return { success: true, data: districtsCache.get(key), error: null };
  const result = await vtpProxy('get_districts', token, { provinceId });
  if (result.success && Array.isArray(result.data)) {
    districtsCache.set(key, result.data);
  }
  return result;
}

export async function getWards(token, districtId) {
  const key = String(districtId);
  if (wardsCache.has(key)) return { success: true, data: wardsCache.get(key), error: null };
  const result = await vtpProxy('get_wards', token, { districtId });
  if (result.success && Array.isArray(result.data)) {
    wardsCache.set(key, result.data);
  }
  return result;
}

// ---- Calculate shipping fee ----

export async function calculateFee(token, {
  senderProvince, senderDistrict,
  receiverProvince, receiverDistrict,
  productWeight, productPrice, codAmount,
  orderService = 'VCN', productType = 'HH'
}) {
  const body = {
    PRODUCT_WEIGHT: productWeight,      // grams
    PRODUCT_PRICE: productPrice,        // VND
    MONEY_COLLECTION: codAmount || 0,   // COD amount
    ORDER_SERVICE_ADD: '',
    ORDER_SERVICE: orderService,        // VCN = standard, VTK = economy
    SENDER_PROVINCE: senderProvince,
    SENDER_DISTRICT: senderDistrict,
    RECEIVER_PROVINCE: receiverProvince,
    RECEIVER_DISTRICT: receiverDistrict,
    PRODUCT_TYPE: productType,
    NATIONAL_TYPE: 1                    // domestic
  };
  return vtpProxy('calculate_fee', token, { body });
}

// ---- Create shipping order ----

export async function createOrder(token, params) {
  // Format delivery date as dd/mm/yyyy
  const now = new Date();
  const deliveryDate = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  // Ensure Number for IDs, String for text
  const safeWeight = Math.max(Number(params.productWeight || 0), 200);
  const codAmt = Number(params.codAmount || 0);
  const payment = params.orderPayment != null ? Number(params.orderPayment) : (codAmt > 0 ? 3 : 1);

  // Build VTP body — all fields UPPER_SNAKE_CASE, correct types
  const orderData = {
    ORDER_NUMBER: String(params.partnerOrderNumber || ''),
    GROUPADDRESS_ID: 0,
    CUS_ID: 0,
    DELIVERY_DATE: deliveryDate,
    SENDER_FULLNAME: String(params.senderName || ''),
    SENDER_ADDRESS: String(params.senderAddress || ''),
    SENDER_PHONE: String(params.senderPhone || ''),
    SENDER_EMAIL: '',
    SENDER_WARD: Number(params.senderWard || 0),
    SENDER_DISTRICT: Number(params.senderDistrict || 0),
    SENDER_PROVINCE: Number(params.senderProvince || 0),
    RECEIVER_FULLNAME: String(params.receiverName || ''),
    RECEIVER_ADDRESS: String(params.receiverAddress || ''),
    RECEIVER_PHONE: String(params.receiverPhone || ''),
    RECEIVER_EMAIL: '',
    RECEIVER_WARD: Number(params.receiverWard || 0),
    RECEIVER_DISTRICT: Number(params.receiverDistrict || 0),
    RECEIVER_PROVINCE: Number(params.receiverProvince || 0),
    PRODUCT_NAME: String(params.productName || 'Hàng hóa'),
    PRODUCT_DESCRIPTION: String(params.productDescription || params.productName || 'Hàng hóa'),
    PRODUCT_QUANTITY: Number(params.productQuantity || 1),
    PRODUCT_PRICE: Number(params.productPrice || 0),
    PRODUCT_WEIGHT: safeWeight,
    PRODUCT_LENGTH: Number(params.productLength || 30),
    PRODUCT_WIDTH: Number(params.productWidth || 30),
    PRODUCT_HEIGHT: Number(params.productHeight || 30),
    PRODUCT_TYPE: 'HH',
    ORDER_PAYMENT: payment,
    ORDER_SERVICE: String(params.orderService || 'VCN'),
    ORDER_SERVICE_ADD: '',
    ORDER_VOUCHER: '',
    ORDER_NOTE: String(params.orderNote || ''),
    MONEY_COLLECTION: codAmt,
    MONEY_TOTALFREIGHT: 0,
    MONEY_FEECOD: 0,
    MONEY_FEEVAS: 0,
    MONEY_FEEINSURANCE: 0,
    MONEY_FEE: 0,
    MONEY_FEEOTHER: 0,
    MONEY_TOTALVAT: 0,
    MONEY_TOTAL: codAmt,
    LIST_ITEM: []
  };

  // Build LIST_ITEM
  const items = params.items || [];
  if (items.length > 0) {
    orderData.LIST_ITEM = items.map(item => ({
      PRODUCT_NAME: String(item.product_name || item.name || 'Hàng hóa'),
      PRODUCT_PRICE: Number(item.unit_price || item.price || 0),
      PRODUCT_WEIGHT: Math.max(Number(item.weight || Math.round(safeWeight / (params.productQuantity || 1))), 100),
      PRODUCT_QUANTITY: Number(item.quantity || 1)
    }));
  } else {
    // Fallback: 1 item từ thông tin chung
    orderData.LIST_ITEM = [{
      PRODUCT_NAME: orderData.PRODUCT_NAME,
      PRODUCT_PRICE: orderData.PRODUCT_PRICE,
      PRODUCT_WEIGHT: orderData.PRODUCT_WEIGHT,
      PRODUCT_QUANTITY: orderData.PRODUCT_QUANTITY
    }];
  }

  // Validate required fields
  const missing = [];
  if (!orderData.SENDER_PHONE) missing.push('SENDER_PHONE');
  if (!orderData.SENDER_PROVINCE) missing.push('SENDER_PROVINCE');
  if (!orderData.SENDER_DISTRICT) missing.push('SENDER_DISTRICT');
  if (!orderData.RECEIVER_PHONE) missing.push('RECEIVER_PHONE');
  if (!orderData.RECEIVER_PROVINCE) missing.push('RECEIVER_PROVINCE');
  if (!orderData.RECEIVER_DISTRICT) missing.push('RECEIVER_DISTRICT');
  if (!orderData.RECEIVER_ADDRESS) missing.push('RECEIVER_ADDRESS');
  if (missing.length > 0) {
    const err = `Thiếu thông tin bắt buộc: ${missing.join(', ')}`;
    console.error('[VTP] createOrder validation failed:', err);
    return { success: false, data: null, error: err };
  }

  console.log('[VTP] createOrder body:', JSON.stringify(orderData, null, 2));
  const result = await vtpProxy('createOrder', token, { orderData });
  console.log('[VTP] createOrder response:', JSON.stringify(result, null, 2));

  // Parse ORDER_NUMBER từ nhiều format VTP có thể trả về
  if (result.success && result.data) {
    let d = result.data;
    if (Array.isArray(d) && d.length > 0) d = d[0];
    const orderNum = d.ORDER_NUMBER || d.order_number || d.ORDER_CODE || d.order_code || '';
    if (orderNum) {
      result.data = { ...d, ORDER_NUMBER: orderNum };
    }
  }

  return result;
}

// ---- Get order detail / tracking ----

export async function getOrderDetail(token, orderNumber) {
  return vtpProxy('get_order_detail', token, { orderId: orderNumber });
}

// ---- Get available services ----

export async function getServices(token) {
  return vtpProxy('get_services', token);
}

// ---- Get price for all services (getPriceAll) ----

export async function getPriceAll(token, {
  senderProvince, senderDistrict,
  receiverProvince, receiverDistrict,
  productWeight, productPrice, codAmount,
  productType = 'HH'
}) {
  const body = {
    SENDER_PROVINCE: senderProvince,
    SENDER_DISTRICT: senderDistrict,
    RECEIVER_PROVINCE: receiverProvince,
    RECEIVER_DISTRICT: receiverDistrict,
    PRODUCT_TYPE: productType,
    PRODUCT_WEIGHT: productWeight,
    PRODUCT_PRICE: productPrice,
    MONEY_COLLECTION: codAmount || 0,
    TYPE: 1
  };
  return vtpProxy('get_price_all', token, { body });
}

// ---- Login ----

export async function loginVtp(username, password) {
  return vtpProxy('login', '', { username, password });
}

// ---- Clear cache (for testing) ----

export function clearCache() {
  provincesCache = null;
  districtsCache.clear();
  wardsCache.clear();
}
