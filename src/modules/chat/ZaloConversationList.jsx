import React, { useState, useMemo } from 'react';

const FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'waiting', label: 'Chờ trả lời' },
  { id: 'mine', label: 'Của tôi' },
  { id: 'resolved', label: 'Đã xử lý' },
];

const TAG_COLORS = {
  'VIP': 'bg-yellow-100 text-yellow-700',
  'Mới': 'bg-blue-100 text-blue-700',
  'Khiếu nại': 'bg-red-100 text-red-700',
  'Tư vấn': 'bg-green-100 text-green-700',
  'Đơn hàng': 'bg-purple-100 text-purple-700',
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const d = new Date(dateStr);
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'vừa xong';
  if (diff < 3600) return `${Math.floor(diff / 60)}ph`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export default function ZaloConversationList({
  conversations,
  currentUser,
  selectedId,
  onSelect,
  onRefresh,
}) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = [...(conversations || [])];

    // Filter
    if (filter === 'waiting') {
      list = list.filter(c => c.status === 'waiting');
    } else if (filter === 'mine') {
      list = list.filter(c => c.assigned_to === currentUser?.id);
    } else if (filter === 'resolved') {
      list = list.filter(c => c.status === 'resolved');
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.zalo_user_name || '').toLowerCase().includes(q) ||
        (c.customer_phone || '').includes(q)
      );
    }

    // Sort: unread first, then by last_message_at desc
    list.sort((a, b) => {
      if ((a.unread_count || 0) > 0 && !(b.unread_count > 0)) return -1;
      if ((b.unread_count || 0) > 0 && !(a.unread_count > 0)) return 1;
      return new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at);
    });

    return list;
  }, [conversations, filter, search, currentUser?.id]);

  const counts = useMemo(() => {
    const all = conversations || [];
    return {
      all: all.length,
      waiting: all.filter(c => c.status === 'waiting').length,
      mine: all.filter(c => c.assigned_to === currentUser?.id).length,
      resolved: all.filter(c => c.status === 'resolved').length,
    };
  }, [conversations, currentUser?.id]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold text-gray-800 text-sm">Tin nhắn Zalo</h3>
          <button onClick={onRefresh} className="p-1 hover:bg-gray-100 rounded" title="Làm mới">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm khách hàng..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
          />
          <svg className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 overflow-x-auto">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-2 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
                filter === f.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
              {counts[f.id] > 0 && (
                <span className="ml-1 opacity-80">({counts[f.id]})</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">
            Không có hội thoại nào
          </div>
        ) : (
          filtered.map(conv => (
            <div
              key={conv.id}
              onClick={() => onSelect(conv)}
              className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-50 transition-colors ${
                selectedId === conv.id
                  ? 'bg-blue-50 border-l-2 border-l-blue-500'
                  : 'hover:bg-gray-50'
              }`}
            >
              {/* Avatar */}
              <div className="relative flex-shrink-0">
                {conv.zalo_user_avatar ? (
                  <img src={conv.zalo_user_avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm">
                    {(conv.zalo_user_name || 'K')[0].toUpperCase()}
                  </div>
                )}
                {conv.status === 'waiting' && (
                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-orange-400 rounded-full border-2 border-white" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-sm truncate ${conv.unread_count > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                    {conv.zalo_user_name || 'Khách hàng'}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-1">
                    {timeAgo(conv.last_message_at)}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <p className={`text-xs truncate flex-1 ${conv.unread_count > 0 ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                    {conv.last_message_by === 'staff' && <span className="text-gray-400">Bạn: </span>}
                    {conv.last_message || 'Chưa có tin nhắn'}
                  </p>
                  {conv.unread_count > 0 && (
                    <span className="flex-shrink-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                      {conv.unread_count > 9 ? '9+' : conv.unread_count}
                    </span>
                  )}
                </div>

                {/* Tags */}
                {conv.tags?.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {conv.tags.slice(0, 3).map(tag => (
                      <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded ${TAG_COLORS[tag] || 'bg-gray-100 text-gray-600'}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Assigned */}
                {conv.assigned_name && (
                  <span className="text-[10px] text-gray-400 mt-0.5 block">
                    {conv.assigned_to === currentUser?.id ? 'Bạn phụ trách' : conv.assigned_name}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
