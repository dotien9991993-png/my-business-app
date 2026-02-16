import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import ChatMessage from './ChatMessage';

const PAGE_SIZE = 50;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_FILE_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword'
];

// Date separator
const formatDateSeparator = (dateStr) => {
  const d = new Date(dateStr);
  const now = new Date();
  const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const vnDate = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));

  const today = new Date(vnNow.getFullYear(), vnNow.getMonth(), vnNow.getDate());
  const msgDay = new Date(vnDate.getFullYear(), vnDate.getMonth(), vnDate.getDate());
  const diffDays = Math.floor((today - msgDay) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hôm nay';
  if (diffDays === 1) return 'Hôm qua';
  return vnDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// Group messages by date
const getMessageDate = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }); // YYYY-MM-DD
};

export default function ChatWindow({
  room,
  currentUser,
  allUsers,
  onBack,
  onRoomUpdated
}) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [replyTo, setReplyTo] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const initialLoadRef = useRef(true);
  const sendingRef = useRef(false);

  // Room display info
  const isGroup = room.type === 'group';
  const otherMember = !isGroup
    ? (room.members || []).find(m => m.user_id !== currentUser?.id)
    : null;
  const otherUser = otherMember
    ? (allUsers || []).find(u => u.id === otherMember.user_id)
    : null;
  const roomName = isGroup ? (room.name || 'Nhóm chat') : (otherUser?.name || otherMember?.user_name || 'Người dùng');
  const roomAvatar = isGroup ? null : (otherUser?.avatar_url || otherMember?.user_avatar);

  // Load messages
  const loadMessages = useCallback(async (before) => {
    try {
      let query = supabase
        .from('chat_messages')
        .select('*')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (before) {
        query = query.lt('created_at', before);
      }

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
  }, [room.id]);

  // Initial load
  useEffect(() => {
    initialLoadRef.current = true;
    setLoading(true);
    setMessages([]);
    setHasMore(true);
    loadMessages().finally(() => setLoading(false));
  }, [loadMessages]);

  // Scroll to bottom on initial load and new messages
  useEffect(() => {
    if (initialLoadRef.current && messages.length > 0 && !loading) {
      messagesEndRef.current?.scrollIntoView();
      initialLoadRef.current = false;
    }
  }, [messages, loading]);

  // Mark as read
  useEffect(() => {
    if (!room.id || !currentUser?.id) return;
    const markRead = async () => {
      try {
        await supabase
          .from('chat_room_members')
          .update({ last_read_at: new Date().toISOString() })
          .eq('room_id', room.id)
          .eq('user_id', currentUser.id);
      } catch (_e) { /* ignore */ }
    };
    markRead();
    // Mark read on visibility change too
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') markRead();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [room.id, currentUser?.id]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${room.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${room.id}`
      }, (payload) => {
        const newMsg = payload.new;
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        // Auto-scroll if near bottom
        const container = messagesContainerRef.current;
        if (container) {
          const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
          if (isNearBottom || newMsg.sender_id === currentUser?.id) {
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
          }
        }
        // Mark as read
        if (newMsg.sender_id !== currentUser?.id) {
          supabase
            .from('chat_room_members')
            .update({ last_read_at: new Date().toISOString() })
            .eq('room_id', room.id)
            .eq('user_id', currentUser?.id)
            .then();
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [room.id, currentUser?.id]);

  // Load more (scroll up)
  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    const container = messagesContainerRef.current;
    const prevHeight = container?.scrollHeight || 0;
    await loadMessages(messages[0].created_at);
    setLoadingMore(false);
    // Maintain scroll position
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight - prevHeight;
      });
    }
  };

  // Send message (with double-submit guard)
  const sendMessage = useCallback(async (content, messageType = 'text', fileData = null) => {
    if (sendingRef.current) return;
    if (!content?.trim() && !fileData) return;

    sendingRef.current = true;
    setSending(true);

    const msgData = {
      room_id: room.id,
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      sender_avatar: currentUser.avatar_url || null,
      content: content?.trim() || null,
      message_type: messageType,
      reply_to: replyTo?.id || null
    };

    if (fileData) {
      msgData.file_url = fileData.url;
      msgData.file_name = fileData.name;
      msgData.file_size = fileData.size;
    }

    // Clear input immediately to prevent double-send
    setNewMessage('');
    setReplyTo(null);

    try {
      const { error } = await supabase.from('chat_messages').insert([msgData]);
      if (error) throw error;

      // Update room's last message
      await supabase
        .from('chat_rooms')
        .update({
          last_message: content?.trim() || (fileData ? `📎 ${fileData.name}` : ''),
          last_message_at: new Date().toISOString(),
          last_message_by: currentUser.name
        })
        .eq('id', room.id);

      inputRef.current?.focus();
      onRoomUpdated?.();
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Lỗi gửi tin nhắn!');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [room.id, currentUser, replyTo, onRoomUpdated]);

  // Handle Enter key
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!sendingRef.current) sendMessage(newMessage);
    }
  };

  // Upload file
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > MAX_FILE_SIZE) {
      alert('File quá lớn! Giới hạn 10MB.');
      return;
    }
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      alert('Loại file không được hỗ trợ!');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const filePath = `${room.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from('chat-files')
        .upload(filePath, file);

      if (uploadErr) throw uploadErr;

      const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
      await sendMessage(
        null,
        isImage ? 'image' : 'file',
        { url: filePath, name: file.name, size: file.size }
      );
    } catch (err) {
      console.error('Error uploading file:', err);
      alert('Lỗi upload file!');
    } finally {
      setUploading(false);
    }
  };

  // Leave room
  const handleLeaveRoom = async () => {
    if (!confirm('Bạn có chắc muốn rời khỏi nhóm này?')) return;
    try {
      await supabase
        .from('chat_room_members')
        .update({ is_active: false })
        .eq('room_id', room.id)
        .eq('user_id', currentUser.id);

      // System message
      await supabase.from('chat_messages').insert([{
        room_id: room.id,
        sender_id: currentUser.id,
        sender_name: currentUser.name,
        content: `${currentUser.name} đã rời nhóm`,
        message_type: 'system'
      }]);

      onRoomUpdated?.();
      onBack();
    } catch (err) {
      console.error('Error leaving room:', err);
    }
  };

  // Delete room (for direct chats)
  const handleDeleteChat = async () => {
    if (!confirm('Xóa cuộc trò chuyện này?')) return;
    try {
      await supabase
        .from('chat_room_members')
        .update({ is_active: false })
        .eq('room_id', room.id)
        .eq('user_id', currentUser.id);
      onRoomUpdated?.();
      onBack();
    } catch (err) {
      console.error('Error deleting chat:', err);
    }
  };

  // Build reply message map
  const replyMessages = {};
  messages.forEach(m => { replyMessages[m.id] = m; });

  // Group by date
  const messageGroups = [];
  let lastDate = null;
  messages.forEach(msg => {
    const msgDate = getMessageDate(msg.created_at);
    if (msgDate !== lastDate) {
      messageGroups.push({ type: 'date', date: msg.created_at });
      lastDate = msgDate;
    }
    messageGroups.push({ type: 'message', data: msg });
  });

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-[#1B5E20] text-white rounded-t-xl">
        <button onClick={onBack} className="text-white/80 hover:text-white p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="w-8 h-8 rounded-full bg-green-300 flex items-center justify-center text-green-900 font-bold text-xs overflow-hidden flex-shrink-0">
          {isGroup ? (
            <span className="text-sm">👥</span>
          ) : roomAvatar ? (
            <img src={roomAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : (
            roomName.charAt(0).toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm truncate">{roomName}</div>
          {isGroup && (
            <div className="text-[10px] text-green-200">
              {(room.members || []).filter(m => m.is_active !== false).length} thành viên
            </div>
          )}
        </div>
        {/* Menu */}
        <div className="relative">
          <button onClick={() => setShowMenu(!showMenu)} className="text-white/80 hover:text-white p-1">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
              <div className="absolute right-0 top-8 bg-white rounded-lg shadow-xl border z-20 py-1 w-44">
                {isGroup ? (
                  <>
                    <div className="px-3 py-2 text-xs text-gray-500 font-medium border-b">
                      Thành viên ({(room.members || []).filter(m => m.is_active !== false).length})
                    </div>
                    {(room.members || []).filter(m => m.is_active !== false).slice(0, 8).map(m => (
                      <div key={m.id} className="px-3 py-1.5 text-xs text-gray-700 flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-[10px] text-green-700 font-bold">
                          {(m.user_name || '?').charAt(0)}
                        </span>
                        {m.user_name}
                        {m.role === 'admin' && <span className="text-[9px] bg-yellow-100 text-yellow-700 px-1 rounded">Admin</span>}
                      </div>
                    ))}
                    <div className="border-t mt-1">
                      <button onClick={handleLeaveRoom} className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50">
                        🚪 Rời nhóm
                      </button>
                    </div>
                  </>
                ) : (
                  <button onClick={handleDeleteChat} className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50">
                    🗑️ Xóa cuộc trò chuyện
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto bg-white"
        onScroll={(e) => {
          if (e.target.scrollTop < 50 && hasMore && !loadingMore) {
            handleLoadMore();
          }
        }}
      >
        {loadingMore && (
          <div className="text-center py-2">
            <span className="text-xs text-gray-400">Đang tải...</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin text-2xl">⏳</div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <span className="text-4xl mb-2">💬</span>
            <span className="text-sm">Bắt đầu cuộc trò chuyện!</span>
          </div>
        ) : (
          <div className="py-2">
            {messageGroups.map((item, idx) => {
              if (item.type === 'date') {
                return (
                  <div key={`date-${idx}`} className="flex justify-center my-3">
                    <span className="text-[10px] text-gray-400 bg-gray-100 rounded-full px-3 py-0.5">
                      {formatDateSeparator(item.date)}
                    </span>
                  </div>
                );
              }
              const msg = item.data;
              return (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  isOwn={msg.sender_id === currentUser?.id}
                  isGroup={isGroup}
                  onReply={setReplyTo}
                  replyMessage={msg.reply_to ? replyMessages[msg.reply_to] : null}
                />
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Reply bar */}
      {replyTo && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-t text-xs">
          <div className="flex-1 min-w-0">
            <span className="text-gray-500">Trả lời </span>
            <span className="font-medium text-gray-700">{replyTo.sender_name}</span>
            <p className="text-gray-400 truncate">{replyTo.content || '📎 File'}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-1.5 px-2 py-2 border-t bg-gray-50 rounded-b-xl">
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_FILE_TYPES.join(',')}
          onChange={handleFileUpload}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 flex-shrink-0"
          title="Đính kèm file"
        >
          {uploading ? (
            <span className="animate-spin inline-block">⏳</span>
          ) : (
            '📎'
          )}
        </button>
        <textarea
          ref={inputRef}
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhập tin nhắn..."
          rows={1}
          className="flex-1 px-3 py-1.5 bg-white border rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500 max-h-24"
          style={{ minHeight: '36px' }}
        />
        <button
          onClick={() => sendMessage(newMessage)}
          disabled={sending || (!newMessage.trim() && !uploading)}
          className="p-2 text-green-600 hover:text-green-800 disabled:text-gray-300 flex-shrink-0"
          title="Gửi"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
