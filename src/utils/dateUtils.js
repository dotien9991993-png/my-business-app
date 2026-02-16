// ============ VIETNAM TIMEZONE HELPERS (UTC+7) ============

// Lấy ngày giờ hiện tại theo múi giờ Việt Nam
export const getVietnamDate = () => {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
};

// Lấy ngày hôm nay theo định dạng YYYY-MM-DD (múi giờ VN)
export const getTodayVN = () => {
  const vn = getVietnamDate();
  return vn.getFullYear() + '-' + String(vn.getMonth() + 1).padStart(2, '0') + '-' + String(vn.getDate()).padStart(2, '0');
};

// Lấy datetime hiện tại theo ISO format với múi giờ VN (để lưu DB)
export const getNowISOVN = () => {
  // Tạo ISO string với timezone +07:00
  const vn = getVietnamDate();
  const year = vn.getFullYear();
  const month = String(vn.getMonth() + 1).padStart(2, '0');
  const day = String(vn.getDate()).padStart(2, '0');
  const hours = String(vn.getHours()).padStart(2, '0');
  const minutes = String(vn.getMinutes()).padStart(2, '0');
  const seconds = String(vn.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+07:00`;
};

// Lấy datetime string ngắn gọn (cho hiển thị)
export const getNowStringVN = () => {
  const vn = getVietnamDate();
  return vn.toLocaleString('vi-VN');
};

// Lấy date string YYYYMMDD cho generate số phiếu
export const getDateStrVN = () => {
  const vn = getVietnamDate();
  return vn.getFullYear().toString() + String(vn.getMonth() + 1).padStart(2, '0') + String(vn.getDate()).padStart(2, '0');
};

// Format datetime cho hiển thị (từ DB)
export const formatDateTimeVN = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

// Cong them N thang vao ngay (YYYY-MM-DD)
export const addMonthsVN = (dateStr, months) => {
  if (!dateStr || !months) return dateStr;
  const date = new Date(dateStr + 'T00:00:00+07:00');
  date.setMonth(date.getMonth() + months);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Format date cho hiển thị
export const formatDateVN = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};
