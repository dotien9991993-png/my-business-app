import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { uploadImage } from '../../utils/cloudinaryUpload';
import { getChatImageUrl, getFullImageUrl, isCloudinaryUrl } from '../../utils/cloudinaryUpload';

const PAGE_SIZE = 30;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const EMOJIS = ['👍', '❤️', '😄', '😮', '😢', '✅', '❌'];

const formatPopupTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
};

const formatDateSep = (dateStr) => {
  const d = new Date(dateStr);
  const now = new Date();
  const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const vnDate = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const today = new Date(vnNow.getFullYear(), vnNow.getMonth(), vnNow.getDate());
  const msgDay = new Date(vnDate.getFullYear(), vnDate.getMonth(), vnDate.getDate());
  const diff = Math.floor((today - msgDay) / 86400000);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  return vnDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const getFileUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const { data } = supabase.storage.from('chat-files').getPublicUrl(path);
  return data?.publicUrl || path;
};

const getDisplayImg = (url) => {
  const r = getFileUrl(url);
  return isCloudinaryUrl(r) ? getChatImageUrl(r) : r;
};

export default function ChatPopupWindow({
  room,
  currentUser,
  allUsers,
  onClose,
  onMinimize,
  onExpand,
  isMinimized,
  newMessagePulse,
}) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [reactions, setReactions] = useState({});
  const [hoverMsgId, setHoverMsgId] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // @mention
  const [showMention, setShowMention] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionedUsers, setMentionedUsers] = useState([]);

  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const sendingRef = useRef(false);
  const initialLoadRef = useRef(true);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const isGroup = room.type === 'group';
  const otherMember = !isGroup ? (room.members || []).find(m => m.user_id !== currentUser?.id) : null;
  const otherUser = otherMember ? (allUsers || []).find(u => u.id === otherMember.user_id) : null;
  const roomName = isGroup ? (room.name || 'Nhóm chat') : (otherUser?.name || otherMember?.user_name || 'Người dùng');
  const roomAvatar = isGroup ? null : (otherUser?.avatar_url || otherMember?.user_avatar);
  const activeMembers = useMemo(() =>
    (room.members || []).filter(m => m.is_active !== false && m.user_id !== currentUser?.id),
    [room.members, currentUser?.id]
  );

  // Load messages
  const loadMessages = useCallback(async (before) => {
    try {
      let q = supabase
        .from('chat_messages')
        .select('*')
        .eq('room_id', room.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);
      if (before) q = q.lt('created_at', before);
      const { data, error } = await q;
      if (error) throw error;
      const sorted = (data || []).reverse();
      setHasMore((data || []).length === PAGE_SIZE);
      if (before) {
        setMessages(prev => [...sorted, ...prev]);
      } else {
        setMessages(sorted);
      }
    } catch (err) {
      console.error('Popup: Error loading messages:', err);
    }
  }, [room.id]);

  // Load reactions
  const loadReactions = useCallback(async (msgIds) => {
    if (!msgIds?.length) return;
    try {
      const { data } = await supabase
        .from('chat_message_reactions')
        .select('*')
        .in('message_id', msgIds);
      const grouped = {};
      (data || []).forEach(r => {
        if (!grouped[r.message_id]) grouped[r.message_id] = [];
        grouped[r.message_id].push(r);
      });
      setReactions(prev => ({ ...prev, ...grouped }));
    } catch (_e) {}
  }, []);

  // Initial load
  useEffect(() => {
    initialLoadRef.current = true;
    setLoading(true);
    setMessages([]);
    setHasMore(true);
    setReplyTo(null);
    setReactions({});
    loadMessages().finally(() => setLoading(false));
  }, [loadMessages]);

  // Scroll to bottom on initial
  useEffect(() => {
    if (initialLoadRef.current && messages.length > 0 && !loading) {
      messagesEndRef.current?.scrollIntoView();
      initialLoadRef.current = false;
      loadReactions(messages.map(m => m.id));
    }
  }, [messages, loading, loadReactions]);

  // Mark as read
  useEffect(() => {
    if (!room.id || !currentUser?.id || isMinimized) return;
    supabase
      .from('chat_room_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('room_id', room.id)
      .eq('user_id', currentUser.id)
      .then();
  }, [room.id, currentUser?.id, isMinimized, messages.length]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`popup-chat-${room.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'chat_messages',
        filter: `room_id=eq.${room.id}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const m = payload.new;
          setMessages(prev => {
            if (prev.some(p => p.id === m.id)) return prev;
            return [...prev, m];
          });
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
          loadReactions([m.id]);
        } else if (payload.eventType === 'UPDATE') {
          setMessages(prev => prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p));
        }
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'chat_message_reactions',
        filter: `message_id=in.(${messages.slice(-20).map(m => m.id).join(',')})`
      }, (payload) => {
        const msgId = payload.new?.message_id || payload.old?.message_id;
        if (msgId) loadReactions([msgId]);
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.id, loadReactions]);

  // Load more on scroll top
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el || loading || !hasMore) return;
    if (el.scrollTop < 50) {
      const oldest = messages[0]?.created_at;
      if (oldest) loadMessages(oldest);
    }
  };

  // Send message
  const sendMsg = useCallback(async (content, msgType = 'text', fileData = null) => {
    if (sendingRef.current) return;
    if (!content?.trim() && !fileData) return;
    sendingRef.current = true;
    setSending(true);

    const mentions = mentionedUsers.map(u => u.user_id);
    const msgData = {
      room_id: room.id,
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      sender_avatar: currentUser.avatar_url || null,
      content: content?.trim() || null,
      message_type: msgType,
      reply_to: replyTo?.id || null,
      attachments: [],
      mentions: mentions.length > 0 ? mentions : [],
    };
    if (fileData) {
      msgData.file_url = fileData.url;
      msgData.file_name = fileData.name;
      msgData.file_size = fileData.size;
    }

    setNewMessage('');
    setReplyTo(null);
    setMentionedUsers([]);
    if (inputRef.current) inputRef.current.value = '';

    try {
      const { error } = await supabase.from('chat_messages').insert([msgData]);
      if (error) throw error;
      const preview = content?.trim() || (fileData ? `📎 ${fileData.name}` : '');
      await supabase.from('chat_rooms').update({
        last_message: preview,
        last_message_at: new Date().toISOString(),
        last_message_by: currentUser.name,
      }).eq('id', room.id);

      // Mention notifications
      if (mentions.length > 0) {
        const targets = mentions.includes('all')
          ? activeMembers.map(m => m.user_id)
          : mentions.filter(id => id !== currentUser.id);
        if (targets.length > 0) {
          supabase.from('notifications').insert(targets.map(uid => ({
            tenant_id: room.tenant_id,
            user_id: uid,
            type: 'chat_mention',
            title: `${currentUser.name} nhắc đến bạn`,
            content: content?.trim()?.substring(0, 100) || '',
            link: `/chat/${room.id}`,
            is_read: false,
          }))).then();
        }
      }
      inputRef.current?.focus();
    } catch (err) {
      console.error('Popup: Error sending:', err);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [room, currentUser, replyTo, mentionedUsers, activeMembers]);

  // Handle keydown
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMsg(newMessage);
    }
  };

  // @mention detection
  const handleInputChange = (e) => {
    const val = e.target.value;
    setNewMessage(val);
    const cursor = e.target.selectionStart;
    const before = val.substring(0, cursor);
    const at = before.lastIndexOf('@');
    if (at >= 0) {
      const charBef = at > 0 ? before[at - 1] : ' ';
      if (charBef === ' ' || charBef === '\n' || at === 0) {
        const s = before.substring(at + 1);
        if (!s.includes(' ')) {
          setShowMention(true);
          setMentionSearch(s);
          setMentionStart(at);
          return;
        }
      }
    }
    setShowMention(false);
  };

  const handleSelectMention = (member) => {
    const before = newMessage.substring(0, mentionStart);
    const after = newMessage.substring(inputRef.current?.selectionStart || mentionStart);
    const text = member.isAll ? '@Tất cả ' : `@${member.user_name} `;
    setNewMessage(before + text + after);
    setShowMention(false);
    if (member.isAll) {
      setMentionedUsers([{ user_id: 'all', user_name: 'Tất cả' }]);
    } else if (!mentionedUsers.some(u => u.user_id === member.user_id)) {
      setMentionedUsers(prev => [...prev, member]);
    }
    inputRef.current?.focus();
  };

  const filteredMembers = useMemo(() => {
    const all = [{ user_id: 'all', user_name: 'Tất cả', isAll: true }, ...activeMembers];
    if (!mentionSearch) return all;
    const q = mentionSearch.toLowerCase();
    return all.filter(m => m.user_name.toLowerCase().includes(q));
  }, [activeMembers, mentionSearch]);

  // Image upload
  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return;
    if (file.size > MAX_FILE_SIZE) { alert('File quá lớn (tối đa 10MB)'); return; }
    setUploading(true);
    try {
      const result = await uploadImage(file, 'chat');
      await sendMsg(null, 'image', { url: result.url, name: file.name, size: result.file_size || file.size });
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  // File upload
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) { alert('File quá lớn (tối đa 10MB)'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${room.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('chat-files').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(path);
      await sendMsg(null, 'file', { url: urlData.publicUrl, name: file.name, size: file.size });
    } catch (err) {
      console.error('File upload error:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Toggle reaction
  const toggleReaction = async (msgId, emoji) => {
    try {
      const existing = (reactions[msgId] || []).find(r => r.user_id === currentUser.id && r.emoji === emoji);
      if (existing) {
        await supabase.from('chat_message_reactions').delete().eq('id', existing.id);
        setReactions(prev => ({
          ...prev,
          [msgId]: (prev[msgId] || []).filter(r => r.id !== existing.id)
        }));
      } else {
        const { data } = await supabase.from('chat_message_reactions').insert([{
          message_id: msgId,
          user_id: currentUser.id,
          user_name: currentUser.name,
          emoji,
        }]).select().single();
        if (data) {
          setReactions(prev => ({
            ...prev,
            [msgId]: [...(prev[msgId] || []), data]
          }));
        }
      }
    } catch (_e) {}
    setShowEmojiPicker(null);
  };

  // Build date-grouped messages
  const messageGroups = useMemo(() => {
    const groups = [];
    let lastDate = '';
    messages.forEach(m => {
      const d = new Date(m.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      if (d !== lastDate) {
        groups.push({ type: 'date', date: m.created_at });
        lastDate = d;
      }
      groups.push({ type: 'msg', data: m });
    });
    return groups;
  }, [messages]);

  // Reply messages lookup
  const replyMap = useMemo(() => {
    const map = {};
    messages.forEach(m => { map[m.id] = m; });
    return map;
  }, [messages]);

  // Minimized view
  if (isMinimized) {
    return (
      <div
        onClick={onMinimize}
        className="flex items-center gap-2 px-3 py-2 bg-white border rounded-t-lg shadow-lg cursor-pointer hover:bg-gray-50 transition-colors min-w-[200px] max-w-[260px]"
        style={{ boxShadow: '0 -2px 12px rgba(0,0,0,0.15)' }}
      >
        <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs flex-shrink-0 overflow-hidden relative">
          {roomAvatar ? (
            <img src={roomAvatar} alt="" className="w-7 h-7 rounded-full object-cover" />
          ) : isGroup ? (
            <span className="text-sm">👥</span>
          ) : (
            <span>{roomName.charAt(0).toUpperCase()}</span>
          )}
          {newMessagePulse && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
          )}
        </div>
        <span className="text-sm font-medium text-gray-800 truncate flex-1">{roomName}</span>
        <button onClick={(e) => { e.stopPropagation(); onExpand(); }} className="text-gray-400 hover:text-blue-500 text-xs p-0.5" title="Mở rộng">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
        </button>
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-gray-400 hover:text-red-500 text-xs p-0.5" title="Đóng">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col bg-white border rounded-t-lg shadow-xl"
      style={{ width: 328, height: 455, boxShadow: '0 12px 28px rgba(0,0,0,0.2), 0 2px 4px rgba(0,0,0,0.1)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#1B5E20] text-white rounded-t-lg flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs flex-shrink-0 overflow-hidden">
          {roomAvatar ? (
            <img src={roomAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
          ) : isGroup ? (
            <span className="text-lg">👥</span>
          ) : (
            <span className="text-sm">{roomName.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{roomName}</div>
          {isGroup && (
            <div className="text-[10px] text-green-200">{activeMembers.length + 1} thành viên</div>
          )}
        </div>
        <button onClick={onMinimize} className="text-white/70 hover:text-white p-0.5" title="Thu nhỏ">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
        </button>
        <button onClick={onExpand} className="text-white/70 hover:text-white p-0.5" title="Mở rộng">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
        </button>
        <button onClick={onClose} className="text-white/70 hover:text-white p-0.5" title="Đóng">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Messages area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto bg-gray-50"
        onScroll={handleScroll}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-xs">
            <div className="animate-spin w-5 h-5 border-2 border-green-500 border-t-transparent rounded-full" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-xs">
            Bắt đầu cuộc trò chuyện!
          </div>
        ) : (
          <div className="py-1">
            {hasMore && (
              <button
                onClick={() => loadMessages(messages[0]?.created_at)}
                className="w-full text-center py-1 text-[10px] text-blue-500 hover:underline"
              >
                Xem tin cũ hơn
              </button>
            )}
            {messageGroups.map((item, idx) => {
              if (item.type === 'date') {
                return (
                  <div key={`d-${idx}`} className="flex justify-center my-1.5">
                    <span className="text-[9px] text-gray-400 bg-gray-200 rounded-full px-2 py-0.5">{formatDateSep(item.date)}</span>
                  </div>
                );
              }
              const msg = item.data;
              const isOwn = msg.sender_id === currentUser?.id;
              const isSystem = msg.message_type === 'system';
              const isImage = msg.message_type === 'image';
              const isFile = msg.message_type === 'file';
              const reply = msg.reply_to ? replyMap[msg.reply_to] : null;
              const msgReactions = reactions[msg.id] || [];

              if (msg.is_deleted) {
                return (
                  <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} px-2 mb-0.5`}>
                    <span className="italic text-gray-400 text-[11px]">Tin nhắn đã xóa</span>
                  </div>
                );
              }
              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center mb-1 px-2">
                    <span className="text-[9px] text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{msg.content}</span>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'} px-2 mb-0.5 group relative`}
                  onMouseEnter={() => setHoverMsgId(msg.id)}
                  onMouseLeave={() => { setHoverMsgId(null); setShowEmojiPicker(null); }}
                >
                  <div className={`max-w-[85%] ${isOwn ? 'order-1' : 'order-2'}`}>
                    {/* Sender name (group, not own) */}
                    {isGroup && !isOwn && (
                      <div className="text-[9px] text-gray-500 mb-0.5 ml-1 font-medium">{msg.sender_name}</div>
                    )}

                    {/* Reply ref */}
                    {reply && (
                      <div className={`text-[10px] rounded-t-md px-2 py-0.5 border-l-2 mb-0.5 ${
                        isOwn ? 'bg-green-800/30 border-green-300 text-green-100' : 'bg-gray-200 border-gray-400 text-gray-600'
                      }`}>
                        <span className="font-medium">{reply.sender_name}: </span>
                        <span className="opacity-80 truncate">{reply.content || '📎 File'}</span>
                      </div>
                    )}

                    {/* Bubble */}
                    <div className={`relative rounded-2xl px-2.5 py-1 text-[13px] leading-snug ${
                      isOwn ? 'bg-[#1B5E20] text-white rounded-br-sm' : 'bg-white text-gray-900 rounded-bl-sm border'
                    }`}>
                      {/* Image */}
                      {isImage && msg.file_url && (
                        <img
                          src={getDisplayImg(msg.file_url)}
                          alt=""
                          className="rounded-lg max-w-full max-h-40 cursor-pointer hover:opacity-90 mb-0.5"
                          onClick={() => setPreviewUrl(getFileUrl(msg.file_url))}
                          loading="lazy"
                        />
                      )}

                      {/* File */}
                      {isFile && msg.file_url && (
                        <a href={getFileUrl(msg.file_url)} target="_blank" rel="noopener noreferrer"
                          className={`flex items-center gap-1.5 p-1.5 rounded mb-0.5 ${isOwn ? 'bg-green-800/30 hover:bg-green-800/50' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}
                        >
                          <span>📎</span>
                          <span className="text-xs truncate flex-1">{msg.file_name || 'File'}</span>
                          <span className="text-xs">⬇️</span>
                        </a>
                      )}

                      {/* Text */}
                      {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}

                      {/* Time */}
                      <div className={`text-[9px] mt-0.5 ${isOwn ? 'text-green-200 text-right' : 'text-gray-400'}`}>
                        {msg.is_edited && <span>sửa · </span>}
                        {formatPopupTime(msg.created_at)}
                      </div>
                    </div>

                    {/* Reactions */}
                    {msgReactions.length > 0 && (
                      <div className={`flex flex-wrap gap-0.5 mt-0.5 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        {Object.entries(msgReactions.reduce((g, r) => { g[r.emoji] = (g[r.emoji] || []); g[r.emoji].push(r); return g; }, {})).map(([emoji, users]) => (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(msg.id, emoji)}
                            className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[10px] border ${
                              users.some(u => u.user_id === currentUser.id)
                                ? 'bg-blue-50 border-blue-200 text-blue-700'
                                : 'bg-gray-50 border-gray-200 text-gray-600'
                            }`}
                            title={users.map(u => u.user_name).join(', ')}
                          >
                            {emoji}<span className="text-[8px]">{users.length}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Hover action bar */}
                  {hoverMsgId === msg.id && !isSystem && (
                    <div className={`absolute ${isOwn ? 'left-2' : 'right-2'} top-0 flex items-center gap-0.5 bg-white border rounded-lg shadow-sm px-1 py-0.5 z-10`}>
                      <button onClick={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)} className="hover:bg-gray-100 rounded p-0.5 text-xs" title="React">😀</button>
                      <button onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }} className="hover:bg-gray-100 rounded p-0.5 text-xs" title="Reply">↩️</button>
                    </div>
                  )}

                  {/* Emoji picker */}
                  {showEmojiPicker === msg.id && (
                    <div className={`absolute ${isOwn ? 'left-2' : 'right-2'} -top-8 flex items-center gap-0.5 bg-white border rounded-full shadow-lg px-1.5 py-1 z-20`}>
                      {EMOJIS.map(e => (
                        <button key={e} onClick={() => toggleReaction(msg.id, e)} className="hover:scale-125 transition-transform text-sm px-0.5">{e}</button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Reply bar */}
      {replyTo && (
        <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 border-t text-[10px]">
          <span className="text-gray-500">Trả lời</span>
          <span className="font-medium text-gray-700 truncate flex-1">{replyTo.sender_name}: {replyTo.content || '📎'}</span>
          <button onClick={() => setReplyTo(null)} className="text-gray-400 hover:text-red-500">✕</button>
        </div>
      )}

      {/* @Mention popup */}
      {showMention && filteredMembers.length > 0 && (
        <div className="border-t bg-white max-h-28 overflow-y-auto">
          {filteredMembers.slice(0, 6).map(m => (
            <button
              key={m.user_id}
              onClick={() => handleSelectMention(m)}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-green-50 flex items-center gap-2"
            >
              {m.isAll ? '📢' : '👤'} {m.user_name}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-1 px-2 py-1.5 border-t bg-white flex-shrink-0">
        <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelect} />
        <button
          onClick={() => imageInputRef.current?.click()}
          className="p-1 text-gray-400 hover:text-green-600 flex-shrink-0"
          title="Gửi ảnh"
          disabled={uploading}
        >🖼️</button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-1 text-gray-400 hover:text-green-600 flex-shrink-0"
          title="Đính kèm file"
          disabled={uploading}
        >📎</button>
        <textarea
          ref={inputRef}
          value={newMessage}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Nhập tin nhắn..."
          className="flex-1 resize-none text-[13px] py-1.5 px-2.5 bg-gray-100 rounded-full max-h-16 focus:outline-none focus:ring-1 focus:ring-green-500"
          rows={1}
          disabled={sending || uploading}
        />
        <button
          onClick={() => sendMsg(newMessage)}
          disabled={(!newMessage.trim() && !uploading) || sending}
          className="p-1 text-green-600 hover:text-green-700 disabled:text-gray-300 flex-shrink-0"
          title="Gửi"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
        </button>
      </div>

      {uploading && (
        <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-30 rounded-t-lg">
          <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" />
        </div>
      )}

      {/* Image preview */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/80 z-[10001] flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          <button onClick={() => setPreviewUrl(null)} className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300">&times;</button>
          <img src={previewUrl} alt="" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
