import React from 'react';

export default function NotificationsDropdown({
  showNotifications,
  notifications,
  unreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearReadNotifications,
  tasks,
  technicalJobs,
  receiptsPayments,
  setSelectedTask,
  setShowModal,
  setActiveModule,
  setActiveTab,
  setSelectedJob,
  setShowJobModal,
  setShowNotifications
}) {
  if (!showNotifications) return null;

  return (
    <div className="absolute right-0 top-full mt-2 w-96 bg-white rounded-xl shadow-2xl border z-50 max-h-[500px] overflow-hidden flex flex-col">
      <div className="p-4 border-b bg-gradient-to-r from-blue-500 to-purple-600 text-white">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-lg">🔔 Thông Báo</h3>
          <div className="flex gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full"
              >
                ✓ Đọc tất cả
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <div className="text-6xl mb-4">🔕</div>
            <p>Không có thông báo</p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                className={`p-4 hover:bg-gray-50 cursor-pointer transition-colors ${!notif.is_read ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                onClick={() => {
                  markAsRead(notif.id);
                  if (notif.reference_type === 'task') {
                    const task = tasks.find(t => t.id === notif.reference_id);
                    if (task) {
                      setSelectedTask(task);
                      setShowModal(true);
                      setActiveModule('media');
                    }
                  } else if (notif.reference_type === 'job') {
                    const job = technicalJobs.find(j => j.id === notif.reference_id);
                    if (job) {
                      setSelectedJob(job);
                      setShowJobModal(true);
                      setActiveModule('technical');
                    }
                  } else if (notif.reference_type === 'receipt') {
                    setActiveModule('finance');
                    setActiveTab('receipts');
                    const receipt = receiptsPayments.find(r => r.id === notif.reference_id);
                    if (receipt) {
                      console.log('Opening receipt:', receipt);
                    }
                  } else if (notif.reference_type === 'salary') {
                    setActiveModule('finance');
                    setActiveTab('salaries');
                  } else if (notif.type === 'new_registration') {
                    setActiveModule('media');
                    setActiveTab('users');
                  } else if (notif.type?.includes('finance')) {
                    setActiveModule('finance');
                    setActiveTab('receipts');
                  }
                  setShowNotifications(false);
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <span className="text-2xl">{notif.icon || '🔔'}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-900">{notif.title}</span>
                        {!notif.is_read && <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>}
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">{notif.message}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(notif.created_at).toLocaleString('vi-VN')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNotification(notif.id);
                    }}
                    className="text-gray-400 hover:text-red-500 text-xl p-1"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {notifications.length > 0 && (
        <div className="p-3 border-t bg-gray-50 flex justify-between items-center">
          <span className="text-sm text-gray-500">{notifications.length} thông báo</span>
          <button
            onClick={clearReadNotifications}
            className="text-sm text-red-600 hover:text-red-700 font-medium"
          >
            🗑️ Xóa đã đọc
          </button>
        </div>
      )}
    </div>
  );
}
