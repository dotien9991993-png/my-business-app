import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';
import { getChatImageUrl, isCloudinaryUrl } from '../../utils/cloudinaryUpload';

const SEARCH_TABS = [
  { id: 'messages', label: 'Tin nhắn', icon: '💬' },
  { id: 'files', label: 'File', icon: '📄' },
  { id: 'images', label: 'Ảnh', icon: '🖼️' },
  { id: 'entities', label: 'Entity', icon: '📎' },
];

const TIME_FILTERS = [
  { id: 'all', label: 'Tất cả' },
  { id: 'today', label: 'Hôm nay' },
  { id: '7days', label: '7 ngày' },
  { id: '30days', label: '30 ngày' },
];

const TYPE_ICONS = {
  order: '📦', task: '🎬', product: '📦', customer: '👥',
  technical_job: '🔧', warranty: '🛡️',
};

const PAGE_SIZE = 20;

const formatSearchTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit',
    day: '2-digit', month: '2-digit', year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
};

const getFileUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  const { data } = supabase.storage.from('chat-files').getPublicUrl(path);
  return data?.publicUrl || path;
};

function HighlightText({ text, keyword }) {
  if (!keyword || !text) return <span>{text}</span>;
  const parts = text.split(new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <span>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase()
          ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5">{part}</mark>
          : part
      )}
    </span>
  );
}

export default function ChatSearchPanel({
  rooms,
  currentUser,
  allUsers,
  onSelectRoom,
  onClose,
}) {
  const { tenant } = useApp();
  const [activeTab, setActiveTab] = useState('messages');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);

  // Filters
  const [filterSenders, setFilterSenders] = useState([]);
  const [filterRooms, setFilterRooms] = useState([]);
  const [filterTime, setFilterTime] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // Dropdowns
  const [showSenderDropdown, setShowSenderDropdown] = useState(false);
  const [showRoomDropdown, setShowRoomDropdown] = useState(false);

  // Image preview
  const [previewUrl, setPreviewUrl] = useState(null);

  const inputRef = useRef(null);
  const searchTimeoutRef = useRef(null);
  const resultsRef = useRef(null);

  const roomIds = useMemo(() => rooms.map(r => r.id), [rooms]);

  const getRoomName = useCallback((roomId) => {
    const room = rooms.find(r => r.id === roomId);
    if (!room) return 'Phòng chat';
    if (room.type === 'group') return room.name || 'Nhóm chat';
    const other = (room.members || []).find(m => m.user_id !== currentUser?.id);
    return other?.user_name || 'Chat';
  }, [rooms, currentUser]);

  const getDateRange = useCallback(() => {
    if (filterTime === 'all') return {};
    const now = new Date();
    if (filterTime === 'today') {
      const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
      today.setHours(0, 0, 0, 0);
      return { from: today.toISOString() };
    }
    if (filterTime === '7days') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return { from: d.toISOString() };
    }
    if (filterTime === '30days') {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      return { from: d.toISOString() };
    }
    return {};
  }, [filterTime]);

  const searchMessages = useCallback(async (resetPage = true) => {
    if (!query.trim() && activeTab === 'messages') return;
    if (roomIds.length === 0) return;

    setLoading(true);
    if (resetPage) { setPage(0); setResults([]); }
    const currentPage = resetPage ? 0 : page;

    try {
      const dateRange = getDateRange();
      const targetRoomIds = filterRooms.length > 0 ? filterRooms : roomIds;

      let dbQuery = supabase
        .from('chat_messages')
        .select('*', { count: 'exact' })
        .in('room_id', targetRoomIds)
        .eq('is_deleted', false)
        .neq('message_type', 'system')
        .order('created_at', { ascending: false })
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

      if (activeTab === 'messages') {
        if (query.trim()) dbQuery = dbQuery.ilike('content', `%${query.trim()}%`);
      } else if (activeTab === 'files') {
        dbQuery = dbQuery.eq('message_type', 'file');
        if (query.trim()) dbQuery = dbQuery.ilike('file_name', `%${query.trim()}%`);
      } else if (activeTab === 'images') {
        dbQuery = dbQuery.eq('message_type', 'image');
      } else if (activeTab === 'entities') {
        dbQuery = dbQuery.not('attachments', 'eq', '[]').not('attachments', 'is', null);
        if (query.trim()) dbQuery = dbQuery.ilike('content', `%${query.trim()}%`);
      }

      if (filterSenders.length > 0) {
        dbQuery = dbQuery.in('sender_id', filterSenders);
      }
      if (dateRange.from) {
        dbQuery = dbQuery.gte('created_at', dateRange.from);
      }

      const { data, count, error } = await dbQuery;
      if (error) throw error;

      if (resetPage) {
        setResults(data || []);
      } else {
        setResults(prev => [...prev, ...(data || [])]);
      }
      setTotalCount(count || 0);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  }, [query, activeTab, roomIds, filterSenders, filterRooms, getDateRange, page]);

  // Debounced search on query change
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!query.trim() && activeTab === 'messages') {
      setResults([]);
      setTotalCount(0);
      return;
    }
    searchTimeoutRef.current = setTimeout(() => {
      searchMessages(true);
    }, 400);
    return () => { if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, activeTab, filterSenders, filterRooms, filterTime]);

  // Auto-search for non-message tabs (files, images, entities)
  useEffect(() => {
    if (activeTab !== 'messages') {
      searchMessages(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const loadMore = () => {
    if (loading || results.length >= totalCount) return;
    setPage(prev => prev + 1);
  };

  useEffect(() => {
    if (page > 0) searchMessages(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Handle scroll to load more
  const handleScroll = useCallback(() => {
    const el = resultsRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      loadMore();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, results.length, totalCount]);

  const handleResultClick = (msg) => {
    const room = rooms.find(r => r.id === msg.room_id);
    if (room) {
      onSelectRoom(room, msg.id);
      onClose();
    }
  };

  const toggleSender = (userId) => {
    setFilterSenders(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const toggleRoom = (roomId) => {
    setFilterRooms(prev =>
      prev.includes(roomId) ? prev.filter(id => id !== roomId) : [...prev, roomId]
    );
  };

  const activeUsers = useMemo(() =>
    (allUsers || []).filter(u => u.is_active !== false && u.id !== currentUser?.id),
    [allUsers, currentUser]
  );

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Tìm kiếm tin nhắn, file..."
              className="w-full pl-8 pr-8 py-2 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              autoFocus
            />
            <svg className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 text-sm flex-shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-2">
          {SEARCH_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2.5 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`text-xs flex items-center gap-1 px-2 py-1 rounded transition-colors ${
            showFilters || filterSenders.length > 0 || filterRooms.length > 0 || filterTime !== 'all'
              ? 'text-green-700 bg-green-50'
              : 'text-gray-500 hover:bg-gray-100'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Bộ lọc
          {(filterSenders.length > 0 || filterRooms.length > 0 || filterTime !== 'all') && (
            <span className="bg-green-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
              {filterSenders.length + filterRooms.length + (filterTime !== 'all' ? 1 : 0)}
            </span>
          )}
        </button>

        {/* Filters */}
        {showFilters && (
          <div className="mt-2 space-y-2 pb-1">
            {/* Sender filter */}
            <div className="relative">
              <button
                onClick={() => { setShowSenderDropdown(!showSenderDropdown); setShowRoomDropdown(false); }}
                className="text-xs px-2 py-1.5 border rounded-lg w-full text-left flex items-center justify-between hover:bg-gray-50"
              >
                <span className="text-gray-600">
                  {filterSenders.length > 0
                    ? `${filterSenders.length} người gửi`
                    : 'Người gửi: Tất cả'}
                </span>
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showSenderDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowSenderDropdown(false)} />
                  <div className="absolute left-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-20 w-full max-h-40 overflow-y-auto py-1">
                    {activeUsers.map(u => (
                      <button
                        key={u.id}
                        onClick={() => toggleSender(u.id)}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${
                          filterSenders.includes(u.id) ? 'bg-green-50' : ''
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[8px] ${
                          filterSenders.includes(u.id) ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300'
                        }`}>
                          {filterSenders.includes(u.id) && '✓'}
                        </span>
                        {u.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Room filter */}
            <div className="relative">
              <button
                onClick={() => { setShowRoomDropdown(!showRoomDropdown); setShowSenderDropdown(false); }}
                className="text-xs px-2 py-1.5 border rounded-lg w-full text-left flex items-center justify-between hover:bg-gray-50"
              >
                <span className="text-gray-600">
                  {filterRooms.length > 0
                    ? `${filterRooms.length} phòng chat`
                    : 'Phòng chat: Tất cả'}
                </span>
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showRoomDropdown && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowRoomDropdown(false)} />
                  <div className="absolute left-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-20 w-full max-h-40 overflow-y-auto py-1">
                    {rooms.map(r => (
                      <button
                        key={r.id}
                        onClick={() => toggleRoom(r.id)}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2 ${
                          filterRooms.includes(r.id) ? 'bg-green-50' : ''
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[8px] ${
                          filterRooms.includes(r.id) ? 'bg-green-600 border-green-600 text-white' : 'border-gray-300'
                        }`}>
                          {filterRooms.includes(r.id) && '✓'}
                        </span>
                        {r.type === 'group' ? (r.name || 'Nhóm chat') : getRoomName(r.id)}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Time filter */}
            <div className="flex gap-1 flex-wrap">
              {TIME_FILTERS.map(tf => (
                <button
                  key={tf.id}
                  onClick={() => setFilterTime(tf.id)}
                  className={`px-2 py-1 text-xs rounded-full transition-colors ${
                    filterTime === tf.id
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tf.label}
                </button>
              ))}
            </div>

            {/* Clear filters */}
            {(filterSenders.length > 0 || filterRooms.length > 0 || filterTime !== 'all') && (
              <button
                onClick={() => { setFilterSenders([]); setFilterRooms([]); setFilterTime('all'); }}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Xoá bộ lọc
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results count */}
      {(results.length > 0 || loading) && (
        <div className="px-3 py-1.5 text-xs text-gray-500 border-b flex-shrink-0">
          {loading && results.length === 0
            ? 'Đang tìm...'
            : `Tìm thấy ${totalCount.toLocaleString('vi-VN')} ${activeTab === 'images' ? 'ảnh' : activeTab === 'files' ? 'file' : activeTab === 'entities' ? 'entity' : 'tin nhắn'}`
          }
        </div>
      )}

      {/* Results */}
      <div ref={resultsRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {loading && results.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full mx-auto mb-2" />
            Đang tìm kiếm...
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            {query || activeTab !== 'messages'
              ? 'Không tìm thấy kết quả'
              : 'Nhập từ khoá để tìm kiếm'}
          </div>
        ) : (
          <>
            {activeTab === 'images' ? (
              /* Image grid */
              <div className="grid grid-cols-3 gap-1 p-2">
                {results.map(msg => {
                  const url = msg.file_url;
                  const displayUrl = url && isCloudinaryUrl(url) ? getChatImageUrl(url) : getFileUrl(url);
                  const fullUrl = getFileUrl(url);
                  return (
                    <div
                      key={msg.id}
                      className="aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-80 transition-opacity relative group"
                      onClick={() => setPreviewUrl(fullUrl)}
                    >
                      <img src={displayUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-white text-[10px] truncate">{msg.sender_name}</p>
                        <p className="text-white/70 text-[9px]">{getRoomName(msg.room_id)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : activeTab === 'entities' ? (
              /* Entity list */
              <div className="divide-y">
                {results.map(msg => {
                  const attachments = msg.attachments || [];
                  return attachments.map((att, idx) => (
                    <button
                      key={`${msg.id}-${idx}`}
                      onClick={() => handleResultClick(msg)}
                      className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{TYPE_ICONS[att.type] || '📎'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{att.title || att.type}</p>
                          <p className="text-xs text-gray-500 truncate">{att.subtitle || ''}</p>
                          <p className="text-[10px] text-gray-400">
                            {msg.sender_name} · {getRoomName(msg.room_id)} · {formatSearchTime(msg.created_at)}
                          </p>
                        </div>
                        {att.status_label && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{att.status_label}</span>
                        )}
                      </div>
                    </button>
                  ));
                })}
              </div>
            ) : (
              /* Messages / Files list */
              <div className="divide-y">
                {results.map(msg => (
                  <button
                    key={msg.id}
                    onClick={() => activeTab === 'files' ? window.open(getFileUrl(msg.file_url), '_blank') : handleResultClick(msg)}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-2.5">
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold text-xs flex-shrink-0">
                        {(msg.sender_name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Meta */}
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-0.5">
                          <span className="font-medium text-gray-700">{msg.sender_name}</span>
                          <span>·</span>
                          <span className="truncate">{getRoomName(msg.room_id)}</span>
                          <span>·</span>
                          <span className="flex-shrink-0">{formatSearchTime(msg.created_at)}</span>
                        </div>
                        {/* Content */}
                        {activeTab === 'files' ? (
                          <div className="flex items-center gap-2">
                            <span className="text-lg">📎</span>
                            <div className="min-w-0">
                              <p className="text-sm text-gray-800 truncate">
                                <HighlightText text={msg.file_name || 'Tệp đính kèm'} keyword={query} />
                              </p>
                              {msg.file_size && (
                                <p className="text-[10px] text-gray-400">
                                  {msg.file_size < 1024 * 1024
                                    ? (msg.file_size / 1024).toFixed(1) + ' KB'
                                    : (msg.file_size / (1024 * 1024)).toFixed(1) + ' MB'}
                                </p>
                              )}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-700 line-clamp-2">
                            <HighlightText text={msg.content || ''} keyword={query} />
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Loading more */}
            {loading && results.length > 0 && (
              <div className="text-center py-3 text-gray-400 text-xs">Đang tải thêm...</div>
            )}

            {/* End of results */}
            {!loading && results.length >= totalCount && results.length > 0 && (
              <div className="text-center py-3 text-gray-400 text-xs">Hết kết quả</div>
            )}
          </>
        )}
      </div>

      {/* Image preview */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/80 z-[10001] flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          <button onClick={() => setPreviewUrl(null)} className="absolute top-4 right-4 text-white text-3xl hover:text-gray-300">&times;</button>
          <img src={previewUrl} alt="" className="max-w-full max-h-full object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
