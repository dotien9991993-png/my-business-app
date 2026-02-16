import React, { useState, useMemo } from 'react';

export default function ChatGroupModal({ allUsers, currentUser, onCreate, onClose }) {
  const [groupName, setGroupName] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  // Danh sách user khác (loại chính mình)
  const availableUsers = useMemo(() => {
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

  const toggleUser = (userId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleCreate = async () => {
    if (!groupName.trim()) {
      alert('Vui lòng nhập tên nhóm!');
      return;
    }
    if (selectedIds.size < 1) {
      alert('Vui lòng chọn ít nhất 1 thành viên!');
      return;
    }
    setCreating(true);
    try {
      await onCreate(groupName.trim(), Array.from(selectedIds));
    } finally {
      setCreating(false);
    }
  };

  const selectedUsers = (allUsers || []).filter(u => selectedIds.has(u.id));

  return (
    <div className="fixed inset-0 bg-black/40 z-[10001] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-bold text-gray-800">👥 Tạo nhóm chat</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {/* Group name */}
        <div className="px-4 py-2 border-b">
          <input
            type="text"
            value={groupName}
            onChange={e => setGroupName(e.target.value)}
            placeholder="Tên nhóm..."
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            autoFocus
          />
        </div>

        {/* Selected chips */}
        {selectedUsers.length > 0 && (
          <div className="px-4 py-2 border-b flex flex-wrap gap-1">
            {selectedUsers.map(u => (
              <span key={u.id} className="inline-flex items-center gap-1 bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full">
                {u.name}
                <button onClick={() => toggleUser(u.id)} className="hover:text-red-600">&times;</button>
              </span>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="px-4 py-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm thành viên..."
            className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* User list with checkboxes */}
        <div className="flex-1 overflow-y-auto">
          {availableUsers.map(user => (
            <button
              key={user.id}
              onClick={() => toggleUser(user.id)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left ${
                selectedIds.has(user.id) ? 'bg-green-50' : ''
              }`}
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                selectedIds.has(user.id) ? 'bg-green-600 border-green-600' : 'border-gray-300'
              }`}>
                {selectedIds.has(user.id) && <span className="text-white text-xs">✓</span>}
              </div>
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs flex-shrink-0">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  (user.name || '?').charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 text-sm truncate">{user.name}</div>
                <div className="text-xs text-gray-400 truncate">{user.team || user.role}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Đã chọn {selectedIds.size} thành viên
          </span>
          <button
            onClick={handleCreate}
            disabled={creating || !groupName.trim() || selectedIds.size < 1}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Đang tạo...' : 'Tạo nhóm'}
          </button>
        </div>
      </div>
    </div>
  );
}
