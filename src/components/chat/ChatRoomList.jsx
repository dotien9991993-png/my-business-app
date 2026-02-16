import React, { useState, useMemo } from 'react';

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
  onClose
}) {
  const [search, setSearch] = useState('');

  // Tìm tên hiển thị cho phòng
  const getRoomDisplayInfo = (room) => {
    if (room.type === 'group') {
      return {
        name: room.name || 'Nhóm chat',
        avatar: null,
        isGroup: true
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
    // Sắp xếp: phòng có tin mới nhất lên trên
    return [...filtered].sort((a, b) => {
      const tA = a.last_message_at ? new Date(a.last_message_at).getTime() : new Date(a.created_at).getTime();
      const tB = b.last_message_at ? new Date(b.last_message_at).getTime() : new Date(b.created_at).getTime();
      return tB - tA;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, search, currentUser, allUsers]);

  const totalUnread = Object.values(unreadCounts || {}).reduce((s, v) => s + v, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-[#1B5E20] text-white rounded-t-xl">
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <span className="font-bold text-sm">Tin nhắn</span>
          {totalUnread > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white text-xl leading-none">&times;</button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Tìm kiếm..."
          className="w-full px-3 py-1.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-3 py-2 border-b">
        <button
          onClick={onNewChat}
          className="flex-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
        >
          + Chat mới
        </button>
        <button
          onClick={onNewGroup}
          className="flex-1 px-3 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
        >
          + Tạo nhóm
        </button>
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

            return (
              <button
                key={room.id}
                onClick={() => onSelectRoom(room)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left ${
                  unread > 0 ? 'bg-green-50/50' : ''
                }`}
              >
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="w-11 h-11 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm overflow-hidden">
                    {info.isGroup ? (
                      <span className="text-lg">👥</span>
                    ) : info.avatar ? (
                      <img src={info.avatar} alt="" className="w-11 h-11 rounded-full object-cover" />
                    ) : (
                      info.name.charAt(0).toUpperCase()
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm truncate ${unread > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                      {info.name}
                    </span>
                    <span className={`text-[10px] flex-shrink-0 ml-2 ${unread > 0 ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
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
