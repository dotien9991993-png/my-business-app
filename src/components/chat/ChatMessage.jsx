import React, { useState, useRef, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { getChatImageUrl, getFullImageUrl, isCloudinaryUrl } from '../../utils/cloudinaryUpload';
import AttachmentCard from './AttachmentCard';

// Format file size
const formatFileSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

// Format thời gian tin nhắn
const formatMessageTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
};

// Image preview modal
const ImagePreview = ({ url, onClose }) => (
  <div className="fixed inset-0 bg-black/80 z-[10001] flex items-center justify-center p-4" onClick={onClose}>
    <button onClick={onClose} className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300">&times;</button>
    <img src={url} alt="" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
  </div>
);

// Parse @mentions and render with highlight
const renderContentWithMentions = (content) => {
  if (!content) return null;
  // Match @Name patterns (name can be Vietnamese with spaces, up to reasonable length)
  const parts = content.split(/(@(?:Tất cả|Tat ca|[^\s@]{1,30}(?:\s[^\s@]{1,30})*))/g);
  return parts.map((part, i) => {
    if (part.startsWith('@')) {
      return (
        <span key={i} className="text-blue-400 font-bold cursor-pointer hover:underline">
          {part}
        </span>
      );
    }
    return part;
  });
};

// Reaction badge display
const ReactionBadges = ({ reactions, currentUserId, messageId, onToggleReaction, onShowReactionPicker, isOwn }) => {
  if (!reactions?.length) return null;

  // Group by emoji
  const grouped = {};
  reactions.forEach(r => {
    if (!grouped[r.emoji]) grouped[r.emoji] = [];
    grouped[r.emoji].push(r);
  });

  return (
    <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      {Object.entries(grouped).map(([emoji, users]) => {
        const iReacted = users.some(u => u.user_id === currentUserId);
        return (
          <button
            key={emoji}
            onClick={() => onToggleReaction(messageId, emoji)}
            className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
              iReacted
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
            title={users.map(u => u.user_name).join(', ')}
          >
            <span>{emoji}</span>
            <span className="text-[10px] font-medium">{users.length}</span>
          </button>
        );
      })}
      <button
        onClick={(e) => onShowReactionPicker({ id: messageId }, e.clientX, e.clientY - 50)}
        className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs border border-gray-200 text-gray-400 hover:bg-gray-100 transition-colors"
      >
        +
      </button>
    </div>
  );
};

// Read receipt display
const ReadReceipt = ({ readBy, isOwn, isDirectChat }) => {
  if (!isOwn || !readBy) return null;

  if (isDirectChat) {
    // Direct chat: checkmarks
    if (readBy.length > 0) {
      return (
        <span className="text-blue-400 ml-1" title={`Da xem boi ${readBy[0]?.user_name}`}>
          <svg className="w-3.5 h-3.5 inline" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z" />
          </svg>
        </span>
      );
    }
    return (
      <span className="text-gray-400 ml-1" title="Da gui">
        <svg className="w-3 h-3 inline" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
      </span>
    );
  }

  // Group chat
  if (readBy.length === 0) return null;
  const label = readBy.length <= 2
    ? `Da xem boi ${readBy.map(r => r.user_name).join(', ')}`
    : `Da xem boi ${readBy.length} nguoi`;

  return (
    <span className="text-[9px] text-blue-400 ml-1" title={readBy.map(r => r.user_name).join(', ')}>
      {label}
    </span>
  );
};

export default function ChatMessage({
  message, isOwn, isGroup, onReply: _onReply, replyMessage, onContextMenu, onNavigate,
  reactions, currentUserId, onToggleReaction, onShowReactionPicker,
  readBy, isDirectChat, roomMembers: _roomMembers
}) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const longPressTimer = useRef(null);
  const touchMoved = useRef(false);

  // Long press detection for mobile
  const handleTouchStart = useCallback((e) => {
    touchMoved.current = false;
    longPressTimer.current = setTimeout(() => {
      if (!touchMoved.current) {
        const touch = e.touches?.[0];
        if (touch) {
          onContextMenu?.(message, touch.clientX, touch.clientY);
        }
      }
    }, 500);
  }, [message, onContextMenu]);

  const handleTouchMove = useCallback(() => {
    touchMoved.current = true;
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  }, []);

  // Right-click for desktop
  const handleRightClick = useCallback((e) => {
    e.preventDefault();
    onContextMenu?.(message, e.clientX, e.clientY);
  }, [message, onContextMenu]);

  if (message.is_deleted) {
    return (
      <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1 px-3`}>
        <div className="italic text-gray-400 text-xs py-1">Tin nhắn đã bị xóa</div>
      </div>
    );
  }

  // System message
  if (message.message_type === 'system') {
    return (
      <div className="flex justify-center mb-2 px-3">
        <div className="text-xs text-gray-400 bg-gray-100 rounded-full px-3 py-1">
          {message.content}
        </div>
      </div>
    );
  }

  const isImage = message.message_type === 'image';
  const isFile = message.message_type === 'file';
  const attachments = message.attachments || [];
  const imageAttachments = attachments.filter(a => a.type === 'image');
  const nonImageAttachments = attachments.filter(a => a.type !== 'image');

  // Get public URL for files (backward compatible: Supabase path → public URL)
  const getFileUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const { data } = supabase.storage.from('chat-files').getPublicUrl(path);
    return data?.publicUrl || path;
  };

  // Get display URL for image (Cloudinary optimized or Supabase fallback)
  const getDisplayImageUrl = (url) => {
    const resolvedUrl = getFileUrl(url);
    return isCloudinaryUrl(resolvedUrl) ? getChatImageUrl(resolvedUrl) : resolvedUrl;
  };

  // Get full-size URL for lightbox
  const getPreviewImageUrl = (url) => {
    const resolvedUrl = getFileUrl(url);
    return isCloudinaryUrl(resolvedUrl) ? getFullImageUrl(resolvedUrl) : resolvedUrl;
  };

  return (
    <>
      <div
        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1 px-3 group`}
        onContextMenu={handleRightClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className={`max-w-[75%] ${isOwn ? 'order-1' : 'order-2'}`}>
          {/* Pin indicator */}
          {message.is_pinned && (
            <div className={`text-[10px] mb-0.5 flex items-center gap-1 ${isOwn ? 'justify-end mr-1' : 'ml-1'}`}>
              <span>📌</span>
              <span className="text-gray-400">Đã ghim</span>
            </div>
          )}

          {/* Tên người gửi (nhóm, không phải tin mình) */}
          {isGroup && !isOwn && (
            <div className="text-[10px] text-gray-500 mb-0.5 ml-1 font-medium">
              {message.sender_name}
            </div>
          )}

          {/* Reply reference */}
          {replyMessage && (
            <div className={`text-[11px] rounded-t-lg px-2.5 py-1 border-l-2 mb-0.5 ${
              isOwn ? 'bg-green-800/30 border-green-300 text-green-100' : 'bg-gray-200 border-gray-400 text-gray-600'
            }`}>
              <span className="font-medium">{replyMessage.sender_name}</span>
              <p className="truncate opacity-80">{replyMessage.content || (replyMessage.file_name ? `📎 ${replyMessage.file_name}` : 'Ảnh')}</p>
            </div>
          )}

          {/* Message bubble */}
          <div className={`relative rounded-2xl px-3 py-1.5 ${
            isOwn
              ? 'bg-[#1B5E20] text-white rounded-br-md'
              : 'bg-gray-100 text-gray-900 rounded-bl-md'
          }`}>
            {/* Single image (message_type === 'image') */}
            {isImage && message.file_url && (
              <div className="mb-1 -mx-1 -mt-0.5">
                <img
                  src={getDisplayImageUrl(message.file_url)}
                  alt={message.file_name || 'Ảnh'}
                  className="rounded-xl max-w-full max-h-60 cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setPreviewUrl(getPreviewImageUrl(message.file_url))}
                  loading="lazy"
                />
              </div>
            )}

            {/* Multiple images from attachments */}
            {imageAttachments.length > 0 && (
              <div className={`mb-1 -mx-1 -mt-0.5 grid gap-1 ${
                imageAttachments.length === 1 ? 'grid-cols-1' :
                imageAttachments.length === 2 ? 'grid-cols-2' :
                'grid-cols-2'
              }`}>
                {imageAttachments.slice(0, 4).map((att, i) => (
                  <div key={i} className={`relative ${
                    imageAttachments.length === 3 && i === 0 ? 'col-span-2' : ''
                  }`}>
                    <img
                      src={isCloudinaryUrl(att.url) ? getChatImageUrl(att.url) : att.url}
                      alt=""
                      className="rounded-lg w-full h-32 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => setPreviewUrl(isCloudinaryUrl(att.url) ? getFullImageUrl(att.url) : att.url)}
                      loading="lazy"
                    />
                    {i === 3 && imageAttachments.length > 4 && (
                      <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                        <span className="text-white text-lg font-bold">+{imageAttachments.length - 4}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* File attachment */}
            {isFile && message.file_url && (
              <a
                href={getFileUrl(message.file_url)}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-2 p-2 rounded-lg mb-1 ${
                  isOwn ? 'bg-green-800/30 hover:bg-green-800/50' : 'bg-gray-200 hover:bg-gray-300'
                } transition-colors`}
              >
                <span className="text-2xl">📎</span>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium truncate ${isOwn ? 'text-white' : 'text-gray-900'}`}>
                    {message.file_name || 'Tệp đính kèm'}
                  </div>
                  <div className={`text-[10px] ${isOwn ? 'text-green-200' : 'text-gray-500'}`}>
                    {formatFileSize(message.file_size)}
                  </div>
                </div>
                <span className="text-lg">⬇️</span>
              </a>
            )}

            {/* Text content with @mentions */}
            {message.content && (
              <p className="text-[13.5px] leading-snug whitespace-pre-wrap break-words">
                {message.mentions?.length > 0
                  ? renderContentWithMentions(message.content)
                  : message.content
                }
              </p>
            )}

            {/* Non-image attachment cards */}
            {nonImageAttachments.length > 0 && nonImageAttachments.map((att, i) => (
              <AttachmentCard key={i} attachment={att} isOwn={isOwn} onNavigate={onNavigate} />
            ))}

            {/* Time + edited + read receipt */}
            <div className={`text-[10px] mt-0.5 flex items-center gap-1 ${
              isOwn ? 'text-green-200 justify-end' : 'text-gray-400 justify-start'
            }`}>
              {message.is_edited && <span>đã sửa ·</span>}
              <span>{formatMessageTime(message.created_at)}</span>
              <ReadReceipt readBy={readBy} isOwn={isOwn} isDirectChat={isDirectChat} />
            </div>
          </div>

          {/* Reaction badges */}
          <ReactionBadges
            reactions={reactions}
            currentUserId={currentUserId}
            messageId={message.id}
            onToggleReaction={onToggleReaction}
            onShowReactionPicker={onShowReactionPicker}
            isOwn={isOwn}
          />
        </div>
      </div>

      {previewUrl && (
        <ImagePreview url={previewUrl} onClose={() => setPreviewUrl(null)} />
      )}
    </>
  );
}
