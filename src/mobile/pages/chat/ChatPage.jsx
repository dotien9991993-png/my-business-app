import React, { useState } from 'react';
import { useMobileChat } from '../../hooks/useMobileChat';
import ChatRoomList from './ChatRoomList';
import ChatConversation from './ChatConversation';

export default function ChatPage({ user, tenantId, onHideNav, onEntityNavigate }) {
  const {
    rooms, allUsers, unreadCounts, totalUnread,
    loadingRooms, loadRooms, setActiveRoomId,
    createDirectChat, createGroup
  } = useMobileChat(user?.id, tenantId);

  const [activeRoom, setActiveRoom] = useState(null);
  const [view, setView] = useState('rooms'); // 'rooms' | 'conversation' | 'newchat' | 'newgroup'
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);

  const handleSelectRoom = (room) => {
    setActiveRoom(room);
    setActiveRoomId(room.id);
    setView('conversation');
    onHideNav?.(true);
  };

  const handleBack = () => {
    setActiveRoom(null);
    setActiveRoomId(null);
    setView('rooms');
    onHideNav?.(false);
    loadRooms();
  };

  const handleNewDirectChat = async (targetUser) => {
    try {
      const room = await createDirectChat(targetUser);
      setShowNewChat(false);
      handleSelectRoom(room);
    } catch (err) {
      console.error('Error creating direct chat:', err);
    }
  };

  const handleCreateGroup = async (name, memberIds) => {
    try {
      const room = await createGroup(name, memberIds);
      setShowNewGroup(false);
      handleSelectRoom(room);
    } catch (err) {
      console.error('Error creating group:', err);
    }
  };

  if (view === 'conversation' && activeRoom) {
    return (
      <ChatConversation
        room={activeRoom}
        user={user}
        tenantId={tenantId}
        allUsers={allUsers}
        onBack={handleBack}
        onEntityNavigate={onEntityNavigate}
      />
    );
  }

  return (
    <>
      <ChatRoomList
        rooms={rooms}
        user={user}
        allUsers={allUsers}
        unreadCounts={unreadCounts}
        loading={loadingRooms}
        onSelectRoom={handleSelectRoom}
        onNewChat={() => setShowNewChat(true)}
        onNewGroup={() => setShowNewGroup(true)}
      />

      {/* New direct chat modal */}
      {showNewChat && (
        <NewChatModal
          allUsers={allUsers}
          currentUserId={user?.id}
          onSelect={handleNewDirectChat}
          onClose={() => setShowNewChat(false)}
        />
      )}

      {/* New group modal */}
      {showNewGroup && (
        <NewGroupModal
          allUsers={allUsers}
          currentUserId={user?.id}
          onCreate={handleCreateGroup}
          onClose={() => setShowNewGroup(false)}
        />
      )}
    </>
  );
}

// --- New Chat Modal ---
function NewChatModal({ allUsers, currentUserId, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const users = (allUsers || [])
    .filter(u => u.id !== currentUserId && u.status !== 'inactive' && u.status !== 'suspended')
    .filter(u => !search || u.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="mchat-modal-overlay">
      <div className="mchat-modal">
        <div className="mchat-modal-header">
          <button onClick={onClose} className="mchat-modal-back">←</button>
          <h3>Tin nhắn mới</h3>
        </div>
        <div className="mchat-modal-search">
          <input placeholder="Tìm người..." value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        </div>
        <div className="mchat-modal-list">
          {users.map(u => (
            <button key={u.id} className="mchat-user-item" onClick={() => onSelect(u)}>
              <div className="mchat-user-avatar">
                {u.avatar_url ? <img src={u.avatar_url} alt="" /> : u.name?.charAt(0)?.toUpperCase()}
              </div>
              <div className="mchat-user-name">{u.name}</div>
            </button>
          ))}
          {users.length === 0 && <div className="mchat-empty-text">Không tìm thấy</div>}
        </div>
      </div>
    </div>
  );
}

// --- New Group Modal ---
function NewGroupModal({ allUsers, currentUserId, onCreate, onClose }) {
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');

  const users = (allUsers || [])
    .filter(u => u.id !== currentUserId && u.status !== 'inactive' && u.status !== 'suspended')
    .filter(u => !search || u.name?.toLowerCase().includes(search.toLowerCase()));

  const toggle = (uid) => {
    setSelected(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
  };

  return (
    <div className="mchat-modal-overlay">
      <div className="mchat-modal">
        <div className="mchat-modal-header">
          <button onClick={onClose} className="mchat-modal-back">←</button>
          <h3>Tạo nhóm</h3>
          <button
            className="mchat-modal-action"
            onClick={() => onCreate(groupName.trim(), selected)}
            disabled={!groupName.trim() || selected.length === 0}
          >
            Tạo ({selected.length})
          </button>
        </div>
        <div className="mchat-group-name-input">
          <input placeholder="Tên nhóm" value={groupName} onChange={e => setGroupName(e.target.value)} autoFocus />
        </div>

        {selected.length > 0 && (
          <div className="mchat-selected-chips">
            {selected.map(uid => {
              const u = allUsers.find(x => x.id === uid);
              return (
                <span key={uid} className="mchat-chip">
                  {u?.name || 'User'}
                  <button onClick={() => toggle(uid)}>✕</button>
                </span>
              );
            })}
          </div>
        )}

        <div className="mchat-modal-search">
          <input placeholder="Tìm thành viên..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="mchat-modal-list">
          {users.map(u => (
            <button key={u.id} className="mchat-user-item" onClick={() => toggle(u.id)}>
              <div className="mchat-user-avatar">
                {u.avatar_url ? <img src={u.avatar_url} alt="" /> : u.name?.charAt(0)?.toUpperCase()}
              </div>
              <div className="mchat-user-name">{u.name}</div>
              <div className={`mchat-check ${selected.includes(u.id) ? 'checked' : ''}`}>
                {selected.includes(u.id) ? '✓' : ''}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
