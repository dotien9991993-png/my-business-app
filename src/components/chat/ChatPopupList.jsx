import React, { useState, useMemo, useRef, useEffect } from 'react';

const formatLastTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const vnDate = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const diffMs = vnNow - vnDate;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Vừa xong';
  if (diffMin < 60) return `${diffMin}p`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return vnDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

export default function ChatPopupList({
  rooms,
  currentUser,
  allUsers,
  unreadCounts,
  onSelectRoom,
  onClose,
  onOpenFullChat,
  onOpenNewChat,
  onOpenSettings,
}) {
  const [search, setSearch] = useState('');
  const panelRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        // Check if clicking the FAB (don't close)
        if (e.target.closest('[data-chat-fab]')) return;
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const getRoomDisplay = (room) => {
    if (room.type === 'group') {
      const active = (room.members || []).filter(m => m.is_active !== false);
      return { name: room.name || 'Nhóm chat', avatar: null, isGroup: true, memberCount: active.length };
    }
    const other = (room.members || []).find(m => m.user_id !== currentUser?.id);
    const otherUser = other ? (allUsers || []).find(u => u.id === other.user_id) : null;
    return {
      name: other?.user_name || otherUser?.name || 'Người dùng',
      avatar: otherUser?.avatar_url || other?.user_avatar,
      isGroup: false,
    };
  };

  const sortedRooms = useMemo(() => {
    let filtered = rooms || [];
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(r => {
        const info = getRoomDisplay(r);
        return info.name.toLowerCase().includes(q);
      });
    }
    // Sort: unread first, then by last_message_at
    return [...filtered].sort((a, b) => {
      const uA = unreadCounts?.[a.id] || 0;
      const uB = unreadCounts?.[b.id] || 0;
      if (uA > 0 && uB === 0) return -1;
      if (uB > 0 && uA === 0) return 1;
      const tA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const tB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return tB - tA;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, search, unreadCounts, currentUser, allUsers]);

  return (
    <div
      ref={panelRef}
      className="flex flex-col bg-white rounded-lg shadow-xl border overflow-hidden animate-in"
      style={{
        width: 400,
        maxHeight: 550,
        boxShadow: '0 12px 28px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.1)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 border-b flex-shrink-0" style={{ height: 48 }}>
        <h3 className="text-lg font-bold text-gray-900">Chat</h3>
        <div className="flex items-center gap-1">
          {onOpenSettings && (
            <button onClick={onOpenSettings} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500" title="Cài đặt">
              ⚙️
            </button>
          )}
          {onOpenNewChat && (
            <button onClick={onOpenNewChat} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500" title="Tin nhắn mới">
              ✏️
            </button>
          )}
          {onOpenFullChat && (
            <button onClick={onOpenFullChat} className="w-9 h-9 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500" title="Mở chat đầy đủ">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 border-b flex-shrink-0">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm kiếm..."
          className="w-full px-3 py-2 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
        />
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto">
        {sortedRooms.length === 0 ? (
          <div className="text-center text-gray-400 py-8 text-sm">
            {search ? 'Không tìm thấy' : 'Chưa có cuộc trò chuyện'}
          </div>
        ) : (
          sortedRooms.map(room => {
            const info = getRoomDisplay(room);
            const unread = unreadCounts?.[room.id] || 0;

            return (
              <button
                key={room.id}
                onClick={() => onSelectRoom(room)}
                className={`w-full flex items-center gap-3 px-3 py-3 transition-colors text-left hover:bg-gray-50 ${
                  unread > 0 ? 'bg-green-50/40' : ''
                }`}
              >
                {/* Avatar */}
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm flex-shrink-0 overflow-hidden">
                  {info.isGroup ? (
                    <span className="text-xl">👥</span>
                  ) : info.avatar ? (
                    <img src={info.avatar} alt="" className="w-12 h-12 rounded-full object-cover" />
                  ) : (
                    <span className="text-base">{info.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-[15px] truncate ${unread > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                      {info.name}
                      {info.isGroup && info.memberCount > 0 && (
                        <span className="text-gray-400 font-normal ml-1 text-xs">({info.memberCount})</span>
                      )}
                    </span>
                    <span className={`text-xs flex-shrink-0 ml-1.5 ${unread > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                      {formatLastTime(room.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className={`text-[13px] truncate ${unread > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                      {room.last_message_by && room.type === 'group' && room.last_message_by !== currentUser?.name
                        ? `${room.last_message_by}: ${room.last_message || ''}`
                        : room.last_message || 'Chưa có tin nhắn'
                      }
                    </p>
                    {unread > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0 ml-1.5">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
