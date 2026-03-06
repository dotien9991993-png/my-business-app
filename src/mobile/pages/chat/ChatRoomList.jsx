import React, { useState, useMemo } from 'react';

const AVATAR_COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
  '#3498db', '#9b59b6', '#e91e63', '#00bcd4', '#ff5722',
];

const getAvatarColor = (name) => {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

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
  if (diffDays < 7) {
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return days[vnDate.getDay()];
  }
  return vnDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

const truncatePreview = (text, maxLen = 40) => {
  if (!text) return '';
  return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
};

export default function ChatRoomList({
  rooms, user, allUsers, unreadCounts, loading,
  onSelectRoom, onNewChat, onNewGroup
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

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
      {/* Header bar */}
      <div className="mchat-list-header">
        <h2 className="mchat-list-title">Tin nhắn</h2>
        <div className="mchat-list-actions">
          <button className="mchat-action-btn" onClick={onNewChat} title="Tin nhắn mới">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button className="mchat-action-btn" onClick={onNewGroup} title="Tạo nhóm">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mchat-search-bar">
        <div className="mchat-search-input-wrap">
          <svg className="mchat-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input
            placeholder="Tìm cuộc trò chuyện..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="mchat-search-clear" onClick={() => setSearch('')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Filter chips */}
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
          <div className="mchat-empty-state">
            <div className="mchat-spinner" />
            <p>Đang tải...</p>
          </div>
        ) : processedRooms.length === 0 ? (
          <div className="mchat-empty-state">
            <div className="mchat-empty-icon">
              {search ? (
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              ) : (
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              )}
            </div>
            <p>{search ? 'Không tìm thấy' : 'Chưa có cuộc trò chuyện'}</p>
            {!search && <p className="mchat-empty-sub">Bắt đầu bằng cách nhắn tin cho ai đó</p>}
          </div>
        ) : (
          processedRooms.map(room => {
            const avatarColor = getAvatarColor(room.displayName);
            return (
              <button
                key={room.id}
                className={`mchat-room-item ${room.unread > 0 ? 'unread' : ''}`}
                onClick={() => onSelectRoom(room)}
              >
                <div className="mchat-room-avatar" style={{ background: room.displayAvatar ? 'transparent' : (room.isGroup ? '#4a90d9' : avatarColor) }}>
                  {room.displayAvatar
                    ? <img src={room.displayAvatar} alt="" />
                    : room.isGroup
                      ? <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                      : room.displayName?.charAt(0)?.toUpperCase()
                  }
                </div>
                <div className="mchat-room-info">
                  <div className="mchat-room-name">{room.displayName}</div>
                  <div className="mchat-room-preview">
                    {room.last_message_by && room.isGroup
                      ? <span className="mchat-preview-sender">{room.last_message_by}: </span>
                      : null
                    }
                    {truncatePreview(room.last_message) || 'Chưa có tin nhắn'}
                  </div>
                </div>
                <div className="mchat-room-meta">
                  <span className={`mchat-room-time ${room.unread > 0 ? 'unread' : ''}`}>
                    {formatLastTime(room.last_message_at)}
                  </span>
                  {room.unread > 0 && (
                    <span className="mchat-room-badge">
                      {room.unread > 99 ? '99+' : room.unread}
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
