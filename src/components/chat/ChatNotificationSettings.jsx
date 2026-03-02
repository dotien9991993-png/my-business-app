import React, { useState } from 'react';
import { getNotificationSettings, saveNotificationSettings, requestNotificationPermission } from '../../utils/notificationSound';

const NOTIFY_MODES = [
  { id: 'all', label: 'Tất cả tin nhắn', desc: 'Nhận thông báo mọi tin nhắn', icon: '🔔' },
  { id: 'mentions', label: 'Chỉ @mention', desc: 'Chỉ khi được nhắc tên hoặc @Tất cả', icon: '📢' },
  { id: 'dnd', label: 'Không làm phiền', desc: 'Tắt hết (trừ tin ưu tiên !!)', icon: '🔕' },
];

export default function ChatNotificationSettings({ onClose }) {
  const [settings, setSettings] = useState(getNotificationSettings);

  const update = (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveNotificationSettings(next);
  };

  const handleRequestPermission = async () => {
    await requestNotificationPermission();
    // Force re-render to show status
    setSettings({ ...settings });
  };

  const permissionStatus = typeof Notification !== 'undefined' ? Notification.permission : 'denied';

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-bold text-base text-gray-900">Cài đặt thông báo</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Notification mode */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Chế độ thông báo</h4>
          <div className="space-y-1.5">
            {NOTIFY_MODES.map(mode => (
              <button
                key={mode.id}
                onClick={() => update('chatNotifyMode', mode.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors flex items-center gap-3 ${
                  settings.chatNotifyMode === mode.id
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <span className="text-xl">{mode.icon}</span>
                <div className="flex-1">
                  <p className={`text-sm ${settings.chatNotifyMode === mode.id ? 'font-semibold text-green-700' : 'text-gray-700'}`}>
                    {mode.label}
                  </p>
                  <p className="text-xs text-gray-500">{mode.desc}</p>
                </div>
                {settings.chatNotifyMode === mode.id && (
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Sound toggles */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Âm thanh</h4>
          <div className="space-y-2">
            <label className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg cursor-pointer">
              <div className="flex items-center gap-2">
                <span className="text-base">🔊</span>
                <span className="text-sm text-gray-700">Âm thanh tin nhắn</span>
              </div>
              <input
                type="checkbox"
                checked={settings.soundMessage}
                onChange={e => update('soundMessage', e.target.checked)}
                className="w-4 h-4 accent-green-600"
              />
            </label>
            <label className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg cursor-pointer">
              <div className="flex items-center gap-2">
                <span className="text-base">🔔</span>
                <span className="text-sm text-gray-700">Âm thanh hệ thống</span>
              </div>
              <input
                type="checkbox"
                checked={settings.soundSystem}
                onChange={e => update('soundSystem', e.target.checked)}
                className="w-4 h-4 accent-green-600"
              />
            </label>
          </div>
        </div>

        {/* Browser push */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Thông báo trình duyệt</h4>
          <label className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg cursor-pointer">
            <div className="flex items-center gap-2">
              <span className="text-base">🌐</span>
              <div>
                <span className="text-sm text-gray-700">Push notification</span>
                {permissionStatus === 'denied' && (
                  <p className="text-[10px] text-red-500">Bị chặn bởi trình duyệt</p>
                )}
                {permissionStatus === 'default' && (
                  <button onClick={handleRequestPermission} className="text-[10px] text-blue-500 hover:underline block">
                    Cho phép thông báo
                  </button>
                )}
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.browserPush}
              onChange={e => update('browserPush', e.target.checked)}
              className="w-4 h-4 accent-green-600"
            />
          </label>
        </div>

        {/* After-hours DND */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Ngoài giờ làm việc</h4>
          <label className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg cursor-pointer mb-2">
            <div className="flex items-center gap-2">
              <span className="text-base">🌙</span>
              <div>
                <span className="text-sm text-gray-700">Tự động Không làm phiền</span>
                <p className="text-[10px] text-gray-400">Tắt thông báo ngoài giờ hành chính</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.afterHoursEnabled}
              onChange={e => update('afterHoursEnabled', e.target.checked)}
              className="w-4 h-4 accent-green-600"
            />
          </label>
          {settings.afterHoursEnabled && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg">
              <span className="text-xs text-gray-500">Từ</span>
              <select
                value={settings.afterHoursStart}
                onChange={e => update('afterHoursStart', parseInt(e.target.value))}
                className="text-sm border rounded px-2 py-1 bg-white"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                ))}
              </select>
              <span className="text-xs text-gray-500">đến</span>
              <select
                value={settings.afterHoursEnd}
                onChange={e => update('afterHoursEnd', parseInt(e.target.value))}
                className="text-sm border rounded px-2 py-1 bg-white"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Priority info */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <h4 className="text-sm font-semibold text-yellow-800 mb-1">Tin nhắn ưu tiên</h4>
          <p className="text-xs text-yellow-700">
            Tin nhắn bắt đầu bằng <code className="bg-yellow-100 px-1 rounded font-bold">!!</code> sẽ luôn thông báo, kể cả khi bạn đang ở chế độ Không làm phiền hoặc phòng bị tắt tiếng.
          </p>
        </div>

        {/* Muted rooms info */}
        {(settings.mutedRooms || []).length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-1">Phòng đang tắt tiếng ({settings.mutedRooms.length})</h4>
            <p className="text-xs text-gray-500">Bạn có thể bật/tắt tiếng cho từng phòng trong header của phòng chat.</p>
          </div>
        )}
      </div>
    </div>
  );
}
