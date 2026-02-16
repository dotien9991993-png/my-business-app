import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';
import ChatRoomList from './ChatRoomList';
import ChatWindow from './ChatWindow';
import NewChatModal from './NewChatModal';
import ChatGroupModal from './ChatGroupModal';

export default function ChatWidget() {
  const { currentUser, tenant, allUsers } = useApp();

  // Widget states
  const [isOpen, setIsOpen] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);

  // Data
  const [rooms, setRooms] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [animateIn, setAnimateIn] = useState(false);

  const loadingRef = useRef(false);
  const activeRoomRef = useRef(null);
  activeRoomRef.current = activeRoom;

  // Stable roomIds string for realtime deps (avoid re-subscription on every rooms update)
  const roomIdsKey = useMemo(() => rooms.map(r => r.id).sort().join(','), [rooms]);

  // Load rooms user tham gia
  const loadRooms = useCallback(async () => {
    if (!currentUser?.id || !tenant?.id || loadingRef.current) return;
    loadingRef.current = true;
    try {
      // 1. Lấy room IDs user tham gia
      const { data: memberships, error: memberErr } = await supabase
        .from('chat_room_members')
        .select('room_id, last_read_at')
        .eq('user_id', currentUser.id)
        .eq('is_active', true);

      if (memberErr) throw memberErr;
      if (!memberships?.length) {
        setRooms([]);
        setUnreadCounts({});
        loadingRef.current = false;
        return;
      }

      const roomIds = memberships.map(m => m.room_id);
      const lastReadMap = {};
      memberships.forEach(m => { lastReadMap[m.room_id] = m.last_read_at; });

      // 2. Lấy room details
      const { data: roomData, error: roomErr } = await supabase
        .from('chat_rooms')
        .select('*')
        .in('id', roomIds)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true);

      if (roomErr) throw roomErr;

      // 3. Lấy all members của các rooms
      const { data: allMembers } = await supabase
        .from('chat_room_members')
        .select('*')
        .in('room_id', roomIds);

      // Attach members to rooms
      const roomsWithMembers = (roomData || []).map(r => ({
        ...r,
        members: (allMembers || []).filter(m => m.room_id === r.id)
      }));

      setRooms(roomsWithMembers);

      // 4. Tính unread counts
      const counts = {};
      for (const roomId of roomIds) {
        const lastRead = lastReadMap[roomId];
        if (!lastRead) continue;
        const { count, error: countErr } = await supabase
          .from('chat_messages')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', roomId)
          .gt('created_at', lastRead)
          .neq('sender_id', currentUser.id);

        if (!countErr && count > 0) {
          counts[roomId] = count;
        }
      }
      setUnreadCounts(counts);
    } catch (err) {
      console.error('Error loading chat rooms:', err);
    } finally {
      loadingRef.current = false;
    }
  }, [currentUser?.id, tenant?.id]);

  // Initial load
  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Realtime: listen for new messages across all rooms
  useEffect(() => {
    if (!currentUser?.id || !roomIdsKey) return;

    const roomIds = roomIdsKey.split(',').filter(Boolean);
    const channels = [];

    // Subscribe to each room for new messages
    roomIds.forEach(roomId => {
      const channel = supabase
        .channel(`chat-notify-${roomId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`
        }, (payload) => {
          const msg = payload.new;
          // Update room's last message in local state
          setRooms(prev => prev.map(r => {
            if (r.id !== roomId) return r;
            return {
              ...r,
              last_message: msg.content || (msg.file_name ? `📎 ${msg.file_name}` : ''),
              last_message_at: msg.created_at,
              last_message_by: msg.sender_name
            };
          }));

          // Update unread count (only if not from current user and not active room)
          if (msg.sender_id !== currentUser?.id) {
            const currentActiveRoom = activeRoomRef.current;
            if (currentActiveRoom?.id !== roomId) {
              setUnreadCounts(prev => ({
                ...prev,
                [roomId]: (prev[roomId] || 0) + 1
              }));
            }
          }
        })
        .subscribe();

      channels.push(channel);
    });

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch));
    };
  }, [currentUser?.id, roomIdsKey]);

  // Open/close animation
  const handleToggle = () => {
    if (!isOpen) {
      setIsOpen(true);
      setTimeout(() => setAnimateIn(true), 10);
    } else {
      setAnimateIn(false);
      setTimeout(() => {
        setIsOpen(false);
        setActiveRoom(null);
      }, 200);
    }
  };

  const handleClose = () => {
    setAnimateIn(false);
    setTimeout(() => {
      setIsOpen(false);
      setActiveRoom(null);
    }, 200);
  };

  // Select room
  const handleSelectRoom = (room) => {
    setActiveRoom(room);
    // Clear unread for this room
    setUnreadCounts(prev => {
      const next = { ...prev };
      delete next[room.id];
      return next;
    });
  };

  // Back to room list
  const handleBackToList = () => {
    setActiveRoom(null);
    loadRooms(); // Refresh rooms
  };

  // Create direct chat
  const handleSelectUserForChat = async (user) => {
    try {
      // Check phòng direct đã có chưa
      const { data: myMemberships } = await supabase
        .from('chat_room_members')
        .select('room_id')
        .eq('user_id', currentUser.id)
        .eq('is_active', true);

      const { data: theirMemberships } = await supabase
        .from('chat_room_members')
        .select('room_id')
        .eq('user_id', user.id)
        .eq('is_active', true);

      const myRoomIds = new Set((myMemberships || []).map(m => m.room_id));
      const commonRoomIds = (theirMemberships || [])
        .filter(m => myRoomIds.has(m.room_id))
        .map(m => m.room_id);

      if (commonRoomIds.length > 0) {
        // Check if any is direct
        const { data: directRooms } = await supabase
          .from('chat_rooms')
          .select('*')
          .in('id', commonRoomIds)
          .eq('type', 'direct')
          .eq('is_active', true);

        if (directRooms?.length > 0) {
          // Phòng đã có → mở
          const existingRoom = directRooms[0];
          // Re-activate if needed
          await supabase
            .from('chat_room_members')
            .update({ is_active: true })
            .eq('room_id', existingRoom.id)
            .eq('user_id', currentUser.id);

          setShowNewChat(false);
          await loadRooms();
          // Find room with members
          const { data: members } = await supabase
            .from('chat_room_members')
            .select('*')
            .eq('room_id', existingRoom.id);
          setActiveRoom({ ...existingRoom, members: members || [] });
          return;
        }
      }

      // Tạo phòng mới
      const { data: newRoom, error: roomErr } = await supabase
        .from('chat_rooms')
        .insert([{
          tenant_id: tenant.id,
          type: 'direct',
          created_by: currentUser.name
        }])
        .select()
        .single();

      if (roomErr) throw roomErr;

      // Thêm 2 thành viên
      const { error: membersErr } = await supabase
        .from('chat_room_members')
        .insert([
          {
            room_id: newRoom.id,
            user_id: currentUser.id,
            user_name: currentUser.name,
            user_avatar: currentUser.avatar_url || null,
            role: 'admin'
          },
          {
            room_id: newRoom.id,
            user_id: user.id,
            user_name: user.name,
            user_avatar: user.avatar_url || null,
            role: 'member'
          }
        ]);

      if (membersErr) throw membersErr;

      setShowNewChat(false);
      await loadRooms();

      const { data: members } = await supabase
        .from('chat_room_members')
        .select('*')
        .eq('room_id', newRoom.id);

      setActiveRoom({ ...newRoom, members: members || [] });
    } catch (err) {
      console.error('Error creating direct chat:', err);
      alert('Lỗi tạo cuộc trò chuyện!');
    }
  };

  // Create group
  const handleCreateGroup = async (name, memberIds) => {
    try {
      const { data: newRoom, error: roomErr } = await supabase
        .from('chat_rooms')
        .insert([{
          tenant_id: tenant.id,
          type: 'group',
          name,
          created_by: currentUser.name
        }])
        .select()
        .single();

      if (roomErr) throw roomErr;

      // Tạo members (bao gồm cả mình)
      const memberRows = [
        {
          room_id: newRoom.id,
          user_id: currentUser.id,
          user_name: currentUser.name,
          user_avatar: currentUser.avatar_url || null,
          role: 'admin'
        },
        ...memberIds.map(uid => {
          const u = (allUsers || []).find(x => x.id === uid);
          return {
            room_id: newRoom.id,
            user_id: uid,
            user_name: u?.name || 'User',
            user_avatar: u?.avatar_url || null,
            role: 'member'
          };
        })
      ];

      const { error: membersErr } = await supabase
        .from('chat_room_members')
        .insert(memberRows);

      if (membersErr) throw membersErr;

      // System message
      await supabase.from('chat_messages').insert([{
        room_id: newRoom.id,
        sender_id: currentUser.id,
        sender_name: currentUser.name,
        content: `${currentUser.name} đã tạo nhóm "${name}"`,
        message_type: 'system'
      }]);

      setShowNewGroup(false);
      await loadRooms();

      const { data: members } = await supabase
        .from('chat_room_members')
        .select('*')
        .eq('room_id', newRoom.id);

      setActiveRoom({ ...newRoom, members: members || [] });
    } catch (err) {
      console.error('Error creating group:', err);
      alert('Lỗi tạo nhóm!');
    }
  };

  // Total unread
  const totalUnread = Object.values(unreadCounts).reduce((s, v) => s + v, 0);

  if (!currentUser || !tenant) return null;

  return (
    <>
      {/* Floating chat button */}
      <button
        onClick={handleToggle}
        className={`fixed bottom-20 md:bottom-6 z-[9998] w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl transition-all hover:scale-110 bg-[#1B5E20] text-white ${
          isOpen ? 'max-md:hidden right-[370px] md:right-[370px]' : 'right-4 md:right-24'
        }`}
        style={{ transition: 'right 0.2s ease, transform 0.15s ease' }}
        title="Tin nhắn"
      >
        {isOpen ? '✕' : '💬'}
        {!isOpen && totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 shadow">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {/* Chat popup */}
      {isOpen && (
        <div
          className={`fixed z-[9999] transition-all duration-200 ease-out
            ${animateIn ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
            bottom-5 right-5 w-[350px] h-[500px]
            max-md:bottom-0 max-md:right-0 max-md:w-full max-md:h-full max-md:rounded-none
          `}
        >
          <div className="w-full h-full bg-white rounded-xl md:rounded-xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden">
            {activeRoom ? (
              <ChatWindow
                room={activeRoom}
                currentUser={currentUser}
                allUsers={allUsers}
                onBack={handleBackToList}
                onRoomUpdated={loadRooms}
              />
            ) : (
              <ChatRoomList
                rooms={rooms}
                currentUser={currentUser}
                allUsers={allUsers}
                unreadCounts={unreadCounts}
                onSelectRoom={handleSelectRoom}
                onNewChat={() => setShowNewChat(true)}
                onNewGroup={() => setShowNewGroup(true)}
                onClose={handleClose}
              />
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showNewChat && (
        <NewChatModal
          allUsers={allUsers}
          currentUser={currentUser}
          onSelectUser={handleSelectUserForChat}
          onClose={() => setShowNewChat(false)}
        />
      )}

      {showNewGroup && (
        <ChatGroupModal
          allUsers={allUsers}
          currentUser={currentUser}
          onCreate={handleCreateGroup}
          onClose={() => setShowNewGroup(false)}
        />
      )}
    </>
  );
}
