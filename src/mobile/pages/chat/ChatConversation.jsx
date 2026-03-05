import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useMobileChatConversation } from '../../hooks/useMobileChat';
import ChatHeader from './ChatHeader';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';

const formatDateSeparator = (dateStr) => {
  const d = new Date(dateStr);
  const now = new Date();
  const vnNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const vnDate = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  const today = new Date(vnNow.getFullYear(), vnNow.getMonth(), vnNow.getDate());
  const msgDay = new Date(vnDate.getFullYear(), vnDate.getMonth(), vnDate.getDate());
  const diffDays = Math.floor((today - msgDay) / 86400000);
  if (diffDays === 0) return 'Hôm nay';
  if (diffDays === 1) return 'Hôm qua';
  return vnDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const getMessageDate = (dateStr) => {
  return new Date(dateStr).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
};

export default function ChatConversation({ room, user, allUsers, onBack }) {
  const {
    messages, loading, loadingMore, hasMore,
    handleLoadMore, sendMessage, deleteMessage
  } = useMobileChatConversation(room.id, user?.id);

  const [replyTo, setReplyTo] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const messagesEndRef = useRef(null);
  const containerRef = useRef(null);
  const initialScrollRef = useRef(true);
  const wrapperRef = useRef(null);

  const isGroup = room.type === 'group';

  // iOS keyboard fix — sync to visualViewport
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const el = wrapperRef.current;
      if (el) {
        el.style.height = `${vv.height}px`;
        el.style.top = `${vv.offsetTop}px`;
      }
      requestAnimationFrame(() => {
        const c = containerRef.current;
        if (c) {
          const nearBottom = c.scrollHeight - c.scrollTop - c.clientHeight < 200;
          if (nearBottom) c.scrollTop = c.scrollHeight;
        }
      });
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    onResize();
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (initialScrollRef.current && messages.length > 0 && !loading) {
      messagesEndRef.current?.scrollIntoView();
      initialScrollRef.current = false;
    }
  }, [messages, loading]);

  // Auto-scroll on new own message
  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.sender_id === user?.id) {
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } else {
      const c = containerRef.current;
      if (c && c.scrollHeight - c.scrollTop - c.clientHeight < 150) {
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
    }
  }, [messages.length, user?.id]);

  // Context menu
  const handleContextMenu = useCallback((msg, x, y) => {
    setContextMenu({ message: msg, x, y });
  }, []);

  const handleDelete = async (msg) => {
    await deleteMessage(msg.id);
    setContextMenu(null);
  };

  const handleCopy = (msg) => {
    navigator.clipboard?.writeText(msg.content || '');
    setContextMenu(null);
  };

  // Reply lookup
  const replyLookup = useMemo(() => {
    const map = {};
    messages.forEach(m => { map[m.id] = m; });
    return map;
  }, [messages]);

  // Group by date
  let lastDate = null;

  return (
    <div className="mchat-conversation" ref={wrapperRef}>
      <ChatHeader room={room} user={user} allUsers={allUsers} onBack={onBack} />

      {/* Messages */}
      <div className="mchat-messages" ref={containerRef}>
        {hasMore && messages.length > 0 && (
          <div className="mchat-load-more">
            <button onClick={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? 'Đang tải...' : 'Tải tin nhắn cũ hơn'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="mchat-center-text">Đang tải...</div>
        ) : messages.length === 0 ? (
          <div className="mchat-center-text">Chưa có tin nhắn. Hãy bắt đầu!</div>
        ) : (
          messages.map((msg) => {
            const msgDate = getMessageDate(msg.created_at);
            const showDate = msgDate !== lastDate;
            lastDate = msgDate;

            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div className="mchat-date-sep">
                    <span>{formatDateSeparator(msg.created_at)}</span>
                  </div>
                )}
                <ChatMessage
                  message={msg}
                  isOwn={msg.sender_id === user?.id}
                  isGroup={isGroup}
                  replyMessage={msg.reply_to ? replyLookup[msg.reply_to] : null}
                  onContextMenu={handleContextMenu}
                  onImagePreview={setImagePreview}
                />
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput
        room={room}
        user={user}
        members={room.members}
        onSend={sendMessage}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="mchat-ctx-overlay" onClick={() => setContextMenu(null)} />
          <div
            className="mchat-ctx-menu"
            style={{
              top: Math.min(contextMenu.y, window.innerHeight - 200),
              left: Math.min(contextMenu.x, window.innerWidth - 160)
            }}
          >
            <button onClick={() => { setReplyTo(contextMenu.message); setContextMenu(null); }}>
              ↩️ Trả lời
            </button>
            {contextMenu.message.content && (
              <button onClick={() => handleCopy(contextMenu.message)}>
                📋 Sao chép
              </button>
            )}
            {contextMenu.message.sender_id === user?.id && (
              <button className="danger" onClick={() => handleDelete(contextMenu.message)}>
                🗑️ Xóa
              </button>
            )}
          </div>
        </>
      )}

      {/* Image preview */}
      {imagePreview && (
        <div className="mchat-img-preview" onClick={() => setImagePreview(null)}>
          <img src={imagePreview} alt="" />
          <button className="mchat-img-close" onClick={() => setImagePreview(null)}>✕</button>
        </div>
      )}
    </div>
  );
}
