// ============ SALES MODULE CONSTANTS ============

// Trạng thái đơn hàng
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

// Flow chuyển trạng thái hợp lệ
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

// Loại đơn hàng
export const orderTypes = {
  pos: { label: 'Tại quầy', icon: '🏪' },
  online: { label: 'Online', icon: '🌐' },
};

// Phương thức thanh toán
export const paymentMethods = {
  cash: { label: 'Tiền mặt', icon: '💵' },
  transfer: { label: 'Chuyển khoản', icon: '🏦' },
  debt: { label: 'Công nợ', icon: '📋' },
};

// Trạng thái thanh toán
export const paymentStatuses = {
  unpaid: { label: 'Chưa thanh toán', color: 'bg-red-100 text-red-700' },
  paid: { label: 'Đã thanh toán', color: 'bg-green-100 text-green-700' },
  partial: { label: 'Thanh toán 1 phần', color: 'bg-yellow-100 text-yellow-700' },
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
