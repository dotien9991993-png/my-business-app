import React, { useRef, useCallback } from 'react';
import { getChatImageUrl } from '../../../utils/cloudinaryUpload';

const MENTION_REGEX = /(@(?:Tất cả|[^\s@]{1,30}(?:\s[^\s@]{1,30})*))/g;

const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
};

const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const FILE_ICONS = {
  pdf: '📄', xlsx: '📊', xls: '📊', docx: '📝', doc: '📝',
};

const renderContent = (content) => {
  if (!content) return null;
  const parts = content.split(MENTION_REGEX);
  return parts.map((part, i) => {
    if (MENTION_REGEX.test(part)) {
      MENTION_REGEX.lastIndex = 0;
      return <span key={i} className="mchat-mention">{part}</span>;
    }
    return part;
  });
};

export default function ChatMessage({ message, isOwn, isGroup, replyMessage, onContextMenu, onImagePreview }) {
  const longPressTimer = useRef(null);
  const touchMoved = useRef(false);

  const handleTouchStart = useCallback((e) => {
    touchMoved.current = false;
    const touch = e.touches[0];
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        onContextMenu?.(message, touch.clientX, touch.clientY);
      }
    }, 500);
  }, [message, onContextMenu]);

  const handleTouchMove = useCallback(() => {
    touchMoved.current = true;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }, []);

  // System message
  if (message.message_type === 'system') {
    return (
      <div className="mchat-system-msg">
        <span>{message.content}</span>
      </div>
    );
  }

  // Deleted
  if (message.is_deleted) {
    return (
      <div className={`mchat-msg ${isOwn ? 'own' : ''}`}>
        <div className="mchat-bubble deleted">Tin nhắn đã bị xóa</div>
      </div>
    );
  }

  return (
    <div
      className={`mchat-msg ${isOwn ? 'own' : ''}`}
      id={`msg-${message.id}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Sender name (group only, not own) */}
      {isGroup && !isOwn && (
        <div className="mchat-sender">{message.sender_name}</div>
      )}

      {/* Reply quote */}
      {replyMessage && (
        <div className="mchat-reply-quote">
          <div className="mchat-reply-name">{replyMessage.sender_name}</div>
          <div className="mchat-reply-text">
            {replyMessage.content?.substring(0, 60) || (replyMessage.file_name ? `📎 ${replyMessage.file_name}` : '')}
          </div>
        </div>
      )}

      {/* Image */}
      {message.message_type === 'image' && message.file_url && (
        <div className="mchat-img-wrap" onClick={() => onImagePreview?.(message.file_url)}>
          <img src={getChatImageUrl(message.file_url)} alt="" loading="lazy" />
        </div>
      )}

      {/* File */}
      {message.message_type === 'file' && message.file_url && (
        <a className="mchat-file-wrap" href={message.file_url} target="_blank" rel="noopener noreferrer">
          <span className="mchat-file-icon">
            {FILE_ICONS[message.file_name?.split('.').pop()?.toLowerCase()] || '📎'}
          </span>
          <div className="mchat-file-info">
            <div className="mchat-file-name">{message.file_name}</div>
            <div className="mchat-file-size">{formatFileSize(message.file_size)}</div>
          </div>
        </a>
      )}

      {/* Text content */}
      {message.content && (
        <div className="mchat-bubble">
          {renderContent(message.content)}
        </div>
      )}

      {/* Entity attachments */}
      {message.attachments?.length > 0 && message.attachments.map((att, i) => (
        <div key={i} className="mchat-bubble mchat-attachment">
          <div className="mchat-att-title">
            {att.type === 'order' ? '📦' : att.type === 'task' ? '🎬' : '📎'} {att.title}
          </div>
          {att.subtitle && <div className="mchat-att-sub">{att.subtitle}</div>}
        </div>
      ))}

      {/* Time */}
      <div className="mchat-time">
        {message.is_edited && <span>đã sửa · </span>}
        {formatTime(message.created_at)}
      </div>
    </div>
  );
}
