import React, { useState, useRef, useCallback } from 'react';
import { uploadImage } from '../../../utils/cloudinaryUpload';
import { supabase } from '../../../supabaseClient';
import { haptic } from '../../utils/haptics';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export default function ChatInput({ room, user, members, onSend, replyTo, onCancelReply }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [pendingImage, setPendingImage] = useState(null); // { file, preview }
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const composingRef = useRef(false);

  const activeMembers = (members || []).filter(m => m.is_active !== false && m.user_id !== user?.id);

  // Auto-grow textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  // Handle text change with @mention detection
  const handleTextChange = useCallback((e) => {
    const val = e.target.value;
    setText(val);
    adjustHeight();

    const cursor = e.target.selectionStart;
    const textBefore = val.substring(0, cursor);
    const mentionMatch = textBefore.match(/@([^\s@]*)$/);
    if (mentionMatch) {
      setShowMentions(true);
      setMentionQuery(mentionMatch[1].toLowerCase());
    } else {
      setShowMentions(false);
    }
  }, [adjustHeight]);

  // Insert mention
  const handleSelectMention = useCallback((member) => {
    const cursor = textareaRef.current?.selectionStart || text.length;
    const textBefore = text.substring(0, cursor);
    const textAfter = text.substring(cursor);
    const mentionMatch = textBefore.match(/@([^\s@]*)$/);
    if (mentionMatch) {
      const newText = textBefore.substring(0, mentionMatch.index) + `@${member.user_name} ` + textAfter;
      setText(newText);
    }
    setShowMentions(false);
    textareaRef.current?.focus();
  }, [text]);

  // Send text (or pending image with caption)
  const handleSend = useCallback(async () => {
    const hasText = text.trim();
    const hasImage = !!pendingImage;
    if ((!hasText && !hasImage) || sending || uploading) return;

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
      if (hasImage) {
        // Upload image then send
        setUploadProgress('Đang tải ảnh...');
        const result = await uploadImage(pendingImage.file, 'chat');
        await onSend(hasText ? text.trim() : null, 'image', { url: result.url, name: pendingImage.file.name, size: result.file_size }, replyTo, mentionedIds, user);
        URL.revokeObjectURL(pendingImage.preview);
        setPendingImage(null);
      } else {
        await onSend(text.trim(), 'text', null, replyTo, mentionedIds, user);
      }
      haptic();
      setText('');
      onCancelReply?.();
      setUploadProgress('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    } catch (err) {
      console.error('Send error:', err);
      setUploadProgress('');
    } finally {
      setSending(false);
    }
  }, [text, pendingImage, sending, uploading, replyTo, user, activeMembers, onSend, onCancelReply]);

  // Handle key
  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey && !composingRef.current) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Image select → show preview (don't upload yet)
  const handleImageSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!file.type.startsWith('image/')) return;
    if (file.size > MAX_FILE_SIZE) {
      alert('Ảnh quá lớn. Tối đa 10MB.');
      return;
    }

    // Revoke old preview
    if (pendingImage) URL.revokeObjectURL(pendingImage.preview);
    setPendingImage({ file, preview: URL.createObjectURL(file) });
    textareaRef.current?.focus();
  }, [pendingImage]);

  // Cancel pending image
  const cancelPendingImage = useCallback(() => {
    if (pendingImage) URL.revokeObjectURL(pendingImage.preview);
    setPendingImage(null);
  }, [pendingImage]);

  // File upload (PDF, Excel, Word)
  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // If image selected via file button, redirect to image flow
    if (file.type.startsWith('image/')) {
      if (file.size > MAX_FILE_SIZE) {
        alert('Ảnh quá lớn. Tối đa 10MB.');
        return;
      }
      if (pendingImage) URL.revokeObjectURL(pendingImage.preview);
      setPendingImage({ file, preview: URL.createObjectURL(file) });
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      alert('File quá lớn. Tối đa 10MB.');
      return;
    }

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      alert('Chỉ hỗ trợ PDF, Excel, Word.');
      return;
    }

    setUploading(true);
    setUploadProgress('Đang tải file...');
    try {
      const ext = file.name.split('.').pop();
      const path = `${room.id}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('chat-files').upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(path);
      await onSend(null, 'file', { url: urlData.publicUrl, name: file.name, size: file.size }, replyTo, [], user);
      haptic();
      onCancelReply?.();
    } catch (err) {
      console.error('File upload error:', err);
      alert('Tải file thất bại.');
    } finally {
      setUploading(false);
      setUploadProgress('');
    }
  }, [room.id, onSend, replyTo, user, onCancelReply, pendingImage]);

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
          <div className="mchat-reply-bar-border" />
          <div className="mchat-reply-bar-content">
            <span className="mchat-reply-bar-name">{replyTo.sender_name}</span>
            <span className="mchat-reply-bar-text">
              {replyTo.content?.substring(0, 50) || '📎 File'}
            </span>
          </div>
          <button className="mchat-reply-bar-close" onClick={onCancelReply}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      {/* Pending image preview */}
      {pendingImage && (
        <div className="mchat-pending-img">
          <img src={pendingImage.preview} alt="" />
          <button className="mchat-pending-img-close" onClick={cancelPendingImage}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}

      {/* Upload progress */}
      {uploadProgress && (
        <div className="mchat-upload-bar">
          <span className="mchat-upload-spinner" />
          <span>{uploadProgress}</span>
        </div>
      )}

      {/* Mention suggestions */}
      {filteredMentions.length > 0 && (
        <div className="mchat-mention-list">
          {filteredMentions.map(m => (
            <button key={m.user_id} className="mchat-mention-item" onClick={() => handleSelectMention(m)}>
              <span className="mchat-mention-avatar">
                {m.user_id === 'all' ? '@@' : m.user_name?.charAt(0)?.toUpperCase()}
              </span>
              <span className="mchat-mention-name">{m.user_name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="mchat-input-row">
        <div className="mchat-input-actions">
          <label className="mchat-input-action-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              style={{ display: 'none' }}
              disabled={uploading || sending}
            />
          </label>
          <button
            className="mchat-input-action-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          </button>
        </div>

        <div className="mchat-textarea-wrap">
          <textarea
            ref={textareaRef}
            className="mchat-textarea"
            placeholder={uploading ? 'Đang tải lên...' : pendingImage ? 'Thêm chú thích...' : 'Nhập tin nhắn...'}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={() => { composingRef.current = false; }}
            disabled={uploading}
            rows={1}
          />
        </div>

        <button
          className={`mchat-send-btn ${(text.trim() || pendingImage) ? 'active' : ''}`}
          onClick={handleSend}
          disabled={(!text.trim() && !pendingImage) || sending || uploading}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />
    </div>
  );
}
