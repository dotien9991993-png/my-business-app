import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { isAdmin } from '../../utils/permissionUtils';

const PAGE_SIZE = 50;

const MODULE_LABELS = {
  warehouse: 'Kho',
  sales: 'Sale',
  finance: 'Tài chính',
  hrm: 'Nhân sự',
  warranty: 'Bảo hành',
  technical: 'Kỹ thuật',
  media: 'Media',
  auth: 'Hệ thống',
  settings: 'Cài đặt'
};

const ACTION_LABELS = {
  create: 'Tạo mới',
  update: 'Cập nhật',
  delete: 'Xóa',
  approve: 'Duyệt',
  reject: 'Từ chối',
  cancel: 'Hủy',
  import: 'Import',
  login: 'Đăng nhập',
  logout: 'Đăng xuất',
  payment: 'Thanh toán',
  shipping: 'Vận chuyển',
  print: 'In',
  return: 'Trả hàng',
};

const ACTION_COLORS = {
  create: 'bg-green-100 text-green-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  approve: 'bg-emerald-100 text-emerald-700',
  reject: 'bg-orange-100 text-orange-700',
  cancel: 'bg-gray-100 text-gray-700',
  import: 'bg-purple-100 text-purple-700',
  login: 'bg-cyan-100 text-cyan-700',
  logout: 'bg-slate-100 text-slate-700',
  payment: 'bg-yellow-100 text-yellow-700',
  shipping: 'bg-indigo-100 text-indigo-700',
  print: 'bg-teal-100 text-teal-700',
  return: 'bg-pink-100 text-pink-700',
};

const ACTION_ICONS = {
  create: '+',
  update: '~',
  delete: 'x',
  approve: 'v',
  reject: '!',
  cancel: '-',
  import: '^',
  login: '>',
  logout: '<',
  payment: '$',
  shipping: '→',
  print: 'P',
  return: '←',
};

export default function ActivityLogView({ tenant, currentUser }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  // Filters
  const [filterModule, setFilterModule] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Users list for filter dropdown
  const [userNames, setUserNames] = useState([]);

  const loadLogs = useCallback(async () => {
    if (!tenant) return;
    setLoading(true);
    try {
      let query = supabase
        .from('activity_logs')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterModule) query = query.eq('module', filterModule);
      if (filterAction) query = query.eq('action', filterAction);
      if (filterUser) query = query.eq('user_name', filterUser);
      if (filterDateFrom) query = query.gte('created_at', filterDateFrom + 'T00:00:00');
      if (filterDateTo) query = query.lte('created_at', filterDateTo + 'T23:59:59');
      if (searchTerm) query = query.or(`description.ilike.%${searchTerm}%,entity_name.ilike.%${searchTerm}%`);

      const { data, count, error } = await query;
      if (error) throw error;
      setLogs(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      console.error('Error loading logs:', error);
    }
    setLoading(false);
  }, [tenant, page, filterModule, filterAction, filterUser, filterDateFrom, filterDateTo, searchTerm]);

  // Load unique user names for filter
  useEffect(() => {
    if (!tenant) return;
    supabase
      .from('activity_logs')
      .select('user_name')
      .eq('tenant_id', tenant.id)
      .not('user_name', 'is', null)
      .then(({ data }) => {
        const names = [...new Set((data || []).map(d => d.user_name).filter(Boolean))];
        setUserNames(names.sort());
      });
  }, [tenant]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [filterModule, filterAction, filterUser, filterDateFrom, filterDateTo, searchTerm]);

  // Admin guard
  if (!isAdmin(currentUser)) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-red-800 mb-2">Không có quyền truy cập</h2>
          <p className="text-red-600">Chỉ Admin mới xem được lịch sử hoạt động.</p>
        </div>
      </div>
    );
  }

  // Group logs by date
  const groupedLogs = logs.reduce((groups, log) => {
    const date = new Date(log.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let label;
    if (date.toDateString() === today.toDateString()) {
      label = 'Hôm nay';
    } else if (date.toDateString() === yesterday.toDateString()) {
      label = 'Hôm qua';
    } else {
      label = date.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    if (!groups[label]) groups[label] = [];
    groups[label].push(log);
    return groups;
  }, {});

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const formatTime = (iso) => {
    return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  };

  const renderJsonDiff = (oldData, newData) => {
    if (!oldData && !newData) return null;
    return (
      <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        {oldData && (
          <div className="bg-red-50 rounded p-2 overflow-auto max-h-40">
            <div className="font-semibold text-red-600 mb-1">Dữ liệu cũ:</div>
            <pre className="whitespace-pre-wrap break-all">{JSON.stringify(oldData, null, 2)}</pre>
          </div>
        )}
        {newData && (
          <div className="bg-green-50 rounded p-2 overflow-auto max-h-40">
            <div className="font-semibold text-green-600 mb-1">Dữ liệu mới:</div>
            <pre className="whitespace-pre-wrap break-all">{JSON.stringify(newData, null, 2)}</pre>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
        <h2 className="text-xl md:text-2xl font-bold text-gray-800">Lịch sử hoạt động</h2>
        <div className="text-sm text-gray-500">
          Tổng: {totalCount.toLocaleString('vi-VN')} bản ghi
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border p-3 md:p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 md:gap-3">
          <select
            value={filterModule}
            onChange={e => setFilterModule(e.target.value)}
            className="border rounded-lg px-2 py-2 text-sm"
          >
            <option value="">Module: Tất cả</option>
            {Object.entries(MODULE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <select
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="border rounded-lg px-2 py-2 text-sm"
          >
            <option value="">Hành động: Tất cả</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <select
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
            className="border rounded-lg px-2 py-2 text-sm"
          >
            <option value="">Người dùng: Tất cả</option>
            {userNames.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          <input
            type="date"
            value={filterDateFrom}
            onChange={e => setFilterDateFrom(e.target.value)}
            className="border rounded-lg px-2 py-2 text-sm"
            placeholder="Từ ngày"
          />

          <input
            type="date"
            value={filterDateTo}
            onChange={e => setFilterDateTo(e.target.value)}
            className="border rounded-lg px-2 py-2 text-sm"
            placeholder="Đến ngày"
          />

          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="border rounded-lg px-2 py-2 text-sm"
            placeholder="Tìm kiếm..."
          />
        </div>
      </div>

      {/* Log list */}
      <div className="bg-white rounded-xl shadow-sm border">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Đang tải...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Chưa có hoạt động nào</div>
        ) : (
          Object.entries(groupedLogs).map(([dateLabel, dateLogs]) => (
            <div key={dateLabel}>
              <div className="px-4 py-2 bg-gray-50 border-b font-semibold text-sm text-gray-600 sticky top-0">
                {dateLabel}
              </div>
              {dateLogs.map(log => (
                <div key={log.id} className="border-b last:border-b-0">
                  <button
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-3">
                      {/* Time */}
                      <div className="text-xs text-gray-400 font-mono w-12 flex-shrink-0 pt-0.5">
                        {formatTime(log.created_at)}
                      </div>

                      {/* Action icon */}
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>
                        {ACTION_ICONS[log.action] || '?'}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-sm">
                          <span className="font-medium text-gray-800">{log.user_name || 'Hệ thống'}</span>
                          <span className="text-gray-400">-</span>
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-600'}`}>
                            {ACTION_LABELS[log.action] || log.action}
                          </span>
                          <span className="text-gray-400">-</span>
                          <span className="text-gray-500">{MODULE_LABELS[log.module] || log.module}</span>
                        </div>
                        {log.description && (
                          <div className="text-sm text-gray-600 mt-0.5 truncate">
                            {log.description}
                          </div>
                        )}
                      </div>

                      {/* Expand indicator */}
                      {(log.old_data || log.new_data) && (
                        <div className="text-gray-400 flex-shrink-0 text-xs">
                          {expandedId === log.id ? '▲' : '▼'}
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {expandedId === log.id && (
                    <div className="px-4 pb-3 ml-[4.5rem]">
                      <div className="text-xs text-gray-500 space-y-1">
                        {log.entity_type && <div>Loại: <span className="font-medium">{log.entity_type}</span></div>}
                        {log.entity_id && <div>ID: <span className="font-mono">{log.entity_id}</span></div>}
                        {log.entity_name && <div>Tên: <span className="font-medium">{log.entity_name}</span></div>}
                      </div>
                      {renderJsonDiff(log.old_data, log.new_data)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            &lt;
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let pageNum;
            if (totalPages <= 7) {
              pageNum = i;
            } else if (page < 3) {
              pageNum = i;
            } else if (page > totalPages - 4) {
              pageNum = totalPages - 7 + i;
            } else {
              pageNum = page - 3 + i;
            }
            return (
              <button
                key={pageNum}
                onClick={() => setPage(pageNum)}
                className={`px-3 py-1.5 border rounded-lg text-sm ${
                  page === pageNum ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-gray-50'
                }`}
              >
                {pageNum + 1}
              </button>
            );
          })}
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 hover:bg-gray-50"
          >
            &gt;
          </button>
          <span className="text-sm text-gray-500 ml-2">{PAGE_SIZE} dòng/trang</span>
        </div>
      )}
    </div>
  );
}
