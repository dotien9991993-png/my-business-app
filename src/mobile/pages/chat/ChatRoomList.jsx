import React, { useState, useMemo } from 'react';

const formatLastTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const vnDate = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const today = new Date(vnNow.getFullYear(), vnNow.getMonth(), vnNow.getDate());
  const msgDay = new Date(vnDate.getFullYear(), vnDate.getMonth(), vnDate.getDate());
  const diffDays = Math.floor((today - msgDay) / 86400000);

  if (diffDays === 0) return vnDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Hôm qua';
  if (diffDays < 7) return `${diffDays} ngày`;
  return vnDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

export default function ChatRoomList({
  rooms, user, allUsers, unreadCounts, loading,
  onSelectRoom, onNewChat, onNewGroup
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | group | direct

  const processedRooms = useMemo(() => {
    return rooms
      .map(room => {
        const isGroup = room.type === 'group';
        const otherMember = !isGroup
          ? (room.members || []).find(m => m.user_id !== user?.id)
          : null;
        const otherUser = otherMember
          ? (allUsers || []).find(u => u.id === otherMember.user_id)
          : null;

        return {
          ...room,
          displayName: isGroup
            ? (room.name || 'Nhóm chat')
            : (otherUser?.name || otherMember?.user_name || 'Người dùng'),
          displayAvatar: isGroup ? null : (otherUser?.avatar_url || otherMember?.user_avatar),
          isGroup,
          unread: unreadCounts[room.id] || 0,
        };
      })
      .filter(r => {
        if (filter === 'group') return r.isGroup;
        if (filter === 'direct') return !r.isGroup;
        return true;
      })
      .filter(r => !search || r.displayName?.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
        const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
        return tb - ta;
      });
  }, [rooms, user?.id, allUsers, unreadCounts, filter, search]);

  return (
    <div className="mchat-room-list">
      {/* Search */}
      <div className="mchat-search-bar">
        <input
          placeholder="Tìm cuộc trò chuyện..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <button className="mchat-new-btn" onClick={onNewChat} title="Tin nhắn mới">✏️</button>
        <button className="mchat-new-btn" onClick={onNewGroup} title="Tạo nhóm">👥</button>
      </div>

      {/* Filter tabs */}
      <div className="mchat-filter-tabs">
        {[
          { id: 'all', label: 'Tất cả' },
          { id: 'direct', label: 'Cá nhân' },
          { id: 'group', label: 'Nhóm' },
        ].map(f => (
          <button
            key={f.id}
            className={`mchat-filter-tab ${filter === f.id ? 'active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Room list */}
      <div className="mchat-rooms">
        {loading ? (
          <div className="mchat-empty-text">Đang tải...</div>
        ) : processedRooms.length === 0 ? (
          <div className="mchat-empty-text">
            {search ? 'Không tìm thấy' : 'Chưa có cuộc trò chuyện'}
          </div>
        ) : (
          processedRooms.map(room => (
            <button
              key={room.id}
              className={`mchat-room-item ${room.unread > 0 ? 'unread' : ''}`}
              onClick={() => onSelectRoom(room)}
            >
              <div className="mchat-room-avatar">
                {room.displayAvatar
                  ? <img src={room.displayAvatar} alt="" />
                  : room.isGroup
                    ? '👥'
                    : room.displayName?.charAt(0)?.toUpperCase()
                }
              </div>
              <div className="mchat-room-info">
                <div className="mchat-room-top">
                  <span className="mchat-room-name">{room.displayName}</span>
                  <span className="mchat-room-time">{formatLastTime(room.last_message_at)}</span>
                </div>
                <div className="mchat-room-bottom">
                  <span className="mchat-room-preview">
                    {room.last_message_by && room.isGroup
                      ? `${room.last_message_by}: `
                      : ''
                    }
                    {room.last_message || 'Chưa có tin nhắn'}
                  </span>
                  {room.unread > 0 && (
                    <span className="mchat-room-badge">
                      {room.unread > 99 ? '99+' : room.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
