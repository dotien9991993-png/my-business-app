// Helper function format tiền VND
export const formatMoney = (amount) => {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
};

// Màu status cho task Media
export const getStatusColor = (s) => {
  const c = { 'Nháp': 'bg-gray-200 text-gray-700', 'Chưa Quay': 'bg-yellow-200 text-yellow-800', 'Đã Quay': 'bg-blue-200 text-blue-800', 'Đang Edit': 'bg-orange-200 text-orange-800', 'Hoàn Thành': 'bg-green-500 text-white' };
  return c[s] || 'bg-gray-200';
};

// Màu team cho Media
export const getTeamColor = (t) => {
  const c = {
    'Content': 'bg-blue-100 text-blue-700',
    'Edit Video': 'bg-purple-100 text-purple-700',
    'Livestream': 'bg-pink-100 text-pink-700',
    'Kho': 'bg-orange-100 text-orange-700'
  };
  return c[t] || 'bg-gray-100';
};
