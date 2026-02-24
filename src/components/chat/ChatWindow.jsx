import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { uploadImage, uploadImages } from '../../utils/cloudinaryUpload';
import ChatMessage from './ChatMessage';
import AttachmentPicker from './AttachmentPicker';
import MessageContextMenu from './MessageContextMenu';
import MentionPopup from './MentionPopup';
import ReactionPicker from './ReactionPicker';

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

const TYPE_ICONS = {
  order: '📦', task: '🎬', product: '📦', customer: '👥',
  technical_job: '🔧', warranty: '🛡️'
};

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

const getMessageDate = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
};

export default function ChatWindow({
  room,
  currentUser,
  allUsers,
  onBack,
  onRoomUpdated,
  onNavigate
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

  // Attachment states
  const [showAttachmentPicker, setShowAttachmentPicker] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState([]);

  // Pin states
  const [pinnedMessages, setPinnedMessages] = useState([]);

  // Image upload states
  const [pendingImages, setPendingImages] = useState([]); // [{ file, preview, originalSize }]
  const [uploadProgress, setUploadProgress] = useState(null); // "1/3"

  // Context menu states
  const [contextMenu, setContextMenu] = useState(null); // { message, x, y }

  // @Mention states
  const [showMentionPopup, setShowMentionPopup] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionedUsers, setMentionedUsers] = useState([]);
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);

  // Reaction states
  const [reactions, setReactions] = useState({}); // { messageId: [{ emoji, user_id, user_name }] }
  const [reactionPicker, setReactionPicker] = useState(null); // { messageId, x, y }

  // Read receipt states
  const [memberReadStatus, setMemberReadStatus] = useState({}); // { user_id: last_read_at }

  // Search states
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const initialLoadRef = useRef(true);
  const sendingRef = useRef(false);
  const searchTimerRef = useRef(null);

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

  // Active room members (for @mention)
  const activeMembers = useMemo(() =>
    (room.members || []).filter(m => m.is_active !== false && m.user_id !== currentUser?.id),
    [room.members, currentUser?.id]
  );

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

  // Load pinned messages
  const loadPinnedMessages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('room_id', room.id)
        .eq('is_pinned', true)
        .order('pinned_at', { ascending: false })
        .limit(5);

      if (!error) setPinnedMessages(data || []);
    } catch (_e) { /* ignore */ }
  }, [room.id]);

  // Load reactions for messages
  const loadReactions = useCallback(async (messageIds) => {
    if (!messageIds?.length) return;
    try {
      const { data, error } = await supabase
        .from('chat_message_reactions')
        .select('*')
        .in('message_id', messageIds);

      if (error) throw error;
      const grouped = {};
      (data || []).forEach(r => {
        if (!grouped[r.message_id]) grouped[r.message_id] = [];
        grouped[r.message_id].push(r);
      });
      setReactions(prev => ({ ...prev, ...grouped }));
    } catch (_e) { /* ignore */ }
  }, []);

  // Load member read status
  const loadMemberReadStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('chat_room_members')
        .select('user_id, user_name, last_read_at')
        .eq('room_id', room.id)
        .eq('is_active', true);

      if (error) throw error;
      const statusMap = {};
      (data || []).forEach(m => {
        if (m.user_id !== currentUser?.id) {
          statusMap[m.user_id] = { last_read_at: m.last_read_at, user_name: m.user_name };
        }
      });
      setMemberReadStatus(statusMap);
    } catch (_e) { /* ignore */ }
  }, [room.id, currentUser?.id]);

  // Initial load
  useEffect(() => {
    initialLoadRef.current = true;
    setLoading(true);
    setMessages([]);
    setHasMore(true);
    setPendingAttachments([]);
    setReplyTo(null);
    setReactions({});
    setSearchMode(false);
    setSearchQuery('');
    setMentionedUsers([]);
    loadMessages().finally(() => setLoading(false));
    loadPinnedMessages();
    loadMemberReadStatus();
  }, [loadMessages, loadPinnedMessages, loadMemberReadStatus]);

  // Scroll to bottom on initial load + load reactions
  useEffect(() => {
    if (initialLoadRef.current && messages.length > 0 && !loading) {
      messagesEndRef.current?.scrollIntoView();
      initialLoadRef.current = false;
      // Load reactions for initial messages
      const msgIds = messages.map(m => m.id);
      loadReactions(msgIds);
    }
  }, [messages, loading, loadReactions]);

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
        event: '*',
        schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${room.id}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const newMsg = payload.new;
          setMessages(prev => {
            if (prev.some(m => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
          const container = messagesContainerRef.current;
          if (container) {
            const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
            if (isNearBottom || newMsg.sender_id === currentUser?.id) {
              setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
            }
          }
          if (newMsg.sender_id !== currentUser?.id) {
            supabase
              .from('chat_room_members')
              .update({ last_read_at: new Date().toISOString() })
              .eq('room_id', room.id)
              .eq('user_id', currentUser?.id)
              .then();
          }
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new;
          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
          // Refresh pinned if pin state changed
          if (updated.is_pinned !== payload.old?.is_pinned) {
            loadPinnedMessages();
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [room.id, currentUser?.id, loadPinnedMessages]);

  // Realtime subscription for reactions
  useEffect(() => {
    const channel = supabase
      .channel(`chat-reactions-${room.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'chat_message_reactions'
      }, (payload) => {
        const record = payload.new || payload.old;
        if (!record?.message_id) return;
        // Check if this reaction belongs to a message in current room
        const msgExists = messages.some(m => m.id === record.message_id);
        if (!msgExists) return;

        // Reload reactions for this message
        supabase
          .from('chat_message_reactions')
          .select('*')
          .eq('message_id', record.message_id)
          .then(({ data }) => {
            setReactions(prev => ({ ...prev, [record.message_id]: data || [] }));
          });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [room.id, messages]);

  // Realtime subscription for member read status
  useEffect(() => {
    const channel = supabase
      .channel(`chat-read-${room.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_room_members',
        filter: `room_id=eq.${room.id}`
      }, (payload) => {
        const updated = payload.new;
        if (updated.user_id !== currentUser?.id && updated.is_active) {
          setMemberReadStatus(prev => ({
            ...prev,
            [updated.user_id]: { last_read_at: updated.last_read_at, user_name: updated.user_name }
          }));
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
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight - prevHeight;
      });
    }
  };

  // Send message (with double-submit guard)
  const sendMessage = useCallback(async (content, messageType = 'text', fileData = null) => {
    if (sendingRef.current) return;
    if (!content?.trim() && !fileData && pendingAttachments.length === 0) return;

    sendingRef.current = true;
    setSending(true);

    // Capture mentions before clearing
    const currentMentions = mentionedUsers.map(u => u.user_id);

    const msgData = {
      room_id: room.id,
      sender_id: currentUser.id,
      sender_name: currentUser.name,
      sender_avatar: currentUser.avatar_url || null,
      content: content?.trim() || null,
      message_type: messageType,
      reply_to: replyTo?.id || null,
      attachments: pendingAttachments.length > 0 ? pendingAttachments : [],
      mentions: currentMentions.length > 0 ? currentMentions : []
    };

    if (fileData) {
      msgData.file_url = fileData.url;
      msgData.file_name = fileData.name;
      msgData.file_size = fileData.size;
    }

    // Clear input immediately
    setNewMessage('');
    setReplyTo(null);
    setPendingAttachments([]);
    setMentionedUsers([]);

    try {
      const { error } = await supabase.from('chat_messages').insert([msgData]);
      if (error) throw error;

      const lastMsgPreview = content?.trim()
        || (fileData ? `📎 ${fileData.name}` : '')
        || (pendingAttachments.length > 0 ? `${TYPE_ICONS[pendingAttachments[0].type] || '📎'} ${pendingAttachments[0].title}` : '');

      await supabase
        .from('chat_rooms')
        .update({
          last_message: lastMsgPreview,
          last_message_at: new Date().toISOString(),
          last_message_by: currentUser.name
        })
        .eq('id', room.id);

      // Send notifications for mentioned users
      if (currentMentions.length > 0) {
        const mentionTargets = currentMentions.includes('all')
          ? activeMembers.map(m => m.user_id)
          : currentMentions.filter(id => id !== currentUser.id);

        const notifications = mentionTargets.map(userId => ({
          tenant_id: room.tenant_id,
          user_id: userId,
          type: 'chat_mention',
          title: `${currentUser.name} nhắc đến bạn`,
          content: content?.trim()?.substring(0, 100) || 'trong một tin nhắn',
          link: `/chat/${room.id}`,
          is_read: false
        }));

        if (notifications.length > 0) {
          supabase.from('notifications').insert(notifications).then();
        }
      }

      inputRef.current?.focus();
      onRoomUpdated?.();
    } catch (err) {
      console.error('Error sending message:', err);
      alert('Lỗi gửi tin nhắn!');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }, [room.id, room.tenant_id, currentUser, replyTo, pendingAttachments, mentionedUsers, activeMembers, onRoomUpdated]);

  // Handle input change (with @mention detection)
  const handleInputChange = (e) => {
    const value = e.target.value;
    setNewMessage(value);

    // Detect "@" for mention popup
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.substring(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');

    if (atIndex >= 0) {
      const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
      if (charBefore === ' ' || charBefore === '\n' || atIndex === 0) {
        const search = textBeforeCursor.substring(atIndex + 1);
        if (!search.includes(' ')) {
          setShowMentionPopup(true);
          setMentionSearch(search);
          setMentionStartIndex(atIndex);
          return;
        }
      }
    }
    setShowMentionPopup(false);
  };

  // Handle mention selection
  const handleSelectMention = (member) => {
    const before = newMessage.substring(0, mentionStartIndex);
    const after = newMessage.substring(inputRef.current?.selectionStart || mentionStartIndex);
    const mentionText = member.isAll ? '@Tat ca ' : `@${member.user_name} `;
    setNewMessage(before + mentionText + after);
    setShowMentionPopup(false);
    setMentionSearch('');

    // Track mentioned user
    if (member.isAll) {
      setMentionedUsers([{ user_id: 'all', user_name: 'Tat ca' }]);
    } else {
      setMentionedUsers(prev => {
        if (prev.some(u => u.user_id === member.user_id)) return prev;
        return [...prev, { user_id: member.user_id, user_name: member.user_name }];
      });
    }

    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Handle Enter key
  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && showMentionPopup) {
      setShowMentionPopup(false);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (showMentionPopup) {
        setShowMentionPopup(false);
        return;
      }
      if (!sendingRef.current) sendMessage(newMessage);
    }
  };

  // Upload non-image file (keep Supabase storage)
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

    // If image, add to pending images instead
    if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
      addPendingImages([file]);
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

      await sendMessage(
        null,
        'file',
        { url: filePath, name: file.name, size: file.size }
      );
    } catch (err) {
      console.error('Error uploading file:', err);
      alert('Lỗi upload file!');
    } finally {
      setUploading(false);
    }
  };

  // Handle image selection (multiple)
  const handleImageSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    e.target.value = '';
    addPendingImages(files);
  };

  const addPendingImages = (files) => {
    const imageFiles = files.filter(f => ALLOWED_IMAGE_TYPES.includes(f.type));
    if (imageFiles.length === 0) return;

    const maxTotal = 10;
    const remaining = maxTotal - pendingImages.length;
    if (remaining <= 0) { alert('Tối đa 10 ảnh!'); return; }

    const toAdd = imageFiles.slice(0, remaining).map(file => ({
      file,
      preview: URL.createObjectURL(file),
      originalSize: file.size
    }));
    setPendingImages(prev => [...prev, ...toAdd]);
    inputRef.current?.focus();
  };

  const removePendingImage = (index) => {
    setPendingImages(prev => {
      const removed = prev[index];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  // Send images via Cloudinary
  const sendImagesMessage = async () => {
    if (pendingImages.length === 0) return;
    if (sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);
    setUploading(true);

    const imagesToSend = [...pendingImages];
    const caption = newMessage.trim();
    setNewMessage('');
    setPendingImages([]);

    try {
      if (imagesToSend.length === 1) {
        // Single image: backward compatible format
        setUploadProgress('1/1');
        const result = await uploadImage(imagesToSend[0].file, 'chat');
        setUploadProgress(null);

        const msgData = {
          room_id: room.id,
          sender_id: currentUser.id,
          sender_name: currentUser.name,
          sender_avatar: currentUser.avatar_url || null,
          content: caption || null,
          message_type: 'image',
          file_url: result.url,
          file_name: imagesToSend[0].file.name,
          file_size: result.file_size,
          reply_to: replyTo?.id || null,
          attachments: pendingAttachments.length > 0 ? pendingAttachments : []
        };

        const { error } = await supabase.from('chat_messages').insert([msgData]);
        if (error) throw error;

        await supabase.from('chat_rooms').update({
          last_message: caption || '🖼️ Ảnh',
          last_message_at: new Date().toISOString(),
          last_message_by: currentUser.name
        }).eq('id', room.id);
      } else {
        // Multiple images: use attachments array
        const imageAttachments = [];
        for (let i = 0; i < imagesToSend.length; i++) {
          setUploadProgress(`${i + 1}/${imagesToSend.length}`);
          const result = await uploadImage(imagesToSend[i].file, 'chat');
          imageAttachments.push({
            type: 'image',
            url: result.url,
            width: result.width,
            height: result.height
          });
        }
        setUploadProgress(null);

        const allAttachments = [...imageAttachments, ...pendingAttachments];

        const msgData = {
          room_id: room.id,
          sender_id: currentUser.id,
          sender_name: currentUser.name,
          sender_avatar: currentUser.avatar_url || null,
          content: caption || null,
          message_type: 'text',
          reply_to: replyTo?.id || null,
          attachments: allAttachments
        };

        const { error } = await supabase.from('chat_messages').insert([msgData]);
        if (error) throw error;

        await supabase.from('chat_rooms').update({
          last_message: caption || `🖼️ ${imagesToSend.length} ảnh`,
          last_message_at: new Date().toISOString(),
          last_message_by: currentUser.name
        }).eq('id', room.id);
      }

      setReplyTo(null);
      setPendingAttachments([]);
      // Cleanup preview URLs
      imagesToSend.forEach(img => { if (img.preview) URL.revokeObjectURL(img.preview); });
      inputRef.current?.focus();
      onRoomUpdated?.();
    } catch (err) {
      console.error('Error sending images:', err);
      alert('Lỗi gửi ảnh: ' + (err.message || 'Không xác định'));
      setUploadProgress(null);
    } finally {
      sendingRef.current = false;
      setSending(false);
      setUploading(false);
    }
  };

  // Attachment picker handlers
  const handleAttachmentSelect = (attachment) => {
    setPendingAttachments(prev => [...prev, attachment]);
    setShowAttachmentPicker(false);
    inputRef.current?.focus();
  };

  const removePendingAttachment = (index) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  };

  // Context menu handlers
  const handleContextMenu = useCallback((message, x, y) => {
    setContextMenu({ message, x, y });
  }, []);

  const handlePin = async (message) => {
    try {
      const newPinned = !message.is_pinned;
      await supabase
        .from('chat_messages')
        .update({
          is_pinned: newPinned,
          pinned_by: newPinned ? currentUser.name : null,
          pinned_at: newPinned ? new Date().toISOString() : null
        })
        .eq('id', message.id);

      setMessages(prev => prev.map(m =>
        m.id === message.id ? { ...m, is_pinned: newPinned, pinned_by: newPinned ? currentUser.name : null } : m
      ));
      loadPinnedMessages();
    } catch (err) {
      console.error('Error pinning message:', err);
    }
  };

  const handleCopy = (message) => {
    if (message.content) {
      navigator.clipboard.writeText(message.content).catch(() => {});
    }
  };

  const handleDelete = async (message) => {
    if (!confirm('Xóa tin nhắn này?')) return;
    try {
      await supabase
        .from('chat_messages')
        .update({ is_deleted: true })
        .eq('id', message.id);

      setMessages(prev => prev.map(m =>
        m.id === message.id ? { ...m, is_deleted: true } : m
      ));
    } catch (err) {
      console.error('Error deleting message:', err);
    }
  };

  // Scroll to pinned message
  const scrollToMessage = (msgId) => {
    const el = messagesContainerRef.current?.querySelector(`[data-msg-id="${msgId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('bg-yellow-100/50');
      setTimeout(() => el.classList.remove('bg-yellow-100/50'), 2000);
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

  // Toggle reaction
  const toggleReaction = useCallback(async (messageId, emoji) => {
    try {
      const existing = (reactions[messageId] || []).find(
        r => r.user_id === currentUser?.id && r.emoji === emoji
      );

      if (existing) {
        await supabase.from('chat_message_reactions').delete().eq('id', existing.id);
        setReactions(prev => ({
          ...prev,
          [messageId]: (prev[messageId] || []).filter(r => r.id !== existing.id)
        }));
      } else {
        const { data, error } = await supabase
          .from('chat_message_reactions')
          .insert([{
            message_id: messageId,
            user_id: currentUser.id,
            user_name: currentUser.name,
            emoji
          }])
          .select()
          .single();

        if (error) throw error;
        setReactions(prev => ({
          ...prev,
          [messageId]: [...(prev[messageId] || []), data]
        }));
      }
    } catch (err) {
      console.error('Error toggling reaction:', err);
    }
  }, [reactions, currentUser]);

  // Show reaction picker from context menu
  const handleShowReactionPicker = useCallback((message, x, y) => {
    setReactionPicker({ messageId: message.id, x, y });
  }, []);

  // Search messages
  const handleSearch = useCallback(async (query) => {
    if (!query?.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchLoading(true);
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id, content, sender_name, created_at')
        .eq('room_id', room.id)
        .ilike('content', `%${query.trim()}%`)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setSearchResults(data || []);
    } catch (err) {
      console.error('Error searching messages:', err);
    } finally {
      setSearchLoading(false);
    }
  }, [room.id]);

  // Debounced search
  const handleSearchInput = (value) => {
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => handleSearch(value), 300);
  };

  // Compute read-by info for messages
  const getReadBy = useCallback((message) => {
    if (message.sender_id !== currentUser?.id) return [];
    const readers = [];
    Object.entries(memberReadStatus).forEach(([userId, info]) => {
      if (info.last_read_at && new Date(info.last_read_at) >= new Date(message.created_at)) {
        readers.push({ user_id: userId, user_name: info.user_name });
      }
    });
    return readers;
  }, [memberReadStatus, currentUser?.id]);

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

  const canSend = newMessage.trim() || pendingAttachments.length > 0 || pendingImages.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b bg-[#1B5E20] text-white">
        <button onClick={onBack} className="md:hidden text-white/80 hover:text-white p-1">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="w-9 h-9 rounded-full bg-green-300 flex items-center justify-center text-green-900 font-bold text-xs overflow-hidden flex-shrink-0">
          {isGroup ? (
            <span className="text-sm">👥</span>
          ) : roomAvatar ? (
            <img src={roomAvatar} alt="" className="w-9 h-9 rounded-full object-cover" />
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
        <button
          onClick={() => { setSearchMode(!searchMode); setSearchQuery(''); setSearchResults([]); }}
          className="text-white/80 hover:text-white p-1"
          title="Tim kiem tin nhan"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
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

      {/* Pinned message bar */}
      {pinnedMessages.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border-b cursor-pointer hover:bg-yellow-100 transition-colors"
          onClick={() => scrollToMessage(pinnedMessages[0].id)}
        >
          <span className="text-sm">📌</span>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-gray-700">{pinnedMessages[0].sender_name}: </span>
            <span className="text-xs text-gray-500 truncate">
              {pinnedMessages[0].content || (pinnedMessages[0].attachments?.length > 0 ? `${TYPE_ICONS[pinnedMessages[0].attachments[0]?.type] || '📎'} ${pinnedMessages[0].attachments[0]?.title}` : '📎 File')}
            </span>
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); handlePin(pinnedMessages[0]); }}
            className="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0"
          >
            Bỏ ghim
          </button>
        </div>
      )}

      {/* Search bar */}
      {searchMode && (
        <div className="border-b bg-gray-50">
          <div className="flex items-center gap-2 px-3 py-2">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => handleSearchInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setSearchMode(false); setSearchQuery(''); setSearchResults([]); } }}
              placeholder="Tim kiem tin nhan..."
              className="flex-1 bg-transparent text-sm focus:outline-none"
              autoFocus
            />
            {searchLoading && <span className="text-xs text-gray-400 animate-pulse">...</span>}
            <button
              onClick={() => { setSearchMode(false); setSearchQuery(''); setSearchResults([]); }}
              className="text-gray-400 hover:text-gray-600 text-lg"
            >
              &times;
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="max-h-48 overflow-y-auto border-t">
              {searchResults.map(result => (
                <button
                  key={result.id}
                  onClick={() => {
                    scrollToMessage(result.id);
                    setSearchMode(false);
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 border-b border-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-700">{result.sender_name}</span>
                    <span className="text-[10px] text-gray-400">
                      {new Date(result.created_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">{result.content}</p>
                </button>
              ))}
            </div>
          )}
          {searchQuery && !searchLoading && searchResults.length === 0 && (
            <div className="px-3 py-3 text-xs text-gray-400 text-center border-t">
              Khong tim thay ket qua
            </div>
          )}
        </div>
      )}

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
                <div key={msg.id} data-msg-id={msg.id} className="transition-colors duration-500">
                  <ChatMessage
                    message={msg}
                    isOwn={msg.sender_id === currentUser?.id}
                    isGroup={isGroup}
                    onReply={setReplyTo}
                    replyMessage={msg.reply_to ? replyMessages[msg.reply_to] : null}
                    onContextMenu={handleContextMenu}
                    onNavigate={onNavigate}
                    reactions={reactions[msg.id] || []}
                    currentUserId={currentUser?.id}
                    onToggleReaction={toggleReaction}
                    onShowReactionPicker={handleShowReactionPicker}
                    readBy={getReadBy(msg)}
                    isDirectChat={!isGroup}
                    roomMembers={activeMembers}
                  />
                </div>
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

      {/* Pending attachments preview */}
      {pendingAttachments.length > 0 && (
        <div className="px-3 py-2 bg-gray-50 border-t flex flex-wrap gap-2">
          {pendingAttachments.map((att, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-white border rounded-lg px-2.5 py-1.5 text-xs">
              <span>{TYPE_ICONS[att.type] || '📎'}</span>
              <span className="font-medium text-gray-700 max-w-[120px] truncate">{att.title}</span>
              <button
                onClick={() => removePendingAttachment(i)}
                className="text-gray-400 hover:text-red-500 ml-0.5"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pending images preview */}
      {pendingImages.length > 0 && (
        <div className="px-3 py-2 bg-gray-50 border-t">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {pendingImages.map((img, i) => (
              <div key={i} className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border">
                <img src={img.preview} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => removePendingImage(i)}
                  className="absolute top-0 right-0 bg-black/60 text-white w-5 h-5 flex items-center justify-center text-xs rounded-bl-lg"
                >
                  &times;
                </button>
                {img.originalSize > 500 * 1024 && (
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[8px] text-white text-center py-0.5">
                    {(img.originalSize / (1024 * 1024)).toFixed(1)}MB
                  </div>
                )}
              </div>
            ))}
          </div>
          {uploadProgress && (
            <div className="text-xs text-green-600 mt-1 font-medium">
              Đang tải ảnh {uploadProgress}...
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-1.5 px-2 py-2 border-t bg-gray-50">
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_FILE_TYPES.join(',')}
          onChange={handleFileUpload}
          className="hidden"
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleImageSelect}
          className="hidden"
        />
        <div className="relative">
          <button
            onClick={() => setShowAttachmentPicker(!showAttachmentPicker)}
            disabled={uploading}
            className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 flex-shrink-0"
            title="Đính kèm"
          >
            {uploading ? (
              <span className="animate-spin inline-block">⏳</span>
            ) : (
              '📎'
            )}
          </button>
          {showAttachmentPicker && (
            <AttachmentPicker
              onSelect={handleAttachmentSelect}
              onFileClick={() => fileInputRef.current?.click()}
              onImageClick={() => imageInputRef.current?.click()}
              onClose={() => setShowAttachmentPicker(false)}
            />
          )}
        </div>
        <button
          onClick={() => imageInputRef.current?.click()}
          disabled={uploading}
          className="p-2 text-gray-400 hover:text-gray-600 disabled:opacity-50 flex-shrink-0"
          title="Gửi ảnh"
        >
          🖼️
        </button>
        <div className="relative flex-1">
          <textarea
            ref={inputRef}
            value={newMessage}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              // On mobile, ensure input stays visible when keyboard opens
              if (window.innerWidth < 768) {
                setTimeout(() => {
                  inputRef.current?.closest('.flex.flex-col.h-full')
                    ?.scrollTo?.({ top: inputRef.current.closest('.flex.flex-col.h-full')?.scrollHeight, behavior: 'smooth' });
                }, 300);
              }
            }}
            placeholder="Nhap tin nhan... (@ten de tag)"
            rows={1}
            className="w-full px-3 py-1.5 bg-white border rounded-2xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-500 max-h-24"
            style={{ minHeight: '36px' }}
          />
          {showMentionPopup && (
            <MentionPopup
              members={activeMembers}
              search={mentionSearch}
              onSelect={handleSelectMention}
              position={{ left: 8, bottom: 44 }}
            />
          )}
        </div>
        <button
          onClick={() => pendingImages.length > 0 ? sendImagesMessage() : sendMessage(newMessage)}
          disabled={sending || (!canSend && !uploading)}
          className="p-2 text-green-600 hover:text-green-800 disabled:text-gray-300 flex-shrink-0"
          title="Gửi"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <MessageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          message={contextMenu.message}
          isOwn={contextMenu.message.sender_id === currentUser?.id}
          isPinned={contextMenu.message.is_pinned}
          onPin={handlePin}
          onReply={setReplyTo}
          onCopy={handleCopy}
          onDelete={handleDelete}
          onReaction={(msg) => {
            handleShowReactionPicker(msg, contextMenu.x, contextMenu.y - 50);
          }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Reaction picker */}
      {reactionPicker && (
        <ReactionPicker
          position={{ x: reactionPicker.x, y: reactionPicker.y }}
          onSelect={(emoji) => toggleReaction(reactionPicker.messageId, emoji)}
          onClose={() => setReactionPicker(null)}
        />
      )}
    </div>
  );
}
