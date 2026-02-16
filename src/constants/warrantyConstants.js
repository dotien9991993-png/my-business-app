// ============ WARRANTY MODULE CONSTANTS ============

// Trạng thái serial
export const serialStatuses = {
  in_stock: { label: 'Trong kho', color: 'bg-green-100 text-green-700', icon: '📦' },
  sold: { label: 'Đã bán', color: 'bg-blue-100 text-blue-700', icon: '🛒' },
  returned: { label: 'Trả hàng', color: 'bg-orange-100 text-orange-700', icon: '↩️' },
  defective: { label: 'Lỗi', color: 'bg-red-100 text-red-700', icon: '⚠️' },
  warranty_repair: { label: 'Đang BH', color: 'bg-purple-100 text-purple-700', icon: '🔧' },
  scrapped: { label: 'Hủy', color: 'bg-gray-100 text-gray-700', icon: '🗑️' },
};

// Trạng thái thẻ bảo hành
export const warrantyStatuses = {
  active: { label: 'Còn hạn', color: 'bg-green-100 text-green-700', icon: '✅' },
  expired: { label: 'Hết hạn', color: 'bg-gray-100 text-gray-700', icon: '⏰' },
  voided: { label: 'Đã hủy', color: 'bg-red-100 text-red-700', icon: '❌' },
  extended: { label: 'Gia hạn', color: 'bg-blue-100 text-blue-700', icon: '🔄' },
};

// Trạng thái phiếu sửa chữa
export const repairStatuses = {
  received: { label: 'Tiếp nhận', color: 'bg-yellow-100 text-yellow-700', icon: '📥' },
  diagnosing: { label: 'Chẩn đoán', color: 'bg-blue-100 text-blue-700', icon: '🔍' },
  repairing: { label: 'Đang sửa', color: 'bg-purple-100 text-purple-700', icon: '🔧' },
  done: { label: 'Hoàn thành', color: 'bg-green-100 text-green-700', icon: '✅' },
  returned: { label: 'Đã trả', color: 'bg-gray-100 text-gray-700', icon: '📤' },
  cancelled: { label: 'Đã hủy', color: 'bg-red-100 text-red-700', icon: '❌' },
};

// Flow chuyen trang thai sua chua
export const repairStatusFlow = {
  received: ['diagnosing', 'cancelled'],
  diagnosing: ['repairing', 'cancelled'],
  repairing: ['done', 'cancelled'],
  done: ['returned'],
  returned: [],
  cancelled: [],
};

// Loai sua chua
export const repairTypes = {
  warranty: { label: 'Bảo hành', color: 'bg-green-100 text-green-700' },
  paid: { label: 'Có phí', color: 'bg-orange-100 text-orange-700' },
};
