import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';
import { getZaloConfig, fullZaloSync, pullNewMessages } from '../../utils/zaloOA';
import ZaloConversationList from './ZaloConversationList';
import ZaloChatWindow from './ZaloChatWindow';

export default function ZaloChatView() {
  const { currentUser, tenant, allUsers, navigateTo } = useApp();

  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [zaloConfig, setZaloConfig] = useState(undefined); // undefined = loading, null = not configured
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ text: '', percent: 0 });
  const [syncResult, setSyncResult] = useState(null);
  const loadingRef = useRef(false);
  const activeConvRef = useRef(null);
  activeConvRef.current = activeConv;

  // Load Zalo config
  useEffect(() => {
    if (!tenant?.id) return;
    (async () => {
      const config = await getZaloConfig(tenant.id);
      setZaloConfig(config);
    })();
  }, [tenant?.id]);

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
        const currentActive = activeConvRef.current;
        if (currentActive) {
          const updated = (data || []).find(c => c.id === currentActive.id);
          if (updated) setActiveConv(updated);
        }
      }
    } catch (err) {
      console.error('Error loading zalo conversations:', err);
    } finally {
      loadingRef.current = false;
    }
  }, [tenant?.id]);

  useEffect(() => {
    if (zaloConfig !== undefined) {
      loadConversations();
    }
  }, [loadConversations, zaloConfig]);

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
        loadConversations();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id, loadConversations]);

  // Auto-poll tin mới mỗi 30 giây cho conversation đang mở
  useEffect(() => {
    if (!tenant?.id || !zaloConfig) return;

    const interval = setInterval(async () => {
      const currentActive = activeConvRef.current;
      if (currentActive?.zalo_user_id) {
        try {
          await pullNewMessages(tenant.id, currentActive.zalo_user_id, currentActive.id);
        } catch (err) {
          // Bỏ qua lỗi poll
        }
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [tenant?.id, zaloConfig]);

  // Full sync
  const handleFullSync = async () => {
    if (!tenant?.id || syncing) return;
    setSyncing(true);
    setSyncResult(null);
    setSyncProgress({ text: 'Bắt đầu đồng bộ...', percent: 0 });

    try {
      const result = await fullZaloSync(tenant.id, (text, percent) => {
        setSyncProgress({ text, percent: percent || 0 });
      });
      setSyncResult(result);
      await loadConversations();
    } catch (err) {
      console.error('Sync error:', err);
      setSyncProgress({ text: `Lỗi: ${err.message}`, percent: 0 });
      setSyncResult({ error: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const handleSelectConversation = (conv) => {
    setActiveConv(conv);
  };

  const handleBack = () => {
    setActiveConv(null);
    loadConversations();
  };

  if (!currentUser || !tenant) return null;

  // Loading config
  if (zaloConfig === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm">Đang kiểm tra cấu hình Zalo OA...</p>
        </div>
      </div>
    );
  }

  // Not configured
  if (!zaloConfig) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="text-6xl mb-4">📱</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Chưa cấu hình Zalo OA</h3>
          <p className="text-sm text-gray-500 mb-4">
            Vui lòng nhập App ID, Secret Key, OA ID và Refresh Token trong phần Cài đặt {'->'} Zalo OA để sử dụng tính năng chat.
          </p>
          <button
            onClick={() => navigateTo('settings', 'zalo')}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
          >
            Đi đến Cài đặt Zalo OA
          </button>
        </div>
      </div>
    );
  }

  // Syncing overlay
  if (syncing) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg border p-6 max-w-md w-full mx-4">
          <div className="text-center mb-4">
            <div className="text-4xl mb-2">🔄</div>
            <h3 className="text-lg font-semibold text-gray-700">Đang đồng bộ Zalo OA...</h3>
          </div>

          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{syncProgress.text}</span>
              <span>{syncProgress.percent}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5">
              <div
                className="bg-blue-500 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${syncProgress.percent}%` }}
              />
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center">
            Vui lòng không đóng trang trong quá trình đồng bộ
          </p>
        </div>
      </div>
    );
  }

  // No conversations yet → prompt sync
  if (conversations.length === 0 && !syncing) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="text-6xl mb-4">💬</div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Chưa có hội thoại nào</h3>
          <p className="text-sm text-gray-500 mb-4">
            Bấm nút bên dưới để đồng bộ hội thoại từ Zalo OA. Hệ thống sẽ tải danh sách người theo dõi và tin nhắn cũ.
          </p>
          <button
            onClick={handleFullSync}
            className="px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium"
          >
            🔄 Đồng bộ hội thoại từ Zalo
          </button>

          {syncResult?.error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">
              Lỗi: {syncResult.error}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Sidebar - desktop always visible, mobile only when no active conv */}
      <div className={`${activeConv ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 md:border-r md:flex-shrink-0`}>
        <ZaloConversationList
          conversations={conversations}
          currentUser={currentUser}
          selectedId={activeConv?.id}
          onSelect={handleSelectConversation}
          onRefresh={handleFullSync}
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
