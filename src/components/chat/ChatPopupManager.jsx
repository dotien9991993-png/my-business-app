import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';
import ChatPopupList from './ChatPopupList';
import ChatPopupWindow from './ChatPopupWindow';
import ChatNotificationSettings from './ChatNotificationSettings';
import { playMessageSound, shouldNotify, showBrowserNotification, incrementTabUnread } from '../../utils/notificationSound';

const MAX_WINDOWS = 2;

export default function ChatPopupManager() {
  const { currentUser, tenant, allUsers, activeModule, navigateTo } = useApp();

  const [showList, setShowList] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState('');

  // Windows: [{ roomId, room, isMinimized }]
  const [openWindows, setOpenWindows] = useState([]);

  // Rooms & unread (shared with popup list)
  const [rooms, setRooms] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [totalUnread, setTotalUnread] = useState(0);

  const loadingRef = useRef(false);
  const openWindowsRef = useRef([]);
  openWindowsRef.current = openWindows;

  // Per-window unread tracking for minimized windows
  const [windowUnread, setWindowUnread] = useState({});

  const roomIdsKey = useMemo(() => rooms.map(r => r.id).sort().join(','), [rooms]);

  // Load rooms
  const loadRooms = useCallback(async () => {
    if (!currentUser?.id || !tenant?.id || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const { data: memberships } = await supabase
        .from('chat_room_members')
        .select('room_id, last_read_at')
        .eq('user_id', currentUser.id)
        .eq('is_active', true);

      if (!memberships?.length) {
        setRooms([]); setUnreadCounts({}); setTotalUnread(0);
        loadingRef.current = false;
        return;
      }

      const roomIds = memberships.map(m => m.room_id);
      const lastReadMap = {};
      memberships.forEach(m => { lastReadMap[m.room_id] = m.last_read_at; });

      const { data: roomData } = await supabase
        .from('chat_rooms')
        .select('*')
        .in('id', roomIds)
        .eq('tenant_id', tenant.id)
        .eq('is_active', true);

      const { data: allMembers } = await supabase
        .from('chat_room_members')
        .select('*')
        .in('room_id', roomIds);

      const roomsWithMembers = (roomData || []).map(r => ({
        ...r,
        members: (allMembers || []).filter(m => m.room_id === r.id)
      }));
      setRooms(roomsWithMembers);

      let total = 0;
      const counts = {};
      for (const roomId of roomIds) {
        const lastRead = lastReadMap[roomId];
        if (!lastRead) continue;
        const { count } = await supabase
          .from('chat_messages')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', roomId)
          .gt('created_at', lastRead)
          .neq('sender_id', currentUser.id);
        if (count > 0) {
          counts[roomId] = count;
          total += count;
        }
      }
      setUnreadCounts(counts);
      setTotalUnread(total);
    } catch (err) {
      console.error('PopupManager: Error loading rooms:', err);
    } finally {
      loadingRef.current = false;
    }
  }, [currentUser?.id, tenant?.id]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  // Realtime: new messages
  useEffect(() => {
    if (!currentUser?.id || !roomIdsKey) return;
    const ids = roomIdsKey.split(',').filter(Boolean);
    const channels = [];

    ids.forEach(roomId => {
      const ch = supabase
        .channel(`popup-mgr-${roomId}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'chat_messages',
          filter: `room_id=eq.${roomId}`
        }, (payload) => {
          const msg = payload.new;
          // Update room list preview
          setRooms(prev => prev.map(r => {
            if (r.id !== roomId) return r;
            return { ...r, last_message: msg.content || (msg.file_name ? `📎 ${msg.file_name}` : ''), last_message_at: msg.created_at, last_message_by: msg.sender_name };
          }));

          if (msg.sender_id === currentUser?.id) return;

          // Check if this room is in an OPEN (non-minimized) popup window
          const win = openWindowsRef.current.find(w => w.roomId === roomId);
          if (win && !win.isMinimized) {
            // Message will appear via realtime in the popup window itself
            return;
          }

          // Minimized window → pulse
          if (win && win.isMinimized) {
            setWindowUnread(prev => ({ ...prev, [roomId]: (prev[roomId] || 0) + 1 }));
          }

          // Update unread counts
          setUnreadCounts(prev => ({ ...prev, [roomId]: (prev[roomId] || 0) + 1 }));
          setTotalUnread(prev => prev + 1);

          // Smart notification
          const notify = shouldNotify(msg, currentUser?.id, currentUser?.name);
          if (notify.shouldSound) playMessageSound();
          if (document.hidden) {
            incrementTabUnread();
            if (notify.shouldPush) {
              const prefix = notify.isPriority ? '🔴 ' : '';
              showBrowserNotification(
                `${prefix}💬 ${msg.sender_name || 'Tin nhắn mới'}`,
                msg.content || (msg.file_name ? `📎 ${msg.file_name}` : 'Tin nhắn mới'),
                () => {}
              );
            }
          }
        })
        .subscribe();
      channels.push(ch);
    });

    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [currentUser?.id, currentUser?.name, roomIdsKey]);

  // Open a chat window
  const openChatWindow = useCallback((room) => {
    setShowList(false);
    setShowNewChat(false);
    setShowSettings(false);

    setOpenWindows(prev => {
      // Already open? Just expand it
      const existing = prev.find(w => w.roomId === room.id);
      if (existing) {
        return prev.map(w => w.roomId === room.id ? { ...w, isMinimized: false } : w);
      }
      // Add new window, limit to MAX_WINDOWS
      const newWin = { roomId: room.id, room, isMinimized: false };
      const updated = [...prev, newWin];
      if (updated.length > MAX_WINDOWS) {
        return updated.slice(updated.length - MAX_WINDOWS);
      }
      return updated;
    });

    // Clear unread for this room
    setUnreadCounts(prev => {
      const cleared = prev[room.id] || 0;
      if (cleared > 0) setTotalUnread(p => Math.max(p - cleared, 0));
      const next = { ...prev };
      delete next[room.id];
      return next;
    });
    setWindowUnread(prev => { const n = { ...prev }; delete n[room.id]; return n; });
  }, []);

  // Close a window
  const closeChatWindow = useCallback((roomId) => {
    setOpenWindows(prev => prev.filter(w => w.roomId !== roomId));
    setWindowUnread(prev => { const n = { ...prev }; delete n[roomId]; return n; });
  }, []);

  // Toggle minimize
  const toggleMinimize = useCallback((roomId) => {
    setOpenWindows(prev => prev.map(w => {
      if (w.roomId !== roomId) return w;
      const nowMinimized = !w.isMinimized;
      // If expanding, clear window unread
      if (!nowMinimized) {
        setWindowUnread(p => { const n = { ...p }; delete n[roomId]; return n; });
      }
      return { ...w, isMinimized: nowMinimized };
    }));
  }, []);

  // Expand to full chat
  const expandToFull = useCallback((roomId) => {
    closeChatWindow(roomId);
    navigateTo('chat', 'messages');
  }, [closeChatWindow, navigateTo]);

  // Create direct chat from new-chat modal
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

      const myIds = new Set((myMemberships || []).map(m => m.room_id));
      const commonIds = (theirMemberships || []).filter(m => myIds.has(m.room_id)).map(m => m.room_id);

      if (commonIds.length > 0) {
        const { data: directRooms } = await supabase
          .from('chat_rooms')
          .select('*')
          .in('id', commonIds)
          .eq('type', 'direct')
          .eq('is_active', true);

        if (directRooms?.length > 0) {
          const existing = directRooms[0];
          const { data: members } = await supabase
            .from('chat_room_members')
            .select('*')
            .eq('room_id', existing.id);
          openChatWindow({ ...existing, members: members || [] });
          return;
        }
      }

      // Create new direct room
      const { data: newRoom, error: roomErr } = await supabase
        .from('chat_rooms')
        .insert([{ tenant_id: tenant.id, type: 'direct', created_by: currentUser.name }])
        .select().single();
      if (roomErr) throw roomErr;

      await supabase.from('chat_room_members').insert([
        { room_id: newRoom.id, user_id: currentUser.id, user_name: currentUser.name, user_avatar: currentUser.avatar_url || null, role: 'admin' },
        { room_id: newRoom.id, user_id: user.id, user_name: user.name, user_avatar: user.avatar_url || null, role: 'member' },
      ]);

      const { data: members } = await supabase
        .from('chat_room_members')
        .select('*')
        .eq('room_id', newRoom.id);

      await loadRooms();
      openChatWindow({ ...newRoom, members: members || [] });
    } catch (err) {
      console.error('Error creating direct chat:', err);
    }
  };

  // Keyboard shortcut: Ctrl+Shift+M
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        setShowList(prev => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // Hide everything when on chat module
  if (!currentUser || !tenant) return null;
  if (activeModule === 'chat') return null;

  // Only desktop
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  const filteredUsers = useMemo(() => {
    if (!showNewChat) return [];
    const q = newChatSearch.toLowerCase();
    return (allUsers || []).filter(u =>
      u.id !== currentUser?.id && u.is_active !== false &&
      (!q || u.name?.toLowerCase().includes(q))
    );
  }, [allUsers, currentUser, showNewChat, newChatSearch]);

  return (
    <>
      {/* FAB Button */}
      <button
        data-chat-fab
        onClick={() => {
          if (isMobile) {
            navigateTo('chat', 'messages');
          } else {
            setShowList(prev => !prev);
            setShowSettings(false);
            setShowNewChat(false);
          }
        }}
        className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-[9998] w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl transition-all hover:scale-110 bg-[#16a34a] text-white"
        title="Tin nhắn (Ctrl+Shift+M)"
      >
        💬
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 shadow">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {/* Popup List */}
      {showList && !isMobile && !showSettings && !showNewChat && (
        <div className="fixed bottom-20 md:bottom-[80px] right-4 md:right-6 z-[9999]">
          <ChatPopupList
            rooms={rooms}
            currentUser={currentUser}
            allUsers={allUsers}
            unreadCounts={unreadCounts}
            onSelectRoom={openChatWindow}
            onClose={() => setShowList(false)}
            onOpenFullChat={() => { setShowList(false); navigateTo('chat', 'messages'); }}
            onOpenNewChat={() => { setShowNewChat(true); setNewChatSearch(''); }}
            onOpenSettings={() => setShowSettings(true)}
          />
        </div>
      )}

      {/* Settings panel (in popup position) */}
      {showSettings && !isMobile && (
        <div className="fixed bottom-20 md:bottom-[80px] right-4 md:right-6 z-[9999]">
          <div className="bg-white rounded-lg shadow-xl border overflow-hidden" style={{ width: 400, maxHeight: 550, boxShadow: '0 12px 28px rgba(0,0,0,0.2)' }}>
            <ChatNotificationSettings onClose={() => { setShowSettings(false); setShowList(true); }} />
          </div>
        </div>
      )}

      {/* New chat panel */}
      {showNewChat && !isMobile && (
        <div className="fixed bottom-20 md:bottom-[80px] right-4 md:right-6 z-[9999]">
          <div className="bg-white rounded-lg shadow-xl border overflow-hidden flex flex-col" style={{ width: 400, maxHeight: 550, boxShadow: '0 12px 28px rgba(0,0,0,0.2)' }}>
            <div className="flex items-center gap-2 px-4 py-3 border-b">
              <button onClick={() => { setShowNewChat(false); setShowList(true); }} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>
              <span className="font-bold text-gray-900 text-sm">Tin nhắn mới</span>
            </div>
            <div className="px-3 py-2 border-b">
              <input
                type="text"
                value={newChatSearch}
                onChange={e => setNewChatSearch(e.target.value)}
                placeholder="Gửi đến..."
                className="w-full px-3 py-1.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto max-h-[380px]">
              {filteredUsers.length === 0 ? (
                <div className="text-center text-gray-400 py-6 text-sm">Không tìm thấy</div>
              ) : (
                filteredUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => handleSelectUserForChat(u)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-gray-50 text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs flex-shrink-0 overflow-hidden">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <span>{(u.name || '?').charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-800 font-medium">{u.name}</span>
                      {u.role && <span className="text-[10px] text-gray-400 ml-1">{u.role}</span>}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chat Windows (desktop only) */}
      {!isMobile && openWindows.map((win, idx) => {
        const rightOffset = 24 + 56 + 8 + (showList || showSettings || showNewChat ? 408 : 0);
        const winRight = rightOffset + idx * 388;

        return (
          <div
            key={win.roomId}
            className="fixed z-[9997]"
            style={{
              bottom: 0,
              right: winRight,
              transition: 'right 0.2s ease',
            }}
          >
            <ChatPopupWindow
              room={win.room}
              currentUser={currentUser}
              allUsers={allUsers}
              isMinimized={win.isMinimized}
              newMessagePulse={(windowUnread[win.roomId] || 0) > 0}
              onClose={() => closeChatWindow(win.roomId)}
              onMinimize={() => toggleMinimize(win.roomId)}
              onExpand={() => expandToFull(win.roomId)}
            />
          </div>
        );
      })}
    </>
  );
}
