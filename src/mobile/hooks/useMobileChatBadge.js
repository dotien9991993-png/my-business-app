import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

/**
 * Lightweight hook for chat unread badge at MobileApp level.
 * Only counts total unread — doesn't load rooms/members/messages.
 */
export function useMobileChatBadge(userId, tenantId) {
  const [totalUnread, setTotalUnread] = useState(0);

  useEffect(() => {
    if (!userId || !tenantId) return;

    const loadUnread = async () => {
      try {
        // Get all memberships with last_read_at
        const { data: memberships } = await supabase
          .from('chat_room_members')
          .select('room_id, last_read_at')
          .eq('user_id', userId)
          .eq('is_active', true);

        if (!memberships?.length) { setTotalUnread(0); return; }

        let total = 0;
        for (const m of memberships) {
          if (!m.last_read_at) continue;
          const { count } = await supabase
            .from('chat_messages')
            .select('*', { count: 'exact', head: true })
            .eq('room_id', m.room_id)
            .gt('created_at', m.last_read_at)
            .neq('sender_id', userId);
          if (count > 0) total += count;
        }
        setTotalUnread(total);
      } catch (err) {
        console.error('Error loading chat badge:', err);
      }
    };

    loadUnread();

    // Realtime: listen for new messages across all rooms
    const channel = supabase.channel('mobile-chat-badge')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
      }, (payload) => {
        const msg = payload.new;
        if (msg.sender_id !== userId) {
          // Quick increment — will be corrected on next full reload
          setTotalUnread(prev => prev + 1);
        }
      })
      .subscribe();

    // Also listen for read events (user reads a room)
    const readChannel = supabase.channel('mobile-chat-badge-read')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_room_members',
        filter: `user_id=eq.${userId}`,
      }, () => {
        // Reload accurate count after user reads
        loadUnread();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(readChannel);
    };
  }, [userId, tenantId]);

  // Allow external reset (when user enters chat)
  const clearBadge = () => setTotalUnread(0);

  return { totalUnread, clearBadge };
}
