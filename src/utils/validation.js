/**
 * Input validation utilities
 */

/** Loại bỏ HTML tags, trim whitespace */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/<[^>]*>/g, '').trim();
}

/** Validate số điện thoại VN: 0xxxxxxxxx (10-11 số) */
export function validatePhone(phone) {
  if (!phone) return { valid: true, message: '' }; // phone không bắt buộc
  const cleaned = phone.replace(/[\s.-]/g, '');
  const regex = /^0\d{9,10}$/;
  if (!regex.test(cleaned)) {
    return { valid: false, message: 'Số điện thoại không hợp lệ (VD: 0912345678)' };
  }
  return { valid: true, message: '' };
}

/** Validate email */
export function validateEmail(email) {
  if (!email) return { valid: false, message: 'Email không được để trống' };
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!regex.test(email)) {
    return { valid: false, message: 'Email không hợp lệ' };
  }
  return { valid: true, message: '' };
}

/** Validate password: >= 8 ký tự, có chữ + số */
export function validatePassword(password) {
  if (!password) return { valid: false, message: 'Mật khẩu không được để trống' };
  if (password.length < 8) {
    return { valid: false, message: 'Mật khẩu phải có ít nhất 8 ký tự' };
  }
  if (!/[a-zA-Z]/.test(password)) {
    return { valid: false, message: 'Mật khẩu phải chứa ít nhất 1 chữ cái' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, message: 'Mật khẩu phải chứa ít nhất 1 chữ số' };
  }
  return { valid: true, message: '' };
}

/** Validate giá tiền — phải > 0 và không quá 1 tỷ (chống fat-finger) */
export function validatePrice(value, { allowZero = false, max = 1_000_000_000, fieldName = 'Giá' } = {}) {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (n === null || n === undefined || isNaN(n)) {
    return { valid: false, message: `${fieldName} không hợp lệ` };
  }
  if (!allowZero && n <= 0) {
    return { valid: false, message: `${fieldName} phải lớn hơn 0` };
  }
  if (allowZero && n < 0) {
    return { valid: false, message: `${fieldName} không được âm` };
  }
  if (n > max) {
    return { valid: false, message: `${fieldName} không được vượt quá ${max.toLocaleString('vi-VN')} đ` };
  }
  return { valid: true, message: '' };
}

/** Validate số lượng */
export function validateQuantity(value, { min = 0.001, max = 99999, fieldName = 'Số lượng' } = {}) {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (n === null || n === undefined || isNaN(n)) {
    return { valid: false, message: `${fieldName} không hợp lệ` };
  }
  if (n < min) return { valid: false, message: `${fieldName} phải >= ${min}` };
  if (n > max) return { valid: false, message: `${fieldName} không được > ${max}` };
  return { valid: true, message: '' };
}

/** Validate toàn bộ đơn hàng trước khi tạo */
export function validateOrder(order) {
  const errors = [];

  if (!order.items || order.items.length === 0) {
    errors.push('Đơn phải có ít nhất 1 sản phẩm');
  }

  if (order.customer_phone) {
    const phoneCheck = validatePhone(order.customer_phone);
    if (!phoneCheck.valid) errors.push('SĐT khách: ' + phoneCheck.message);
  }

  // Validate từng item
  (order.items || []).forEach((item, idx) => {
    if (!item.product_id) {
      errors.push(`SP ${idx + 1}: thiếu mã sản phẩm`);
    }
    const qtyCheck = validateQuantity(item.quantity, { fieldName: `SP ${idx + 1} số lượng` });
    if (!qtyCheck.valid) errors.push(qtyCheck.message);

    const priceCheck = validatePrice(item.unit_price, { fieldName: `SP ${idx + 1} đơn giá` });
    if (!priceCheck.valid) errors.push(priceCheck.message);
  });

  // Validate total
  const totalCheck = validatePrice(order.total_amount, { allowZero: true, fieldName: 'Tổng tiền' });
  if (!totalCheck.valid) errors.push(totalCheck.message);

  // Validate payment_method = debt phải có customer_id (tạo công nợ)
  if (order.payment_method === 'debt' && !order.customer_id) {
    errors.push('Đơn công nợ phải chọn khách hàng');
  }

  return { valid: errors.length === 0, errors };
}
