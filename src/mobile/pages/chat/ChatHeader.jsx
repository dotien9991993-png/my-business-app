import React from 'react';

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

  return (
    <header className="mchat-conv-header">
      <button className="mchat-back-btn" onClick={onBack}>←</button>
      <div className="mchat-header-avatar">
        {roomAvatar
          ? <img src={roomAvatar} alt="" />
          : isGroup
            ? '👥'
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
