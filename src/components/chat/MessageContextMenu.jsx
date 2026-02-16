import React, { useEffect, useRef } from 'react';

export default function MessageContextMenu({
  x, y,
  message,
  isOwn,
  isPinned,
  onPin,
  onReply,
  onCopy,
  onDelete,
  onClose
}) {
  const menuRef = useRef(null);

  // Position adjustment to keep menu in viewport
  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw) {
      menuRef.current.style.left = `${x - rect.width}px`;
    }
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${y - rect.height}px`;
    }
  }, [x, y]);

  const hasContent = message?.content && message.message_type !== 'system';

  return (
    <>
      <div className="fixed inset-0 z-[10003]" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
      <div
        ref={menuRef}
        className="fixed z-[10004] bg-white rounded-xl shadow-xl border py-1.5 w-44 animate-in"
        style={{ left: x, top: y }}
      >
        {/* Pin */}
        <button
          onClick={() => { onPin(message); onClose(); }}
          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
        >
          📌 {isPinned ? 'Bỏ ghim' : 'Ghim tin nhắn'}
        </button>

        {/* Reply */}
        <button
          onClick={() => { onReply(message); onClose(); }}
          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
        >
          ↩️ Trả lời
        </button>

        {/* Copy */}
        {hasContent && (
          <button
            onClick={() => { onCopy(message); onClose(); }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
          >
            📋 Sao chép
          </button>
        )}

        {/* Delete - only own messages */}
        {isOwn && (
          <>
            <div className="border-t my-1" />
            <button
              onClick={() => { onDelete(message); onClose(); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
            >
              🗑️ Xóa
            </button>
          </>
        )}
      </div>
    </>
  );
}
