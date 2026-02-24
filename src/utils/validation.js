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
