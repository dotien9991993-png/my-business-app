import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { playMessageSound, shouldNotify } from '../../utils/notificationSound';

const PAGE_SIZE = 50;

export function useMobileChat(userId, tenantId) {
  const [rooms, setRooms] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [loadingRooms, setLoadingRooms] = useState(true);
  const loadingRef = useRef(false);
  const activeRoomIdRef = useRef(null);

  // Load all users for @mention, new chat, etc.
  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      const { data } = await supabase
        .from('users')
        .select('id, name, username, avatar_url, role, status')
        .eq('tenant_id', tenantId)
        .eq('status', 'approved');
      setAllUsers(data || []);
    };
    load();
  }, [tenantId]);

  // Load rooms
  const loadRooms = useCallback(async () => {
    if (!userId || !tenantId || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const { data: memberships } = await supabase
        .from('chat_room_members')
        .select('room_id, last_read_at')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (!memberships?.length) {
        setRooms([]);
        setUnreadCounts({});
        return;
      }

      const roomIds = memberships.map(m => m.room_id);
      const lastReadMap = {};
      memberships.forEach(m => { lastReadMap[m.room_id] = m.last_read_at; });

      const { data: roomData } = await supabase
        .from('chat_rooms')
        .select('*')
        .in('id', roomIds)
        .eq('tenant_id', tenantId)
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

      // Count unread
      const counts = {};
      for (const roomId of roomIds) {
        const lastRead = lastReadMap[roomId];
        if (!lastRead) continue;
        const { count } = await supabase
          .from('chat_messages')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', roomId)
          .gt('created_at', lastRead)
          .neq('sender_id', userId);
        if (count > 0) counts[roomId] = count;
      }
      setUnreadCounts(counts);
    } catch (err) {
      console.error('Error loading rooms:', err);
    } finally {
      loadingRef.current = false;
      setLoadingRooms(false);
    }
  }, [userId, tenantId]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  // Realtime: new messages across all rooms
  const roomIdsKey = useMemo(() => rooms.map(r => r.id).sort().join(','), [rooms]);

  useEffect(() => {
    if (!userId || !roomIdsKey) return;
    const roomIds = roomIdsKey.split(',').filter(Boolean);
    const channels = [];

    roomIds.forEach(roomId => {
      const ch = supabase
        .channel(`mobile-chat-room-${roomId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${roomId}`
        }, (payload) => {
          const msg = payload.new;
          // Update room preview
          setRooms(prev => prev.map(r => {
            if (r.id !== roomId) return r;
            return {
              ...r,
              last_message: msg.content || (msg.file_name ? `📎 ${msg.file_name}` : ''),
              last_message_at: msg.created_at,
              last_message_by: msg.sender_name || ''
            };
          }));

          // Increment unread if not own and not active room
          if (msg.sender_id !== userId) {
            if (activeRoomIdRef.current !== roomId) {
              setUnreadCounts(prev => ({
                ...prev,
                [roomId]: (prev[roomId] || 0) + 1
              }));
              const notify = shouldNotify(msg, userId);
              if (notify.shouldSound) playMessageSound();
            }
          }
        })
        .subscribe();
      channels.push(ch);
    });

    return () => { channels.forEach(ch => supabase.removeChannel(ch)); };
  }, [userId, roomIdsKey]);

  // Set active room (for unread tracking)
  const setActiveRoomId = useCallback((roomId) => {
    activeRoomIdRef.current = roomId;
    if (roomId) {
      setUnreadCounts(prev => {
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
    }
  }, []);

  // Create direct chat
  const createDirectChat = useCallback(async (targetUser) => {
    // Check existing
    const { data: myMemberships } = await supabase
      .from('chat_room_members')
      .select('room_id')
      .eq('user_id', userId)
      .eq('is_active', true);

    const { data: theirMemberships } = await supabase
      .from('chat_room_members')
      .select('room_id')
      .eq('user_id', targetUser.id)
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
        await supabase
          .from('chat_room_members')
          .update({ is_active: true })
          .eq('room_id', directRooms[0].id)
          .eq('user_id', userId);
        await loadRooms();
        const { data: members } = await supabase
          .from('chat_room_members')
          .select('*')
          .eq('room_id', directRooms[0].id);
        return { ...directRooms[0], members: members || [] };
      }
    }

    // Create new
    const { data: newRoom, error } = await supabase
      .from('chat_rooms')
      .insert([{ tenant_id: tenantId, type: 'direct', created_by: targetUser.name }])
      .select()
      .single();
    if (error) throw error;

    const currentUserData = allUsers.find(u => u.id === userId);
    await supabase.from('chat_room_members').insert([
      { room_id: newRoom.id, user_id: userId, user_name: currentUserData?.name || '', user_avatar: currentUserData?.avatar_url || null, role: 'admin' },
      { room_id: newRoom.id, user_id: targetUser.id, user_name: targetUser.name, user_avatar: targetUser.avatar_url || null, role: 'member' }
    ]);

    await loadRooms();
    const { data: members } = await supabase
      .from('chat_room_members')
      .select('*')
      .eq('room_id', newRoom.id);
    return { ...newRoom, members: members || [] };
  }, [userId, tenantId, allUsers, loadRooms]);

  // Create group
  const createGroup = useCallback(async (name, memberIds) => {
    const currentUserData = allUsers.find(u => u.id === userId);
    const { data: newRoom, error } = await supabase
      .from('chat_rooms')
      .insert([{ tenant_id: tenantId, type: 'group', name, created_by: currentUserData?.name || '' }])
      .select()
      .single();
    if (error) throw error;

    const memberRows = [
      { room_id: newRoom.id, user_id: userId, user_name: currentUserData?.name || '', user_avatar: currentUserData?.avatar_url || null, role: 'admin' },
      ...memberIds.map(uid => {
        const u = allUsers.find(x => x.id === uid);
        return {
          room_id: newRoom.id, user_id: uid,
          user_name: u?.name || 'User', user_avatar: u?.avatar_url || null, role: 'member'
        };
      })
    ];
    await supabase.from('chat_room_members').insert(memberRows);

    await supabase.from('chat_messages').insert([{
      room_id: newRoom.id,
      sender_id: userId,
      sender_name: currentUserData?.name || '',
      content: `${currentUserData?.name} đã tạo nhóm "${name}"`,
      message_type: 'system'
    }]);

    await loadRooms();
    const { data: members } = await supabase
      .from('chat_room_members')
      .select('*')
      .eq('room_id', newRoom.id);
    return { ...newRoom, members: members || [] };
  }, [userId, tenantId, allUsers, loadRooms]);

  // Total unread for badge
  const totalUnread = useMemo(() =>
    Object.values(unreadCounts).reduce((a, b) => a + b, 0),
    [unreadCounts]
  );

  return {
    rooms,
    allUsers,
    unreadCounts,
    totalUnread,
    loadingRooms,
    loadRooms,
    setActiveRoomId,
    createDirectChat,
    createGroup,
  };
}

// Conversation hook — used inside ChatConversation
export function useMobileChatConversation(roomId, userId) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadMessages = useCallback(async (before) => {
    try {
      let query = supabase
        .from('chat_messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (before) query = query.lt('created_at', before);

      const { data, error } = await query;
      if (error) throw error;

      const sorted = (data || []).reverse();
      setHasMore((data || []).length === PAGE_SIZE);

      if (before) {
        setMessages(prev => [...sorted, ...prev]);
      } else {
        setMessages(sorted);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }, [roomId]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setHasMore(true);
    loadMessages().finally(() => setLoading(false));
  }, [loadMessages]);

  // Mark as read
  useEffect(() => {
    if (!roomId || !userId) return;
    const markRead = async () => {
      await supabase
        .from('chat_room_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('room_id', roomId)
        .eq('user_id', userId);
    };
    markRead();
    const onVisible = () => { if (document.visibilityState === 'visible') markRead(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [roomId, userId]);

  // Realtime messages
  useEffect(() => {
    const ch = supabase
      .channel(`mobile-conv-${roomId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${roomId}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMessages(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        } else if (payload.eventType === 'UPDATE') {
          setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [roomId]);

  // Load more
  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    await loadMessages(messages[0].created_at);
    setLoadingMore(false);
  }, [loadingMore, hasMore, messages, loadMessages]);

  // Send message
  const sendMessage = useCallback(async (content, messageType = 'text', fileData = null, replyTo = null, mentions = [], currentUser = null) => {
    const msgData = {
      room_id: roomId,
      sender_id: userId,
      sender_name: currentUser?.name || '',
      sender_avatar: currentUser?.avatar_url || null,
      content: content || null,
      message_type: messageType,
      reply_to: replyTo?.id || null,
      attachments: [],
      mentions: mentions.length > 0 ? mentions : []
    };

    if (fileData) {
      msgData.file_url = fileData.url;
      msgData.file_name = fileData.name;
      msgData.file_size = fileData.size;
    }

    const { error } = await supabase.from('chat_messages').insert([msgData]);
    if (error) throw error;

    const preview = content?.trim() || (fileData ? `📎 ${fileData.name}` : '');
    await supabase
      .from('chat_rooms')
      .update({
        last_message: preview,
        last_message_at: new Date().toISOString(),
        last_message_by: currentUser?.name || ''
      })
      .eq('id', roomId);
  }, [roomId, userId]);

  // Delete message
  const deleteMessage = useCallback(async (messageId) => {
    await supabase.from('chat_messages')
      .update({ is_deleted: true })
      .eq('id', messageId);
  }, []);

  return {
    messages,
    loading,
    loadingMore,
    hasMore,
    handleLoadMore,
    sendMessage,
    deleteMessage,
  };
}
