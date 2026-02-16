import React, { useEffect, useRef } from 'react';

export default function MentionPopup({ members, search, onSelect, position }) {
  const popupRef = useRef(null);

  const filtered = (members || []).filter(m => {
    if (!search) return true;
    return m.user_name?.toLowerCase().includes(search.toLowerCase());
  });

  // Add "Tat ca" option at top
  const options = [
    { user_id: 'all', user_name: 'Tat ca', isAll: true },
    ...filtered
  ];

  // Adjust position to stay in viewport
  useEffect(() => {
    if (!popupRef.current) return;
    const rect = popupRef.current.getBoundingClientRect();
    const vh = window.innerHeight;
    if (rect.bottom > vh - 10) {
      popupRef.current.style.bottom = `${position.bottom || 60}px`;
      popupRef.current.style.top = 'auto';
    }
  }, [position]);

  if (options.length <= 1 && search) return null;

  return (
    <div
      ref={popupRef}
      className="absolute z-50 bg-white rounded-xl shadow-xl border py-1 w-56 max-h-48 overflow-y-auto"
      style={{
        left: position.left || 8,
        bottom: position.bottom || 60
      }}
    >
      {options.map(member => (
        <button
          key={member.user_id}
          onClick={() => onSelect(member)}
          className="w-full text-left px-3 py-2 text-sm hover:bg-green-50 flex items-center gap-2 transition-colors"
        >
          <span className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-xs text-green-700 font-bold flex-shrink-0">
            {member.isAll ? '@' : (member.user_name || '?').charAt(0).toUpperCase()}
          </span>
          <span className={`truncate ${member.isAll ? 'font-semibold text-green-700' : 'text-gray-700'}`}>
            {member.isAll ? '@Tat ca' : member.user_name}
          </span>
        </button>
      ))}
      {filtered.length === 0 && search && (
        <div className="px-3 py-2 text-xs text-gray-400 text-center">
          Khong tim thay
        </div>
      )}
    </div>
  );
}
