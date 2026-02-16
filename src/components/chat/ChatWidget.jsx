import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';

export default function ChatWidget() {
  const { currentUser, tenant, activeModule, navigateTo } = useApp();

  const [totalUnread, setTotalUnread] = useState(0);
  const loadingRef = useRef(false);
  const [roomIds, setRoomIds] = useState([]);

  const roomIdsKey = useMemo(() => roomIds.sort().join(','), [roomIds]);

  // Load unread count
  const loadUnreadCount = useCallback(async () => {
    if (!currentUser?.id || !tenant?.id || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const { data: memberships } = await supabase
        .from('chat_room_members')
        .select('room_id, last_read_at')
        .eq('user_id', currentUser.id)
        .eq('is_active', true);

      if (!memberships?.length) {
        setTotalUnread(0);
        setRoomIds([]);
        loadingRef.current = false;
        return;
      }

      setRoomIds(memberships.map(m => m.room_id));

      let total = 0;
      for (const m of memberships) {
        if (!m.last_read_at) continue;
        const { count, error } = await supabase
          .from('chat_messages')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', m.room_id)
          .gt('created_at', m.last_read_at)
          .neq('sender_id', currentUser.id);

        if (!error && count > 0) total += count;
      }
      setTotalUnread(total);
    } catch (err) {
      console.error('Error loading unread count:', err);
    } finally {
      loadingRef.current = false;
    }
  }, [currentUser?.id, tenant?.id]);

  useEffect(() => { loadUnreadCount(); }, [loadUnreadCount]);

  // Realtime: increment unread on new messages (when not on chat module)
  useEffect(() => {
    if (!currentUser?.id || !roomIdsKey) return;

    const ids = roomIdsKey.split(',').filter(Boolean);
    const channels = [];

    ids.forEach(roomId => {
      const channel = supabase
        .channel(`chat-badge-${roomId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`
        }, (payload) => {
          if (payload.new.sender_id !== currentUser?.id) {
            setTotalUnread(prev => prev + 1);
          }
        })
        .subscribe();

      channels.push(channel);
    });

    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [currentUser?.id, roomIdsKey]);

  // Reset unread when entering chat module
  useEffect(() => {
    if (activeModule === 'chat') {
      setTotalUnread(0);
    }
  }, [activeModule]);

  // Reload unread when leaving chat module
  useEffect(() => {
    if (activeModule !== 'chat') {
      loadUnreadCount();
    }
  }, [activeModule, loadUnreadCount]);

  if (!currentUser || !tenant) return null;
  // Hide floating button when on chat module
  if (activeModule === 'chat') return null;

  return (
    <button
      onClick={() => navigateTo('chat', 'messages')}
      className="fixed bottom-20 md:bottom-6 right-4 md:right-24 z-[9998] w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-2xl transition-all hover:scale-110 bg-[#1B5E20] text-white"
      title="Tin nhắn"
    >
      💬
      {totalUnread > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[20px] h-[20px] flex items-center justify-center px-1 shadow">
          {totalUnread > 99 ? '99+' : totalUnread}
        </span>
      )}
    </button>
  );
}
