import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useMobileChatConversation } from '../../hooks/useMobileChat';
import ChatHeader from './ChatHeader';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import MobileSkeleton from '../../components/MobileSkeleton';

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
  return vnDate.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
};

const getMessageDate = (dateStr) => {
  return new Date(dateStr).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
};

export default function ChatConversation({ room, user, tenantId, allUsers, onBack, onEntityNavigate }) {
  const {
    messages, loading, loadingMore, hasMore,
    handleLoadMore, sendMessage, deleteMessage
  } = useMobileChatConversation(room.id, user?.id);

  const [replyTo, setReplyTo] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

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
        const kbOpen = window.innerHeight - vv.height > 100;
        el.classList.toggle('keyboard-open', kbOpen);
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

  // Show/hide scroll-to-bottom button
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const onScroll = () => {
      const distFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight;
      setShowScrollBtn(distFromBottom > 300);
    };
    c.addEventListener('scroll', onScroll, { passive: true });
    return () => c.removeEventListener('scroll', onScroll);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Context menu
  const handleContextMenu = useCallback((msg, x, y) => {
    setContextMenu({ message: msg, x, y });
  }, []);

  const handleDelete = async (msg) => {
    try {
      await deleteMessage(msg.id);
    } catch (err) {
      console.error('Delete error:', err);
    }
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

  // Group by date + detect continued messages
  let lastDate = null;
  let lastSenderId = null;

  return (
    <div className="mchat-conversation" ref={wrapperRef}>
      <ChatHeader room={room} user={user} allUsers={allUsers} onBack={onBack} />

      {/* Messages */}
      <div className="mchat-messages" ref={containerRef}>
        {hasMore && messages.length > 0 && (
          <div className="mchat-load-more">
            <button onClick={handleLoadMore} disabled={loadingMore}>
              {loadingMore ? (
                <><span className="mchat-spinner-sm" /> Đang tải...</>
              ) : (
                'Tải tin nhắn cũ hơn'
              )}
            </button>
          </div>
        )}

        {loading ? (
          <MobileSkeleton type="chat" count={8} />
        ) : messages.length === 0 ? (
          <div className="mchat-center-text">
            <div className="mchat-empty-conv-icon">
              <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <p className="mchat-empty-conv-text">Bắt đầu cuộc trò chuyện!</p>
            <p className="mchat-empty-conv-sub">Gửi tin nhắn đầu tiên</p>
          </div>
        ) : (
          messages.map((msg) => {
            const msgDate = getMessageDate(msg.created_at);
            const showDate = msgDate !== lastDate;
            if (showDate) lastSenderId = null;
            lastDate = msgDate;

            const isContinued = msg.sender_id === lastSenderId && msg.message_type !== 'system';
            lastSenderId = msg.message_type === 'system' ? null : msg.sender_id;

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
                  isContinued={isContinued}
                  replyMessage={msg.reply_to ? replyLookup[msg.reply_to] : null}
                  allUsers={allUsers}
                  onContextMenu={handleContextMenu}
                  onImagePreview={setImagePreview}
                  onAttachmentClick={onEntityNavigate}
                />
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button className="mchat-scroll-bottom" onClick={scrollToBottom}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 13l5 5 5-5M7 6l5 5 5-5"/></svg>
        </button>
      )}

      {/* Input */}
      <ChatInput
        room={room}
        user={user}
        tenantId={tenantId}
        members={room.members}
        onSend={sendMessage}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="mchat-ctx-overlay" onClick={() => setContextMenu(null)} />
          <div className="mchat-ctx-menu">
            <button onClick={() => { setReplyTo(contextMenu.message); setContextMenu(null); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
              Trả lời
            </button>
            {contextMenu.message.content && (
              <button onClick={() => handleCopy(contextMenu.message)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Sao chép
              </button>
            )}
            {contextMenu.message.sender_id === user?.id && (
              <button className="danger" onClick={() => handleDelete(contextMenu.message)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Xóa
              </button>
            )}
          </div>
        </>
      )}

      {/* Image preview */}
      {imagePreview && (
        <div className="mchat-img-preview" onClick={() => setImagePreview(null)}>
          <img src={imagePreview} alt="" />
          <button className="mchat-img-close" onClick={() => setImagePreview(null)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}
