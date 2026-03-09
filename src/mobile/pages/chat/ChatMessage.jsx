import React, { useRef, useCallback } from 'react';
import { getChatImageUrl } from '../../../utils/cloudinaryUpload';

const AVATAR_COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c',
  '#3498db', '#9b59b6', '#e91e63', '#00bcd4', '#ff5722',
];

const getAvatarColor = (name) => {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

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

const ATT_ICONS = {
  order: '📦', task: '🎬', product: '📦', customer: '👥',
  technical_job: '🔧', warranty: '🛡️',
};

export default function ChatMessage({ message, isOwn, isGroup, isContinued, replyMessage, allUsers, onContextMenu, onImagePreview, onAttachmentClick }) {
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

  // Lookup sender's CURRENT avatar from allUsers (primary), fallback to denormalized sender_avatar
  const senderUser = isGroup && !isOwn ? (allUsers || []).find(u => u.id === message.sender_id) : null;
  const senderAvatarUrl = senderUser?.avatar_url || message.sender_avatar || null;
  const senderColor = getAvatarColor(message.sender_name);
  const showAvatar = isGroup && !isOwn && !isContinued;
  const showSender = isGroup && !isOwn && !isContinued;

  return (
    <div
      className={`mchat-msg ${isOwn ? 'own' : ''} ${isContinued ? 'continued' : ''}`}
      id={`msg-${message.id}`}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Avatar for group messages (other) */}
      {isGroup && !isOwn && (
        <div className="mchat-msg-avatar-col">
          {showAvatar ? (
            <div className="mchat-msg-avatar" style={{ background: senderAvatarUrl ? 'transparent' : senderColor }}>
              {senderAvatarUrl
                ? <img src={senderAvatarUrl} alt="" className="mchat-msg-avatar-img" onError={e => { e.target.style.display='none'; e.target.parentElement.style.background=senderColor; e.target.parentElement.textContent=message.sender_name?.charAt(0)?.toUpperCase(); }} />
                : message.sender_name?.charAt(0)?.toUpperCase()
              }
            </div>
          ) : (
            <div className="mchat-msg-avatar-spacer" />
          )}
        </div>
      )}

      <div className="mchat-msg-content">
        {/* Sender name */}
        {showSender && (
          <div className="mchat-sender" style={{ color: senderColor }}>{message.sender_name}</div>
        )}

        {/* Reply quote */}
        {replyMessage && (
          <div className={`mchat-reply-quote ${isOwn ? 'own' : ''}`}>
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
          <a className={`mchat-file-wrap ${isOwn ? 'own' : ''}`} href={message.file_url} target="_blank" rel="noopener noreferrer">
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
            <span className="mchat-bubble-time">
              {message.is_edited && <span className="mchat-edited">đã sửa</span>}
              {formatTime(message.created_at)}
            </span>
          </div>
        )}

        {/* Time for non-text (image/file only) */}
        {!message.content && (
          <div className="mchat-time-standalone">
            {message.is_edited && <span>đã sửa · </span>}
            {formatTime(message.created_at)}
          </div>
        )}

        {/* Entity attachments */}
        {message.attachments?.length > 0 && message.attachments.map((att, i) => (
          <div
            key={i}
            className={`mchat-bubble mchat-attachment ${onAttachmentClick ? 'clickable' : ''}`}
            onClick={(e) => { e.stopPropagation(); onAttachmentClick?.(att); }}
          >
            <div className="mchat-att-type">{ATT_ICONS[att.type] || '📎'} {att.type === 'order' ? 'ĐƠN HÀNG' : att.type === 'task' ? 'VIDEO TASK' : att.type === 'technical_job' ? 'KỸ THUẬT' : att.type === 'product' ? 'SẢN PHẨM' : att.type === 'customer' ? 'KHÁCH HÀNG' : att.type === 'warranty' ? 'BẢO HÀNH' : 'ĐÍNH KÈM'}</div>
            <div className="mchat-att-title">{att.title}</div>
            {att.subtitle && <div className="mchat-att-sub">{att.subtitle}</div>}
            {att.status_label && <div className="mchat-att-status">{att.status_label}</div>}
            <div className="mchat-att-link">Xem chi tiết →</div>
          </div>
        ))}
      </div>
    </div>
  );
}
