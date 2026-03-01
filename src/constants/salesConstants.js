// ============ SALES MODULE CONSTANTS ============

// Trạng thái đơn hàng (legacy — giữ backward compat)
export const orderStatuses = {
  new: { label: 'Mới', color: 'bg-gray-100 text-gray-700', icon: '📝' },
  confirmed: { label: 'Xác nhận', color: 'bg-blue-100 text-blue-700', icon: '✅' },
  packing: { label: 'Đóng gói', color: 'bg-yellow-100 text-yellow-700', icon: '📦' },
  shipping: { label: 'Đã giao VC', color: 'bg-purple-100 text-purple-700', icon: '🚚' },
  delivered: { label: 'Đã giao', color: 'bg-cyan-100 text-cyan-700', icon: '📬' },
  completed: { label: 'Hoàn thành', color: 'bg-green-100 text-green-700', icon: '🎉' },
  cancelled: { label: 'Đã hủy', color: 'bg-red-100 text-red-700', icon: '❌' },
  returned: { label: 'Trả hàng', color: 'bg-orange-100 text-orange-700', icon: '↩️' },
};

// ===== Three-way status system =====

// Trạng thái đơn hàng (order_status)
export const orderStatusValues = {
  open: { label: 'Mở', color: 'bg-gray-100 text-gray-700', icon: '📝' },
  confirmed: { label: 'Xác nhận', color: 'bg-blue-100 text-blue-700', icon: '✅' },
  completed: { label: 'Hoàn thành', color: 'bg-green-100 text-green-700', icon: '🎉' },
  cancelled: { label: 'Đã hủy', color: 'bg-red-100 text-red-700', icon: '❌' },
  returned: { label: 'Trả hàng', color: 'bg-orange-100 text-orange-700', icon: '↩️' },
  exchanged: { label: 'Đổi hàng', color: 'bg-indigo-100 text-indigo-700', icon: '🔄' },
};

// Trạng thái vận chuyển (shipping_status)
export const shippingStatusValues = {
  pending: { label: 'Chờ xử lý', color: 'bg-gray-100 text-gray-600', icon: '⏳' },
  packing: { label: 'Đóng gói', color: 'bg-yellow-100 text-yellow-700', icon: '📦' },
  shipped: { label: 'Đã giao VC', color: 'bg-purple-100 text-purple-700', icon: '🚚' },
  in_transit: { label: 'Đang vận chuyển', color: 'bg-blue-100 text-blue-700', icon: '🛵' },
  delivered: { label: 'Đã giao', color: 'bg-cyan-100 text-cyan-700', icon: '📬' },
  delivery_failed: { label: 'Giao thất bại', color: 'bg-red-100 text-red-700', icon: '⚠️' },
  returned_to_sender: { label: 'Hoàn về', color: 'bg-orange-100 text-orange-700', icon: '↩️' },
  pickup: { label: 'Lấy tại shop', color: 'bg-teal-100 text-teal-700', icon: '🏪' },
};

// Trạng thái thanh toán (payment_status) — mở rộng
export const paymentStatusValues = {
  unpaid: { label: 'Chưa thanh toán', color: 'bg-red-100 text-red-700', icon: '💰' },
  partial_paid: { label: 'TT 1 phần', color: 'bg-yellow-100 text-yellow-700', icon: '💳' },
  paid: { label: 'Đã thanh toán', color: 'bg-green-100 text-green-700', icon: '✅' },
  partial_refunded: { label: 'Hoàn 1 phần', color: 'bg-orange-100 text-orange-700', icon: '↩️' },
  refunded: { label: 'Đã hoàn tiền', color: 'bg-gray-100 text-gray-700', icon: '💸' },
};

// Flow chuyển trạng thái hợp lệ (legacy)
export const orderStatusFlow = {
  pos: {
    new: ['completed', 'cancelled'],
  },
  online: {
    new: ['confirmed', 'cancelled'],
    confirmed: ['packing', 'cancelled'],
    packing: ['shipping', 'cancelled'],
    shipping: ['delivered', 'cancelled'],
    delivered: ['completed', 'returned'],
    completed: ['returned'],
  },
};

// Flow chuyển trạng thái 3 chiều
export const orderStatusFlow3 = {
  order_status: {
    open: ['confirmed', 'cancelled'],
    confirmed: ['completed', 'cancelled'],
    completed: ['returned', 'exchanged'],
  },
  shipping_status: {
    pending: ['packing', 'pickup'],
    packing: ['shipped'],
    shipped: ['in_transit', 'delivered', 'delivery_failed'],
    in_transit: ['delivered', 'delivery_failed'],
    delivery_failed: ['shipped', 'returned_to_sender'],
  },
};

// Loại đơn hàng
export const orderTypes = {
  pos: { label: 'Tại quầy', icon: '🏪' },
  online: { label: 'Online', icon: '🌐' },
};

// Phương thức thanh toán
export const paymentMethods = {
  cash: { label: 'Tiền mặt', icon: '💵' },
  transfer: { label: 'Chuyển khoản', icon: '🏦' },
  cod: { label: 'COD (nhận hàng trả tiền)', icon: '🚚' },
  debt: { label: 'Công nợ', icon: '📋' },
};

// Trạng thái thanh toán (legacy — giữ backward compat)
export const paymentStatuses = {
  unpaid: { label: 'Chưa thanh toán', color: 'bg-red-100 text-red-700' },
  paid: { label: 'Đã thanh toán', color: 'bg-green-100 text-green-700' },
  partial: { label: 'Thanh toán 1 phần', color: 'bg-yellow-100 text-yellow-700' },
  partial_paid: { label: 'Thanh toán 1 phần', color: 'bg-yellow-100 text-yellow-700' },
};

// Đơn vị vận chuyển
export const shippingProviders = [
  'GHN',
  'GHTK',
  'Viettel Post',
  'J&T Express',
  'Grab Express',
  'Tự giao',
];

// Ai trả phí ship
export const shippingPayers = {
  customer: 'Khách trả',
  shop: 'Shop trả',
};

// Dịch vụ vận chuyển VTP
export const shippingServices = {
  VCN: { label: 'Chuyển phát nhanh', desc: '1-2 ngày' },
  VTK: { label: 'Tiết kiệm', desc: '3-5 ngày' },
};

// Trạng thái đối soát COD
export const codStatuses = {
  pending: { label: 'Chờ nhận', color: 'bg-yellow-100 text-yellow-700' },
  received: { label: 'Đã nhận', color: 'bg-blue-100 text-blue-700' },
  confirmed: { label: 'Đã xác nhận', color: 'bg-green-100 text-green-700' },
  disputed: { label: 'Khiếu nại', color: 'bg-red-100 text-red-700' },
};

// Kênh đơn hàng
export const orderSources = {
  manual: { label: 'Thủ công', icon: '✍️' },
  zalo: { label: 'Zalo', icon: '💬' },
  facebook: { label: 'Facebook', icon: '📘' },
  haravan: { label: 'Haravan', icon: '🛍️' },
  web: { label: 'Website', icon: '🌐' },
  shop: { label: 'Tại shop', icon: '🏪' },
};
