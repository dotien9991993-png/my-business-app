// Toast system — thay thế alert() và confirm() bằng UI đẹp hơn,
// đặc biệt trên mobile (iOS native alert là khối lớn chặn UI rất xấu).
//
// Dùng trực tiếp:
//   import { showToast } from '@/utils/toast';
//   showToast('Đã lưu!', 'success');
//
// Hoặc gọi window.alert() — sẽ tự render thành toast (xem installToastFallback bên dưới).

let listeners = [];
let toastId = 0;

export const TOAST_TYPES = {
  success: { icon: '✅', color: 'bg-green-600' },
  error:   { icon: '❌', color: 'bg-red-600' },
  warning: { icon: '⚠️', color: 'bg-amber-600' },
  info:    { icon: 'ℹ️', color: 'bg-blue-600' },
};

/**
 * Show toast notification. Tự dismiss sau `duration` ms.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration ms (default 3500)
 */
export function showToast(message, type = 'info', duration = 3500) {
  if (!message) return;
  const id = ++toastId;
  // strip leading icon nếu có (✅ ❌ ⚠️ ℹ️ và space sau)
  let text = String(message);
  const leadIcons = ['✅', '❌', '⚠️', 'ℹ️'];
  for (const ic of leadIcons) {
    if (text.startsWith(ic)) { text = text.slice(ic.length).replace(/^\s+/, ''); break; }
  }
  const toast = { id, message: text, type, duration };
  listeners.forEach(fn => fn({ type: 'add', toast }));
  if (duration > 0) {
    setTimeout(() => {
      listeners.forEach(fn => fn({ type: 'remove', id }));
    }, duration);
  }
  return id;
}

export function dismissToast(id) {
  listeners.forEach(fn => fn({ type: 'remove', id }));
}

export function subscribe(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(f => f !== fn); };
}

/**
 * Override window.alert để mọi alert() có sẵn trong code tự render thành toast.
 * Gọi 1 lần trong main.jsx khi app mount.
 */
export function installToastFallback() {
  if (typeof window === 'undefined') return;
  if (window.__toastInstalled) return;
  window.__toastInstalled = true;

  const originalAlert = window.alert.bind(window);
  window.alert = (message) => {
    if (message == null) return;
    const text = String(message);
    // Nhận diện type từ icon đầu chuỗi (✅ ❌ ⚠️) hoặc keyword
    let type = 'info';
    if (text.startsWith('❌') || /lỗi|sai|thất bại|không thể|invalid/i.test(text)) type = 'error';
    else if (text.startsWith('⚠️') || /cảnh báo|chú ý|warning/i.test(text)) type = 'warning';
    else if (text.startsWith('✅') || /thành công|đã lưu|success|ok/i.test(text)) type = 'success';
    showToast(text, type);
  };
  // Giữ lại reference để debug
  window.__originalAlert = originalAlert;
}
