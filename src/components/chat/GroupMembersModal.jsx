import React, { useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';

export default function GroupMembersModal({ room, members, allUsers, currentUser, onClose, onMembersChanged, onLeaveRoom }) {
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState(null);

  const isAdmin = room.created_by === currentUser.name ||
    members.some(m => m.user_id === currentUser.id && m.role === 'admin');

  // Users available to add (not already active members, not inactive/pending/suspended)
  const availableUsers = useMemo(() => {
    const activeMemberIds = new Set(members.map(m => m.user_id));
    const others = (allUsers || []).filter(u =>
      !activeMemberIds.has(u.id) &&
      u.is_active !== false &&
      u.status !== 'pending' &&
      u.status !== 'suspended' &&
      u.status !== 'rejected'
    );
    if (!search.trim()) return others;
    const q = search.toLowerCase();
    return others.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  }, [allUsers, members, search]);

  const toggleUser = (userId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // Remove member
  const handleRemoveMember = async (member) => {
    if (member.user_id === currentUser.id) return;
    if (members.length <= 2) {
      alert('Nhóm phải có ít nhất 2 thành viên!');
      return;
    }
    if (!confirm(`Xoá ${member.user_name} khỏi nhóm?`)) return;

    setRemoving(member.user_id);
    try {
      await supabase
        .from('chat_room_members')
        .update({ is_active: false })
        .eq('room_id', room.id)
        .eq('user_id', member.user_id);

      await supabase.from('chat_messages').insert([{
        room_id: room.id,
        sender_id: currentUser.id,
        sender_name: currentUser.name,
        content: `${currentUser.name} đã xoá ${member.user_name} khỏi nhóm`,
        message_type: 'system'
      }]);

      onMembersChanged?.();
    } catch (err) {
      console.error('Error removing member:', err);
      alert('Lỗi xoá thành viên!');
    } finally {
      setRemoving(null);
    }
  };

  // Add selected members
  const handleAddMembers = async () => {
    if (selectedIds.size === 0) return;
    setAdding(true);
    try {
      // Get all existing memberships (including inactive) for upsert
      const { data: existingMembers } = await supabase
        .from('chat_room_members')
        .select('user_id, is_active')
        .eq('room_id', room.id)
        .in('user_id', Array.from(selectedIds));

      const existingMap = {};
      (existingMembers || []).forEach(m => { existingMap[m.user_id] = m; });

      for (const userId of selectedIds) {
        const user = (allUsers || []).find(u => u.id === userId);
        if (!user) continue;

        if (existingMap[userId]) {
          // Re-activate existing member
          await supabase
            .from('chat_room_members')
            .update({ is_active: true, role: 'member' })
            .eq('room_id', room.id)
            .eq('user_id', userId);
        } else {
          // Insert new member
          await supabase
            .from('chat_room_members')
            .insert([{
              room_id: room.id,
              user_id: userId,
              user_name: user.name,
              user_avatar: user.avatar_url || null,
              role: 'member',
              joined_at: new Date().toISOString()
            }]);
        }

        // System message for each added user
        await supabase.from('chat_messages').insert([{
          room_id: room.id,
          sender_id: currentUser.id,
          sender_name: currentUser.name,
          content: `${currentUser.name} đã thêm ${user.name} vào nhóm`,
          message_type: 'system'
        }]);
      }

      setSelectedIds(new Set());
      setSearch('');
      onMembersChanged?.();
    } catch (err) {
      console.error('Error adding members:', err);
      alert('Lỗi thêm thành viên!');
    } finally {
      setAdding(false);
    }
  };

  // Leave room with admin validation
  const handleLeave = async () => {
    const adminCount = members.filter(m => m.role === 'admin').length;
    const isSelfAdmin = members.some(m => m.user_id === currentUser.id && m.role === 'admin');
    if (isSelfAdmin && adminCount === 1 && members.length > 1) {
      alert('Bạn là admin duy nhất. Vui lòng chuyển quyền admin trước khi rời nhóm!');
      return;
    }
    // Last member → deactivate room
    if (members.length === 1) {
      if (!confirm('Bạn là người cuối cùng. Rời nhóm sẽ xoá nhóm chat này?')) return;
      try {
        await supabase
          .from('chat_room_members')
          .update({ is_active: false })
          .eq('room_id', room.id)
          .eq('user_id', currentUser.id);
        await supabase
          .from('chat_rooms')
          .update({ is_active: false })
          .eq('id', room.id);
        onMembersChanged?.();
      } catch (err) {
        console.error('Error deactivating room:', err);
      }
      return;
    }
    onLeaveRoom?.();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[10001] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-sm max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-bold text-gray-800">Quản lý thành viên</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Section 1: Current members */}
          <div className="px-4 py-2 border-b">
            <div className="text-xs font-medium text-gray-500 mb-2">
              Thành viên ({members.length})
            </div>
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-2 py-1.5">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs flex-shrink-0 overflow-hidden">
                  {m.user_avatar ? (
                    <img src={m.user_avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    (m.user_name || '?').charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-gray-800 truncate block">{m.user_name}</span>
                </div>
                {m.role === 'admin' ? (
                  <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">Admin</span>
                ) : (
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Thành viên</span>
                )}
                {isAdmin && m.user_id !== currentUser.id && (
                  <button
                    onClick={() => handleRemoveMember(m)}
                    disabled={removing === m.user_id}
                    className="text-gray-400 hover:text-red-500 text-sm disabled:opacity-50 p-0.5"
                    title="Xoá khỏi nhóm"
                  >
                    {removing === m.user_id ? '...' : '✕'}
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Section 2: Add members (admin only) */}
          {isAdmin && (
            <div className="px-4 py-2">
              <div className="text-xs font-medium text-gray-500 mb-2">Thêm thành viên</div>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tìm tên hoặc email..."
                className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-2"
              />
              <div className="max-h-40 overflow-y-auto">
                {availableUsers.length === 0 ? (
                  <div className="text-xs text-gray-400 text-center py-3">
                    {search.trim() ? 'Không tìm thấy' : 'Tất cả đã trong nhóm'}
                  </div>
                ) : (
                  availableUsers.map(user => (
                    <button
                      key={user.id}
                      onClick={() => toggleUser(user.id)}
                      className={`w-full flex items-center gap-2 px-2 py-2 hover:bg-gray-50 rounded-lg transition-colors text-left ${
                        selectedIds.has(user.id) ? 'bg-green-50' : ''
                      }`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedIds.has(user.id) ? 'bg-green-600 border-green-600' : 'border-gray-300'
                      }`}>
                        {selectedIds.has(user.id) && <span className="text-white text-xs">✓</span>}
                      </div>
                      <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs flex-shrink-0 overflow-hidden">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                        ) : (
                          (user.name || '?').charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-800 truncate">{user.name}</div>
                        <div className="text-xs text-gray-400 truncate">{user.team || user.role}</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
              {selectedIds.size > 0 && (
                <button
                  onClick={handleAddMembers}
                  disabled={adding}
                  className="w-full mt-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {adding ? 'Đang thêm...' : `Thêm ${selectedIds.size} người`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t flex items-center justify-between">
          <button
            onClick={handleLeave}
            className="text-sm text-red-600 hover:text-red-700 font-medium"
          >
            Rời nhóm
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
