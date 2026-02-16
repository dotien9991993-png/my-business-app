import React, { useEffect, useRef } from 'react';

const EMOJI_LIST = ['👍', '❤️', '😄', '😮', '😢', '✅', '❌'];

export default function ReactionPicker({ onSelect, onClose, position }) {
  const pickerRef = useRef(null);

  useEffect(() => {
    if (!pickerRef.current) return;
    const rect = pickerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (rect.right > vw - 10) {
      pickerRef.current.style.left = `${(position?.x || 0) - rect.width}px`;
    }
    if (rect.bottom > vh - 10) {
      pickerRef.current.style.top = `${(position?.y || 0) - rect.height}px`;
    }
  }, [position]);

  return (
    <>
      <div className="fixed inset-0 z-[10005]" onClick={onClose} />
      <div
        ref={pickerRef}
        className="fixed z-[10006] bg-white rounded-full shadow-xl border px-2 py-1.5 flex items-center gap-0.5"
        style={{ left: position?.x || 0, top: position?.y || 0 }}
      >
        {EMOJI_LIST.map(emoji => (
          <button
            key={emoji}
            onClick={() => { onSelect(emoji); onClose(); }}
            className="w-9 h-9 flex items-center justify-center text-xl hover:bg-gray-100 rounded-full transition-transform hover:scale-125"
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}
