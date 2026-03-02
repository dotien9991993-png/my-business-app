/**
 * Hệ thống âm thanh thông báo - Web Audio API
 * Không cần file mp3, tạo âm thanh bằng oscillator
 */

let audioContext = null;

function getAudioContext() {
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume nếu bị suspended (autoplay policy)
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

// ============================================================
// Cài đặt âm thanh (lưu localStorage)
// ============================================================

const SETTINGS_KEY = 'notification_settings';

const DEFAULT_SETTINGS = {
  soundMessage: true,      // Âm thanh tin nhắn mới
  soundSystem: true,       // Âm thanh thông báo hệ thống
  browserPush: true,       // Push notification trên trình duyệt
  // Smart notification settings
  chatNotifyMode: 'all',   // 'all' | 'mentions' | 'dnd'
  afterHoursEnabled: false, // Tự động DND ngoài giờ làm
  afterHoursStart: 18,      // Giờ bắt đầu DND (18:00)
  afterHoursEnd: 8,         // Giờ kết thúc DND (08:00)
  mutedRooms: [],           // Room IDs bị tắt thông báo
};

export function getNotificationSettings() {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch (_e) { /* ignore */ }
  return { ...DEFAULT_SETTINGS };
}

export function saveNotificationSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (_e) { /* ignore */ }
}

// ============================================================
// Smart notification logic
// ============================================================

/** Check if current time is in after-hours DND period */
function isAfterHours(settings) {
  if (!settings.afterHoursEnabled) return false;
  const now = new Date();
  const vnHour = parseInt(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }));
  const start = settings.afterHoursStart;
  const end = settings.afterHoursEnd;
  // e.g., start=18, end=8 → DND from 18:00 to 08:00
  if (start > end) {
    return vnHour >= start || vnHour < end;
  }
  return vnHour >= start && vnHour < end;
}

/** Check if a room is muted */
export function isRoomMuted(roomId) {
  const settings = getNotificationSettings();
  return (settings.mutedRooms || []).includes(roomId);
}

/** Toggle mute for a room */
export function toggleRoomMute(roomId) {
  const settings = getNotificationSettings();
  const mutedRooms = settings.mutedRooms || [];
  if (mutedRooms.includes(roomId)) {
    settings.mutedRooms = mutedRooms.filter(id => id !== roomId);
  } else {
    settings.mutedRooms = [...mutedRooms, roomId];
  }
  saveNotificationSettings(settings);
  return settings.mutedRooms.includes(roomId);
}

/**
 * Determine whether a chat message should trigger a notification.
 * @param {object} msg - The incoming message { content, sender_id, sender_name, room_id }
 * @param {string} currentUserId - The current user's ID
 * @param {string} currentUserName - The current user's display name
 * @returns {{ shouldSound: boolean, shouldPush: boolean, isPriority: boolean }}
 */
export function shouldNotify(msg, currentUserId, currentUserName) {
  // Never notify for own messages
  if (msg.sender_id === currentUserId) return { shouldSound: false, shouldPush: false, isPriority: false };

  const settings = getNotificationSettings();
  const isPriority = msg.content?.startsWith('!!');
  const isMentioned = currentUserName && msg.content?.includes(`@${currentUserName}`);
  const isMentionAll = msg.content?.includes('@Tất cả') || msg.content?.includes('@Tat ca');
  const isRoomSilenced = (settings.mutedRooms || []).includes(msg.room_id);

  // Priority messages always notify (override DND/mute)
  if (isPriority) {
    return { shouldSound: true, shouldPush: true, isPriority: true };
  }

  // DND mode: block all except priority
  if (settings.chatNotifyMode === 'dnd') {
    return { shouldSound: false, shouldPush: false, isPriority: false };
  }

  // After-hours auto-DND
  if (isAfterHours(settings)) {
    return { shouldSound: false, shouldPush: false, isPriority: false };
  }

  // Muted room: no sound/push
  if (isRoomSilenced) {
    return { shouldSound: false, shouldPush: false, isPriority: false };
  }

  // Mentions-only mode: only notify if mentioned
  if (settings.chatNotifyMode === 'mentions') {
    const mentioned = isMentioned || isMentionAll;
    return { shouldSound: mentioned, shouldPush: mentioned, isPriority: false };
  }

  // Default: 'all' mode — notify everything
  return { shouldSound: true, shouldPush: true, isPriority: false };
}

// ============================================================
// Âm thanh
// ============================================================

/** Âm thanh tin nhắn mới (ngắn, nhẹ nhàng kiểu Messenger) */
export function playMessageSound() {
  const settings = getNotificationSettings();
  if (!settings.soundMessage) return;
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.setValueAtTime(880, ctx.currentTime);      // A5
    oscillator.frequency.setValueAtTime(1100, ctx.currentTime + 0.1); // C#6

    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  } catch (_e) { /* Audio không khả dụng */ }
}

/** Âm thanh thông báo quan trọng (2 tiếng bíp) */
export function playNotificationSound() {
  const settings = getNotificationSettings();
  if (!settings.soundSystem) return;
  try {
    const ctx = getAudioContext();

    [0, 0.15].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(740, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.15);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.15);
    });
  } catch (_e) { /* Audio không khả dụng */ }
}

/** Âm thanh cảnh báo (task quá hạn, phiếu chờ duyệt - 3 tiếng bíp) */
export function playAlertSound() {
  const settings = getNotificationSettings();
  if (!settings.soundSystem) return;
  try {
    const ctx = getAudioContext();

    [0, 0.2, 0.4].forEach((delay) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(600, ctx.currentTime + delay);
      gain.gain.setValueAtTime(0.4, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + 0.18);

      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.18);
    });
  } catch (_e) { /* Audio không khả dụng */ }
}

// ============================================================
// Browser Push Notification
// ============================================================

/** Xin quyền thông báo (gọi 1 lần sau đăng nhập) */
export async function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

/** Hiện notification trên desktop/mobile */
export function showBrowserNotification(title, body, onClick) {
  const settings = getNotificationSettings();
  if (!settings.browserPush) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    const notification = new Notification(title, {
      body,
      icon: '/logo192.png',
      badge: '/logo192.png',
      tag: 'chat-message',
      renotify: true,
      silent: false
    });

    if (onClick) {
      notification.onclick = () => {
        window.focus();
        onClick();
        notification.close();
      };
    }

    setTimeout(() => notification.close(), 5000);
  } catch (_e) { /* Notification không khả dụng */ }
}

// ============================================================
// Tab Title - Đổi tiêu đề khi có tin mới
// ============================================================

let originalTitle = '';
let tabUnreadCount = 0;
let titleInterval = null;

export function updateTabTitle(count) {
  if (!originalTitle) {
    originalTitle = document.title;
  }
  tabUnreadCount = count;

  if (count > 0) {
    document.title = `(${count}) Tin nhắn mới`;
    // Nhấp nháy title để thu hút chú ý
    if (!titleInterval) {
      titleInterval = setInterval(() => {
        document.title = document.title.startsWith('(')
          ? `💬 Tin nhắn mới`
          : `(${tabUnreadCount}) Tin nhắn mới`;
      }, 1500);
    }
  } else {
    document.title = originalTitle;
    if (titleInterval) {
      clearInterval(titleInterval);
      titleInterval = null;
    }
  }
}

export function incrementTabUnread() {
  updateTabTitle(tabUnreadCount + 1);
}

export function resetTabTitle() {
  updateTabTitle(0);
}

// Khi user quay lại tab → reset title
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && tabUnreadCount > 0) {
      resetTabTitle();
    }
  });
}
