import React from 'react';

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

export default function ChatHeader({ room, user, allUsers, onBack }) {
  const isGroup = room.type === 'group';
  const activeMembers = (room.members || []).filter(m => m.is_active !== false);
  const otherMember = !isGroup
    ? (room.members || []).find(m => m.user_id !== user?.id)
    : null;
  const otherUser = otherMember
    ? (allUsers || []).find(u => u.id === otherMember.user_id)
    : null;

  const roomName = isGroup
    ? (room.name || 'Nhóm chat')
    : (otherUser?.name || otherMember?.user_name || 'Người dùng');
  const roomAvatar = isGroup ? null : (otherUser?.avatar_url || otherMember?.user_avatar);
  const memberCount = activeMembers.length;
  const avatarColor = getAvatarColor(roomName);

  return (
    <header className="mchat-conv-header">
      <button className="mchat-back-btn" onClick={onBack}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div className="mchat-header-avatar" style={{ background: roomAvatar ? 'transparent' : (isGroup ? '#4a90d9' : avatarColor) }}>
        {roomAvatar
          ? <img src={roomAvatar} alt="" onError={e => { e.target.style.display='none'; e.target.parentElement.style.background=avatarColor; e.target.parentElement.textContent=roomName?.charAt(0)?.toUpperCase(); }} />
          : isGroup
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
            : roomName?.charAt(0)?.toUpperCase()
        }
      </div>
      <div className="mchat-header-info">
        <div className="mchat-header-name">{roomName}</div>
        {isGroup && <div className="mchat-header-members">{memberCount} thành viên</div>}
      </div>
    </header>
  );
}
