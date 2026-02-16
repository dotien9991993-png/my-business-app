import React, { useState, useMemo } from 'react';

export default function NewChatModal({ allUsers, currentUser, onSelectUser, onClose }) {
  const [search, setSearch] = useState('');

  // Danh sách user khác (loại chính mình)
  const filteredUsers = useMemo(() => {
    const others = (allUsers || []).filter(u =>
      u.id !== currentUser?.id &&
      u.is_active !== false &&
      u.status !== 'pending' &&
      u.status !== 'suspended' &&
      u.status !== 'rejected'
    );
    if (!search.trim()) return others;
    const q = search.toLowerCase();
    return others.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.team?.toLowerCase().includes(q)
    );
  }, [allUsers, currentUser, search]);

  return (
    <div className="fixed inset-0 bg-black/40 z-[10001] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm max-h-[70vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-bold text-gray-800">💬 Chat mới</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên, email..."
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            autoFocus
          />
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto">
          {filteredUsers.length === 0 ? (
            <div className="text-center text-gray-400 py-8 text-sm">
              Không tìm thấy nhân viên
            </div>
          ) : (
            filteredUsers.map(user => (
              <button
                key={user.id}
                onClick={() => onSelectUser(user)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm flex-shrink-0">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    (user.name || '?').charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-800 text-sm truncate">{user.name}</div>
                  <div className="text-xs text-gray-400 truncate">{user.team || user.role || user.email}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
