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
    // VTP returns { status: 200, data: [...] } or { error: true, message: '...' }
    if (json.error === true || json.status === 400 || json.status === 401) {
      return { success: false, data: null, error: json.message || 'Lỗi không xác định' };
    }
    return { success: true, data: json.data || json, error: null };
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

export async function createOrder(token, {
  partnerOrderNumber,
  senderName, senderPhone, senderAddress,
  senderProvince, senderDistrict, senderWard,
  receiverName, receiverPhone, receiverAddress,
  receiverProvince, receiverDistrict, receiverWard,
  productName, productDescription, productQuantity,
  productWeight, productPrice,
  codAmount, orderService = 'VCN', orderNote = '',
  items = []
}) {
  const body = {
    ORDER_NUMBER: partnerOrderNumber,
    GROUPADDRESS_ID: 0,
    CUS_ID: 0,
    DELIVERY_DATE: '',
    SENDER_FULLNAME: senderName,
    SENDER_ADDRESS: senderAddress,
    SENDER_PHONE: senderPhone,
    SENDER_EMAIL: '',
    SENDER_WARD: senderWard,
    SENDER_DISTRICT: senderDistrict,
    SENDER_PROVINCE: senderProvince,
    SENDER_LATITUDE: 0,
    SENDER_LONGITUDE: 0,
    RECEIVER_FULLNAME: receiverName,
    RECEIVER_ADDRESS: receiverAddress,
    RECEIVER_PHONE: receiverPhone,
    RECEIVER_EMAIL: '',
    RECEIVER_WARD: receiverWard,
    RECEIVER_DISTRICT: receiverDistrict,
    RECEIVER_PROVINCE: receiverProvince,
    RECEIVER_LATITUDE: 0,
    RECEIVER_LONGITUDE: 0,
    PRODUCT_NAME: productName,
    PRODUCT_DESCRIPTION: productDescription || '',
    PRODUCT_QUANTITY: productQuantity || 1,
    PRODUCT_PRICE: productPrice || 0,
    PRODUCT_WEIGHT: productWeight,        // grams
    PRODUCT_WIDTH: 0,
    PRODUCT_HEIGHT: 0,
    PRODUCT_LENGTH: 0,
    PRODUCT_TYPE: 'HH',
    ORDER_PAYMENT: 3,                     // 3 = receiver pays COD
    ORDER_SERVICE: orderService,
    ORDER_SERVICE_ADD: '',
    ORDER_VOUCHER: '',
    ORDER_NOTE: orderNote,
    MONEY_COLLECTION: codAmount || 0,
    MONEY_TOTALFEE: 0,
    MONEY_FEECOD: 0,
    MONEY_FEEVAS: 0,
    MONEY_FEEINSURANCE: 0,
    MONEY_FEE: 0,
    MONEY_FEEOTHER: 0,
    MONEY_TOTALVAT: 0,
    MONEY_TOTAL: codAmount || 0,
    LIST_ITEM: items.map(item => ({
      PRODUCT_NAME: item.product_name || item.name,
      PRODUCT_PRICE: item.unit_price || item.price || 0,
      PRODUCT_WEIGHT: item.weight || Math.round(productWeight / (productQuantity || 1)),
      PRODUCT_QUANTITY: item.quantity || 1
    }))
  };
  return vtpProxy('create_order', token, { body });
}

// ---- Get order detail / tracking ----

export async function getOrderDetail(token, orderNumber) {
  return vtpProxy('get_order_detail', token, { orderId: orderNumber });
}

// ---- Get available services ----

export async function getServices(token) {
  return vtpProxy('get_services', token);
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
