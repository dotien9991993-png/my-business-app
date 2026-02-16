import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';

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

export default function ChatMessage({ message, isOwn, isGroup, onReply, replyMessage }) {
  const [showPreview, setShowPreview] = useState(false);
  const [showActions, setShowActions] = useState(false);

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

  // Get public URL for files
  const getFileUrl = (path) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    const { data } = supabase.storage.from('chat-files').getPublicUrl(path);
    return data?.publicUrl || path;
  };

  return (
    <>
      <div
        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} mb-1 px-3 group`}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        <div className={`max-w-[75%] ${isOwn ? 'order-1' : 'order-2'}`}>
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
            {/* Image */}
            {isImage && message.file_url && (
              <div className="mb-1 -mx-1 -mt-0.5">
                <img
                  src={getFileUrl(message.file_url)}
                  alt={message.file_name || 'Ảnh'}
                  className="rounded-xl max-w-full max-h-60 cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setShowPreview(true)}
                  loading="lazy"
                />
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

            {/* Text content */}
            {message.content && (
              <p className="text-[13.5px] leading-snug whitespace-pre-wrap break-words">
                {message.content}
              </p>
            )}

            {/* Time + edited */}
            <div className={`text-[10px] mt-0.5 flex items-center gap-1 ${
              isOwn ? 'text-green-200 justify-end' : 'text-gray-400 justify-start'
            }`}>
              {message.is_edited && <span>đã sửa ·</span>}
              <span>{formatMessageTime(message.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Action buttons (hover) */}
        {showActions && (
          <div className={`flex items-center gap-0.5 ${isOwn ? 'order-0 mr-1' : 'order-3 ml-1'}`}>
            <button
              onClick={() => onReply?.(message)}
              className="w-6 h-6 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 text-xs"
              title="Trả lời"
            >
              ↩
            </button>
          </div>
        )}
      </div>

      {showPreview && (
        <ImagePreview url={getFileUrl(message.file_url)} onClose={() => setShowPreview(false)} />
      )}
    </>
  );
}
