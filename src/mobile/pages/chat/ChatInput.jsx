import React, { useState, useRef, useCallback } from 'react';
import { uploadImage } from '../../../utils/cloudinaryUpload';
import { supabase } from '../../../supabaseClient';

export default function ChatInput({ room, user, members, onSend, replyTo, onCancelReply }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const composingRef = useRef(false);

  const activeMembers = (members || []).filter(m => m.is_active !== false && m.user_id !== user?.id);

  // Handle text change with @mention detection
  const handleTextChange = useCallback((e) => {
    const val = e.target.value;
    setText(val);

    // Check for @mention
    const cursor = e.target.selectionStart;
    const textBefore = val.substring(0, cursor);
    const mentionMatch = textBefore.match(/@([^\s@]*)$/);
    if (mentionMatch) {
      setShowMentions(true);
      setMentionQuery(mentionMatch[1].toLowerCase());
    } else {
      setShowMentions(false);
    }
  }, []);

  // Insert mention
  const handleSelectMention = useCallback((member) => {
    const cursor = inputRef.current?.selectionStart || text.length;
    const textBefore = text.substring(0, cursor);
    const textAfter = text.substring(cursor);
    const mentionMatch = textBefore.match(/@([^\s@]*)$/);
    if (mentionMatch) {
      const newText = textBefore.substring(0, mentionMatch.index) + `@${member.user_name} ` + textAfter;
      setText(newText);
    }
    setShowMentions(false);
    inputRef.current?.focus();
  }, [text]);

  // Send
  const handleSend = useCallback(async () => {
    if ((!text.trim() && !uploading) || sending) return;

    // Extract mentions
    const mentionedIds = [];
    const mentionRegex = /@([^\s@]+(?:\s[^\s@]+)*)/g;
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      const name = match[1].trim();
      if (name === 'Tất cả') {
        mentionedIds.push('all');
      } else {
        const member = activeMembers.find(m =>
          m.user_name?.toLowerCase() === name.toLowerCase()
        );
        if (member) mentionedIds.push(member.user_id);
      }
    }

    setSending(true);
    try {
      await onSend(text.trim(), 'text', null, replyTo, mentionedIds, user);
      setText('');
      onCancelReply?.();
    } catch (err) {
      console.error('Send error:', err);
    } finally {
      setSending(false);
    }
  }, [text, sending, uploading, replyTo, user, activeMembers, onSend, onCancelReply]);

  // Handle key
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey && !composingRef.current) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Image upload
  const handleImageSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    try {
      const result = await uploadImage(file, 'chat');
      await onSend(null, 'image', { url: result.url, name: file.name, size: file.size }, replyTo, [], user);
      onCancelReply?.();
    } catch (err) {
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  }, [onSend, replyTo, user, onCancelReply]);

  // File upload
  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${room.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('chat-files').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(path);
      await onSend(null, 'file', { url: urlData.publicUrl, name: file.name, size: file.size }, replyTo, [], user);
      onCancelReply?.();
    } catch (err) {
      console.error('File upload error:', err);
    } finally {
      setUploading(false);
    }
  }, [room.id, onSend, replyTo, user, onCancelReply]);

  const filteredMentions = showMentions
    ? [{ user_id: 'all', user_name: 'Tất cả' }, ...activeMembers]
        .filter(m => !mentionQuery || m.user_name?.toLowerCase().includes(mentionQuery))
        .slice(0, 6)
    : [];

  return (
    <div className="mchat-input-area">
      {/* Reply bar */}
      {replyTo && (
        <div className="mchat-reply-bar">
          <div className="mchat-reply-bar-content">
            <span className="mchat-reply-bar-name">{replyTo.sender_name}</span>
            <span className="mchat-reply-bar-text">
              {replyTo.content?.substring(0, 50) || '📎 File'}
            </span>
          </div>
          <button className="mchat-reply-bar-close" onClick={onCancelReply}>✕</button>
        </div>
      )}

      {/* Mention suggestions */}
      {filteredMentions.length > 0 && (
        <div className="mchat-mention-list">
          {filteredMentions.map(m => (
            <button key={m.user_id} className="mchat-mention-item" onClick={() => handleSelectMention(m)}>
              <span className="mchat-mention-avatar">
                {m.user_id === 'all' ? '👥' : m.user_name?.charAt(0)?.toUpperCase()}
              </span>
              <span>{m.user_name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="mchat-input-row">
        <button
          className="mchat-attach-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          📎
        </button>

        <input
          ref={inputRef}
          className="mchat-text-input"
          placeholder={uploading ? 'Đang tải...' : 'Nhập tin nhắn...'}
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { composingRef.current = true; }}
          onCompositionEnd={() => { composingRef.current = false; }}
          disabled={uploading}
        />

        <label className="mchat-img-btn">
          🖼️
          <input
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            style={{ display: 'none' }}
            disabled={uploading}
          />
        </label>

        <button
          className="mchat-send-btn"
          onClick={handleSend}
          disabled={(!text.trim() && !uploading) || sending}
        >
          ➤
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
    </div>
  );
}
