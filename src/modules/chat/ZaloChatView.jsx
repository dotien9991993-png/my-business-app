import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';
import ZaloConversationList from './ZaloConversationList';
import ZaloChatWindow from './ZaloChatWindow';

export default function ZaloChatView() {
  const { currentUser, tenant, allUsers } = useApp();

  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const loadingRef = useRef(false);

  // Load conversations
  const loadConversations = useCallback(async () => {
    if (!tenant?.id || loadingRef.current) return;
    loadingRef.current = true;
    try {
      const { data, error } = await supabase
        .from('zalo_conversations')
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (!error) {
        setConversations(data || []);
        // Update active conversation if it exists
        if (activeConv) {
          const updated = (data || []).find(c => c.id === activeConv.id);
          if (updated) setActiveConv(updated);
        }
      }
    } catch (err) {
      console.error('Error loading zalo conversations:', err);
    } finally {
      loadingRef.current = false;
    }
  }, [tenant?.id, activeConv?.id]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Realtime: listen for conversation updates
  useEffect(() => {
    if (!tenant?.id) return;

    const channel = supabase
      .channel('zalo-conversations-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'zalo_conversations',
        filter: `tenant_id=eq.${tenant.id}`
      }, () => {
        loadConversations();
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'zalo_chat_messages',
        filter: `tenant_id=eq.${tenant.id}`
      }, () => {
        // Refresh conversation list when new message arrives
        loadConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id, loadConversations]);

  const handleSelectConversation = (conv) => {
    setActiveConv(conv);
  };

  const handleBack = () => {
    setActiveConv(null);
    loadConversations();
  };

  if (!currentUser || !tenant) return null;

  return (
    <div className="flex flex-1 min-h-0">
      {/* Sidebar - desktop always visible, mobile only when no active conv */}
      <div className={`${activeConv ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 md:border-r md:flex-shrink-0`}>
        <ZaloConversationList
          conversations={conversations}
          currentUser={currentUser}
          selectedId={activeConv?.id}
          onSelect={handleSelectConversation}
          onRefresh={loadConversations}
        />
      </div>

      {/* Chat area - desktop always visible, mobile only when conv selected */}
      <div className={`${activeConv ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0`}>
        <ZaloChatWindow
          conversation={activeConv}
          currentUser={currentUser}
          tenant={tenant}
          allUsers={allUsers}
          onBack={handleBack}
          onConversationUpdated={loadConversations}
        />
      </div>
    </div>
  );
}
