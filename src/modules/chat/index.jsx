import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';
import ChatRoomList from '../../components/chat/ChatRoomList';
import ChatWindow from '../../components/chat/ChatWindow';
import ChatSearchPanel from '../../components/chat/ChatSearchPanel';
import NewChatModal from '../../components/chat/NewChatModal';
import ChatGroupModal from '../../components/chat/ChatGroupModal';
import ZaloChatView from './ZaloChatView';
import { playMessageSound } from '../../utils/notificationSound';

const CHAT_TABS = [
  { id: 'internal', label: 'Nội bộ', icon: '💬' },
  { id: 'zalo', label: 'Zalo OA', icon: '📱' },
];

export default function ChatModule() {
  const { currentUser, tenant, allUsers, navigateTo } = useApp();
  const [chatTab, setChatTab] = useState('internal');

  const [activeRoom, setActiveRoom] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [showNewChat, setShowNewChat] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [scrollToMessageId, setScrollToMessageId] = useState(null);

  const loadingRef = useRef(false);
  const activeRoomRef = useRef(null);
  activeRoomRef.current = activeRoom;
  const chatContainerRef = useRef(null);

  // Dynamic height: accounts for header, tabs, bottom bar, and mobile keyboard
  useEffect(() => {
    const el = chatContainerRef.current;
    if (!el) return;

    const updateHeight = () => {
      const vv = window.visualViewport;
      const viewportHeight = vv ? vv.height : window.innerHeight;
      const rect = el.getBoundingClientRect();
      const topOffset = vv ? (rect.top - vv.offsetTop) : rect.top;
      const isMobile = window.innerWidth < 768;
      const keyboardVisible = vv && (window.innerHeight - vv.height > 150);
      // On mobile without keyboard: subtract MobileBottomTabs height (~64px)
      // On mobile with keyboard: bottom tabs hidden behind keyboard, no subtraction
      const bottomPad = isMobile && !keyboardVisible ? 64 : 0;
      el.style.height = `${Math.max(viewportHeight - Math.max(topOffset, 0) - bottomPad, 300)}px`;
    };

    updateHeight();

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateHeight);
      vv.addEventListener('scroll', updateHeight);
    }
    window.addEventListener('resize', updateHeight);

    return () => {
      if (vv) {
        vv.removeEventListener('resize', updateHeight);
        vv.removeEventListener('scroll', updateHeight);
      }
      window.removeEventListener('resize', updateHeight);
    };
  }, [chatTab]);

  const roomIdsKey = useMemo(() => rooms.map(r => r.id).sort().join(','), [rooms]);

  // Load rooms
  const loadRooms = useCallback(async () => {
    if (!currentUser?.id || !tenant?.id || loadingRef.current) return;
    loadingRef.current = true;
    try {
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

      const { data: roomData, error: roomErr } = await supabase
        .from('chat_rooms')
        .select('*')
        .in('id', roomIds)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true);

      if (roomErr) throw roomErr;

      const { data: allMembers } = await supabase
        .from('chat_room_members')
        .select('*')
        .in('room_id', roomIds);

      const roomsWithMembers = (roomData || []).map(r => ({
        ...r,
        members: (allMembers || []).filter(m => m.room_id === r.id)
      }));

      setRooms(roomsWithMembers);

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

  useEffect(() => { loadRooms(); }, [loadRooms]);

  // Realtime: listen for new messages across all rooms
  useEffect(() => {
    if (!currentUser?.id || !roomIdsKey) return;

    const roomIds = roomIdsKey.split(',').filter(Boolean);
    const channels = [];

    roomIds.forEach(roomId => {
      const channel = supabase
        .channel(`chat-module-${roomId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`
        }, (payload) => {
          const msg = payload.new;
          setRooms(prev => prev.map(r => {
            if (r.id !== roomId) return r;
            return {
              ...r,
              last_message: msg.content || (msg.file_name ? `📎 ${msg.file_name}` : ''),
              last_message_at: msg.created_at,
              last_message_by: msg.sender_name
            };
          }));

          if (msg.sender_id !== currentUser?.id) {
            const currentActiveRoom = activeRoomRef.current;
            if (currentActiveRoom?.id !== roomId) {
              setUnreadCounts(prev => ({
                ...prev,
                [roomId]: (prev[roomId] || 0) + 1
              }));
              // Phát âm thanh khi tin nhắn ở room khác
              playMessageSound();
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

  // Select room (optionally scroll to a specific message)
  const handleSelectRoom = (room, messageId) => {
    setActiveRoom(room);
    setScrollToMessageId(messageId || null);
    setUnreadCounts(prev => {
      const next = { ...prev };
      delete next[room.id];
      return next;
    });
  };

  // Back to room list (mobile)
  const handleBackToList = () => {
    setActiveRoom(null);
    loadRooms();
  };

  // Create direct chat
  const handleSelectUserForChat = async (user) => {
    try {
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
        const { data: directRooms } = await supabase
          .from('chat_rooms')
          .select('*')
          .in('id', commonRoomIds)
          .eq('type', 'direct')
          .eq('is_active', true);

        if (directRooms?.length > 0) {
          const existingRoom = directRooms[0];
          await supabase
            .from('chat_room_members')
            .update({ is_active: true })
            .eq('room_id', existingRoom.id)
            .eq('user_id', currentUser.id);

          setShowNewChat(false);
          await loadRooms();
          const { data: members } = await supabase
            .from('chat_room_members')
            .select('*')
            .eq('room_id', existingRoom.id);
          setActiveRoom({ ...existingRoom, members: members || [] });
          return;
        }
      }

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

  if (!currentUser || !tenant) return null;

  return (
    <div ref={chatContainerRef} className="bg-white md:rounded-xl md:shadow-sm md:border md:mx-4 md:mt-2 flex flex-col" style={{ minHeight: '300px' }}>
      {/* Tab switcher */}
      <div className="flex items-center border-b bg-gray-50 md:rounded-t-xl px-2 flex-shrink-0">
        {CHAT_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setChatTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              chatTab === tab.id
                ? 'border-blue-500 text-blue-600 bg-white'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      {chatTab === 'internal' ? (
        <>
          {/* Desktop: 2 columns */}
          <div className="flex flex-1 min-h-0">
            {/* Sidebar - desktop always visible, mobile only when no active room */}
            <div className={`${activeRoom ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 md:border-r md:flex-shrink-0`}>
              {showSearch ? (
                <ChatSearchPanel
                  rooms={rooms}
                  currentUser={currentUser}
                  allUsers={allUsers}
                  onSelectRoom={handleSelectRoom}
                  onClose={() => setShowSearch(false)}
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
                  onOpenSearch={() => setShowSearch(true)}
                  selectedRoomId={activeRoom?.id}
                />
              )}
            </div>

            {/* Chat area - desktop always visible, mobile only when room selected */}
            <div className={`${activeRoom ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0`}>
              {activeRoom ? (
                <ChatWindow
                  room={activeRoom}
                  currentUser={currentUser}
                  allUsers={allUsers}
                  onBack={handleBackToList}
                  onRoomUpdated={loadRooms}
                  onNavigate={navigateTo}
                  scrollToMessageId={scrollToMessageId}
                  onScrollComplete={() => setScrollToMessageId(null)}
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
                  <div className="text-6xl mb-4">💬</div>
                  <h3 className="text-lg font-medium text-gray-500">Chọn hội thoại</h3>
                  <p className="text-sm mt-1">để bắt đầu nhắn tin</p>
                </div>
              )}
            </div>
          </div>

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
      ) : (
        <ZaloChatView />
      )}
    </div>
  );
}
