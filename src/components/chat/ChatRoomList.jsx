import React, { useState, useMemo } from 'react';
import { getNotificationSettings } from '../../utils/notificationSound';

// Format thời gian tin nhắn cuối
const formatLastTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const vnDate = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));

  const diffMs = vnNow - vnDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return vnDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays < 7) return `${diffDays} ngày`;
  return vnDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

export default function ChatRoomList({
  rooms,
  currentUser,
  allUsers,
  unreadCounts,
  onSelectRoom,
  onNewChat,
  onNewGroup,
  onOpenSearch,
  onOpenNotifySettings,
  selectedRoomId
}) {
  const [search, setSearch] = useState('');
  const [showNewMenu, setShowNewMenu] = useState(false);
  const notifyMode = getNotificationSettings().chatNotifyMode;

  // Tìm tên hiển thị cho phòng
  const getRoomDisplayInfo = (room) => {
    if (room.type === 'group') {
      const activeMembers = (room.members || []).filter(m => m.is_active !== false);
      return {
        name: room.name || 'Nhóm chat',
        avatar: null,
        isGroup: true,
        memberCount: activeMembers.length
      };
    }
    // Direct: tìm người kia
    const otherMember = (room.members || []).find(m => m.user_id !== currentUser?.id);
    const otherUser = otherMember
      ? (allUsers || []).find(u => u.id === otherMember.user_id)
      : null;
    return {
      name: otherMember?.user_name || otherUser?.name || 'Người dùng',
      avatar: otherUser?.avatar_url || otherMember?.user_avatar,
      isGroup: false,
      otherUser
    };
  };

  // Filter + sort rooms
  const sortedRooms = useMemo(() => {
    let filtered = rooms || [];
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(room => {
        const info = getRoomDisplayInfo(room);
        return info.name.toLowerCase().includes(q);
      });
    }
    return [...filtered].sort((a, b) => {
      const tA = a.last_message_at ? new Date(a.last_message_at).getTime() : new Date(a.created_at).getTime();
      const tB = b.last_message_at ? new Date(b.last_message_at).getTime() : new Date(b.created_at).getTime();
      return tB - tA;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, search, currentUser, allUsers]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white">
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <span className="font-bold text-base text-gray-900">Tin nhắn</span>
        </div>
        <div className="flex items-center gap-1">
          {onOpenNotifySettings && (
            <button
              onClick={onOpenNotifySettings}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors text-sm ${
                notifyMode === 'dnd'
                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                  : notifyMode === 'mentions'
                    ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
              title={notifyMode === 'dnd' ? 'Không làm phiền' : notifyMode === 'mentions' ? 'Chỉ @mention' : 'Thông báo'}
            >
              {notifyMode === 'dnd' ? '🔕' : notifyMode === 'mentions' ? '📢' : '🔔'}
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowNewMenu(!showNewMenu)}
              className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center hover:bg-green-200 transition-colors font-bold text-sm"
              title="Tạo mới"
            >
              +
            </button>
          {showNewMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowNewMenu(false)} />
              <div className="absolute right-0 top-9 bg-white rounded-lg shadow-xl border z-20 py-1 w-40">
                <button
                  onClick={() => { onNewChat(); setShowNewMenu(false); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  💬 Chat mới
                </button>
                <button
                  onClick={() => { onNewGroup(); setShowNewMenu(false); }}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                >
                  👥 Tạo nhóm
                </button>
              </div>
            </>
          )}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm kiếm..."
          className="flex-1 px-3 py-2 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        {onOpenSearch && (
          <button
            onClick={onOpenSearch}
            className="p-2 rounded-full hover:bg-green-50 text-gray-500 hover:text-green-600 transition-colors flex-shrink-0"
            title="Tìm kiếm nâng cao"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 7v6m-3-3h6" />
            </svg>
          </button>
        )}
      </div>

      {/* Room list */}
      <div className="flex-1 overflow-y-auto">
        {sortedRooms.length === 0 ? (
          <div className="text-center text-gray-400 py-10 text-sm">
            {search ? 'Không tìm thấy' : 'Chưa có cuộc trò chuyện'}
          </div>
        ) : (
          sortedRooms.map(room => {
            const info = getRoomDisplayInfo(room);
            const unread = unreadCounts?.[room.id] || 0;
            const isSelected = selectedRoomId === room.id;

            return (
              <button
                key={room.id}
                onClick={() => onSelectRoom(room)}
                className={`w-full flex items-center gap-3 px-3 py-3 transition-colors text-left border-l-4 ${
                  isSelected
                    ? 'bg-green-50 border-green-600'
                    : unread > 0
                      ? 'bg-green-50/30 border-transparent hover:bg-gray-50'
                      : 'border-transparent hover:bg-gray-50'
                }`}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm overflow-hidden">
                    {info.isGroup ? (
                      <span className="text-xl">👥</span>
                    ) : info.avatar ? (
                      <img src={info.avatar} alt="" className="w-12 h-12 rounded-full object-cover" />
                    ) : (
                      <span className="text-lg">{info.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm truncate ${unread > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                      {info.name}
                      {info.isGroup && info.memberCount > 0 && (
                        <span className="text-gray-400 font-normal ml-1">({info.memberCount})</span>
                      )}
                    </span>
                    <span className={`text-[11px] flex-shrink-0 ml-2 ${unread > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                      {formatLastTime(room.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className={`text-xs truncate ${unread > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>
                      {room.last_message_by && room.type === 'group' && room.last_message_by !== currentUser?.name
                        ? `${room.last_message_by}: ${room.last_message || ''}`
                        : room.last_message || 'Chưa có tin nhắn'
                      }
                    </p>
                    {unread > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0 ml-2">
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
