import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import {
  getZaloConfig, getTemplates, fillTemplate,
  getMessageHistory, getMessageStats, sendZaloMessage, sendPendingMessages,
  queueZaloMessage, ZALO_MSG_TYPES, ZALO_MSG_STATUSES
} from '../../utils/zaloOA';
import {
  checkWarrantyReminders, checkBirthdayGreetings, checkWinBackCustomers
} from '../../utils/zaloAutomation';

const formatMoney = (amount) => {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('vi-VN').format(num) + 'đ';
};

const formatDateTimeVN = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

const formatDateVN = (dateStr) => {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

// ================================================================
// MAIN COMPONENT
// ================================================================
export default function ZaloOASettings({ tenant, currentUser }) {
  const [activeView, setActiveView] = useState('config'); // config, templates, history
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl md:text-2xl font-bold text-gray-800">📱 Zalo OA</h2>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {[
          { id: 'config', label: '⚙️ Cấu hình' },
          { id: 'templates', label: '📝 Kịch bản' },
          { id: 'history', label: '📊 Lịch sử gửi' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveView(tab.id)}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeView === tab.id
                ? 'bg-white text-green-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Views */}
      {activeView === 'config' && <ConfigView tenant={tenant} setToast={setToast} />}
      {activeView === 'templates' && <TemplatesView tenant={tenant} currentUser={currentUser} setToast={setToast} />}
      {activeView === 'history' && <HistoryView tenant={tenant} setToast={setToast} />}
    </div>
  );
}

// ================================================================
// CONFIG VIEW - Cấu hình kết nối Zalo OA
// ================================================================
function ConfigView({ tenant, setToast }) {
  const [config, setConfig] = useState({
    app_id: '', secret_key: '', oa_id: '', refresh_token: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [configId, setConfigId] = useState(null);

  // Load config
  useEffect(() => {
    const load = async () => {
      const data = await getZaloConfig(tenant.id);
      if (data) {
        setConfig({
          app_id: data.app_id || '',
          secret_key: data.secret_key || '',
          oa_id: data.oa_id || '',
          refresh_token: data.refresh_token || '',
        });
        setConfigId(data.id);
      }
      setLoading(false);
    };
    load();
  }, [tenant.id]);

  const isConnected = Boolean(config.app_id && config.secret_key && config.oa_id);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        tenant_id: tenant.id,
        app_id: config.app_id.trim(),
        secret_key: config.secret_key.trim(),
        oa_id: config.oa_id.trim(),
        refresh_token: config.refresh_token.trim(),
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (configId) {
        const { error } = await supabase.from('zalo_config').update(payload).eq('id', configId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('zalo_config').insert([payload]).select().single();
        if (error) throw error;
        setConfigId(data.id);
      }
      setToast({ type: 'success', msg: 'Đã lưu cấu hình Zalo OA' });
    } catch (err) {
      setToast({ type: 'error', msg: 'Lỗi lưu: ' + (err.message || '') });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-8 text-gray-400">Đang tải...</div>;

  return (
    <div className="space-y-4">
      {/* Connection status */}
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${
        isConnected ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
      }`}>
        <span className="text-2xl">{isConnected ? '🟢' : '🔴'}</span>
        <div>
          <div className="font-medium text-gray-800">
            {isConnected ? 'Đã cấu hình Zalo OA' : 'Chưa kết nối Zalo OA'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {isConnected
              ? 'Điền Refresh Token và cấu hình kịch bản gửi tin tự động'
              : 'Vui lòng điền thông tin từ Zalo Developers Console'
            }
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-green-700 flex items-center gap-2">
          🔑 Thông tin kết nối
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">App ID</label>
            <input
              type="text"
              value={config.app_id}
              onChange={e => setConfig(p => ({ ...p, app_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
              placeholder="Nhập App ID từ Zalo Developers"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">OA ID</label>
            <input
              type="text"
              value={config.oa_id}
              onChange={e => setConfig(p => ({ ...p, oa_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
              placeholder="Nhập OA ID"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Secret Key</label>
            <div className="relative">
              <input
                type={showSecret ? 'text' : 'password'}
                value={config.secret_key}
                onChange={e => setConfig(p => ({ ...p, secret_key: e.target.value }))}
                className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                placeholder="Nhập Secret Key"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showSecret ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Refresh Token</label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={config.refresh_token}
                onChange={e => setConfig(p => ({ ...p, refresh_token: e.target.value }))}
                className="w-full px-3 py-2 pr-10 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
                placeholder="Nhập Refresh Token"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showToken ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
        </div>
      </div>

      {/* Hướng dẫn */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <h4 className="text-sm font-semibold text-blue-800 mb-2">📖 Hướng dẫn lấy thông tin</h4>
        <ol className="text-xs text-blue-700 space-y-1.5 list-decimal list-inside">
          <li>Truy cập <strong>developers.zalo.me</strong> → Đăng nhập</li>
          <li>Tạo ứng dụng mới hoặc chọn ứng dụng có sẵn</li>
          <li>Vào <strong>Cài đặt</strong> → Sao chép <strong>App ID</strong> và <strong>Secret Key</strong></li>
          <li>Vào <strong>Sản phẩm → Zalo OA</strong> → Liên kết OA → Sao chép <strong>OA ID</strong></li>
          <li>Vào <strong>Tools → API Explorer</strong> → Lấy <strong>Refresh Token</strong></li>
          <li>Dán tất cả vào form trên và bấm <strong>Lưu cấu hình</strong></li>
        </ol>
      </div>
    </div>
  );
}

// ================================================================
// TEMPLATES VIEW - Quản lý kịch bản gửi tin
// ================================================================
function TemplatesView({ tenant, currentUser, setToast }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editContent, setEditContent] = useState('');
  const [automating, setAutomating] = useState(null); // type đang chạy

  // Load templates
  const loadTemplates = useCallback(async () => {
    const data = await getTemplates(tenant.id);
    setTemplates(data);
    setLoading(false);
  }, [tenant.id]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // Save template
  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    try {
      const { error } = await supabase
        .from('zalo_templates')
        .update({ content: editContent })
        .eq('id', editingTemplate.id);
      if (error) throw error;
      setToast({ type: 'success', msg: 'Đã lưu kịch bản' });
      setEditingTemplate(null);
      loadTemplates();
    } catch (err) {
      setToast({ type: 'error', msg: 'Lỗi lưu: ' + err.message });
    }
  };

  // Toggle active
  const handleToggleActive = async (tpl) => {
    try {
      const { error } = await supabase
        .from('zalo_templates')
        .update({ is_active: !tpl.is_active })
        .eq('id', tpl.id);
      if (error) throw error;
      loadTemplates();
    } catch (err) {
      setToast({ type: 'error', msg: 'Lỗi: ' + err.message });
    }
  };

  // Test gửi
  const handleTest = async (tpl) => {
    const phone = prompt('Nhập SĐT nhận test (VD: 0973515666):');
    if (!phone?.trim()) return;

    const sampleData = {
      customer_name: currentUser?.name || 'Khách Test',
      order_code: 'DH-TEST-001',
      total_amount: '11.500.000đ',
      products: 'Loa KP12, Micro G6Plus',
      carrier: 'Viettel Post',
      tracking_code: 'VP123456789',
      estimated_date: 'Trong 2-3 ngày',
      product_name: 'Loa KP12',
      warranty_end_date: '15/03/2026',
      days_remaining: '27',
      discount_percent: '10',
      voucher_code: 'TEST2026',
      voucher_expiry: '15/03/2026',
    };

    const content = fillTemplate(tpl.content, sampleData);
    const result = await queueZaloMessage({
      tenantId: tenant.id,
      templateId: tpl.id,
      customerName: 'Test - ' + (currentUser?.name || 'Admin'),
      customerPhone: phone.trim(),
      type: tpl.type,
      content,
    });

    if (result) {
      setToast({ type: 'success', msg: `Đã tạo tin nhắn test đến ${phone}` });
    } else {
      setToast({ type: 'error', msg: 'Lỗi tạo tin nhắn test' });
    }
  };

  // Chạy kịch bản tự động
  const handleRunAutomation = async (type) => {
    setAutomating(type);
    try {
      let queued = 0;
      if (type === 'warranty_remind') queued = await checkWarrantyReminders(tenant.id);
      else if (type === 'birthday') queued = await checkBirthdayGreetings(tenant.id);
      else if (type === 'win_back') queued = await checkWinBackCustomers(tenant.id);

      if (queued > 0) {
        setToast({ type: 'success', msg: `Đã tạo ${queued} tin nhắn chờ gửi` });
      } else {
        setToast({ type: 'success', msg: 'Không có khách hàng nào cần gửi' });
      }
    } catch (err) {
      setToast({ type: 'error', msg: 'Lỗi: ' + err.message });
    } finally {
      setAutomating(null);
    }
  };

  const triggerDescriptions = {
    order_confirm: 'Gửi tự động khi tạo đơn hàng mới',
    shipping: 'Gửi khi đơn hàng chuyển trạng thái "Đang giao"',
    warranty_remind: 'Gửi cho KH có bảo hành sắp hết (30 ngày)',
    birthday: 'Gửi cho KH có sinh nhật hôm nay',
    win_back: 'Gửi cho KH > 60 ngày không mua hàng',
  };

  if (loading) return <div className="text-center py-8 text-gray-400">Đang tải...</div>;

  return (
    <div className="space-y-3">
      {templates.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">📝</div>
          <div className="text-sm">Chưa có kịch bản. Chạy SQL migration để tạo templates mặc định.</div>
        </div>
      ) : templates.map(tpl => {
        const typeInfo = ZALO_MSG_TYPES[tpl.type] || { label: tpl.type, icon: '📝', color: 'gray' };
        const canAutoRun = ['warranty_remind', 'birthday', 'win_back'].includes(tpl.type);

        return (
          <div key={tpl.id} className={`bg-white rounded-xl border p-4 ${
            tpl.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
          }`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg">{typeInfo.icon}</span>
                  <span className="font-medium text-gray-800 text-sm">{tpl.name}</span>
                  <button
                    onClick={() => handleToggleActive(tpl)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                      tpl.is_active
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-gray-50 text-gray-500 border-gray-200'
                    }`}
                  >
                    {tpl.is_active ? '✅ Bật' : '⏸️ Tắt'}
                  </button>
                </div>
                <div className="text-[11px] text-gray-400 mt-1">
                  {triggerDescriptions[tpl.type] || ''}
                </div>
                {/* Preview */}
                <div className="mt-2 bg-gray-50 rounded-lg p-3 text-xs text-gray-600 whitespace-pre-wrap border border-gray-100 max-h-24 overflow-hidden">
                  {tpl.content}
                </div>
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  onClick={() => { setEditingTemplate(tpl); setEditContent(tpl.content); }}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  ✏️ Sửa
                </button>
                <button
                  onClick={() => handleTest(tpl)}
                  className="px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                >
                  🧪 Test
                </button>
                {canAutoRun && (
                  <button
                    onClick={() => handleRunAutomation(tpl.type)}
                    disabled={automating === tpl.type}
                    className="px-3 py-1.5 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-50"
                  >
                    {automating === tpl.type ? '⏳' : '▶️'} Chạy
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Edit template modal */}
      {editingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-gray-800">✏️ Sửa kịch bản: {editingTemplate.name}</h3>
              <button onClick={() => setEditingTemplate(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Nội dung tin nhắn
                  <span className="text-gray-400 ml-2">
                    Dùng {'{{tên_biến}}'} cho placeholder
                  </span>
                </label>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none font-mono"
                />
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Biến có sẵn:</div>
                <div className="flex flex-wrap gap-1">
                  {getPlaceholders(editingTemplate.type).map(p => (
                    <span key={p} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-mono border border-blue-100">
                      {`{{${p}}}`}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-3 border-t">
              <button onClick={() => setEditingTemplate(null)} className="px-4 py-2 text-sm text-gray-600">Huỷ</button>
              <button
                onClick={handleSaveTemplate}
                className="px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ================================================================
// HISTORY VIEW - Lịch sử gửi tin
// ================================================================
function HistoryView({ tenant, setToast }) {
  const [messages, setMessages] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [stats, setStats] = useState({ total: 0, sent: 0, failed: 0, read: 0 });
  const [sendingAll, setSendingAll] = useState(false);

  const PAGE_SIZE = 20;

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    const [historyResult, statsResult] = await Promise.all([
      getMessageHistory(tenant.id, { status: filterStatus, type: filterType, page, pageSize: PAGE_SIZE }),
      getMessageStats(tenant.id, new Date().toISOString().slice(0, 7)),
    ]);
    setMessages(historyResult.data);
    setTotalCount(historyResult.count);
    setStats(statsResult);
    setLoading(false);
  }, [tenant.id, filterStatus, filterType, page]);

  useEffect(() => { loadData(); }, [loadData]);

  // Gửi 1 tin
  const handleSend = async (msg) => {
    const ok = await sendZaloMessage(msg.id);
    if (ok) {
      setToast({ type: 'success', msg: 'Đã gửi tin nhắn' });
      loadData();
    } else {
      setToast({ type: 'error', msg: 'Lỗi gửi tin nhắn' });
    }
  };

  // Gửi tất cả pending
  const handleSendAll = async () => {
    if (!confirm('Gửi tất cả tin nhắn đang chờ?')) return;
    setSendingAll(true);
    const result = await sendPendingMessages(tenant.id);
    setToast({ type: 'success', msg: `Đã gửi ${result.sent} tin, lỗi ${result.failed} tin` });
    setSendingAll(false);
    loadData();
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const pendingCount = messages.filter(m => m.status === 'pending').length;

  return (
    <div className="space-y-4">
      {/* Thống kê tháng */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Tổng gửi" value={stats.total} color="gray" />
        <StatCard label="Thành công" value={stats.sent} sub={stats.total > 0 ? `${((stats.sent / stats.total) * 100).toFixed(1)}%` : '0%'} color="green" />
        <StatCard label="Thất bại" value={stats.failed} sub={stats.total > 0 ? `${((stats.failed / stats.total) * 100).toFixed(1)}%` : '0%'} color="red" />
        <StatCard label="Đã đọc" value={stats.read} sub={stats.sent > 0 ? `${((stats.read / stats.sent) * 100).toFixed(1)}%` : '0%'} color="blue" />
      </div>

      {/* Filters + Actions */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <select
          value={filterType}
          onChange={e => { setFilterType(e.target.value); setPage(0); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
        >
          <option value="all">Tất cả loại</option>
          {Object.entries(ZALO_MSG_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(0); }}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-green-500 outline-none"
        >
          <option value="all">Tất cả trạng thái</option>
          {Object.entries(ZALO_MSG_STATUSES).map(([k, v]) => (
            <option key={k} value={k}>{v.icon} {v.label}</option>
          ))}
        </select>
        <div className="flex-1" />
        <button
          onClick={handleSendAll}
          disabled={sendingAll}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          {sendingAll ? '⏳ Đang gửi...' : `📤 Gửi tất cả chờ (${stats.total - stats.sent - stats.failed})`}
        </button>
      </div>

      {/* Message list */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Đang tải...</div>
      ) : messages.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-2">📭</div>
          <div className="text-sm">Chưa có tin nhắn nào</div>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-left">
                  <th className="px-4 py-3 font-medium">Thời gian</th>
                  <th className="px-4 py-3 font-medium">Khách hàng</th>
                  <th className="px-4 py-3 font-medium">SĐT</th>
                  <th className="px-4 py-3 font-medium">Loại</th>
                  <th className="px-4 py-3 font-medium">Nội dung</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                  <th className="px-4 py-3 font-medium text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {messages.map(msg => {
                  const typeInfo = ZALO_MSG_TYPES[msg.type] || { icon: '📝', label: msg.type };
                  const statusInfo = ZALO_MSG_STATUSES[msg.status] || { icon: '❓', label: msg.status };
                  return (
                    <tr key={msg.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                        {formatDateTimeVN(msg.created_at)}
                      </td>
                      <td className="px-4 py-3 text-gray-800 font-medium">
                        {msg.customer_name || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {msg.customer_phone || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs">{typeInfo.icon} {typeInfo.label}</span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-[200px] truncate">
                        {msg.content}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={msg.status} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {msg.status === 'pending' && (
                          <button
                            onClick={() => handleSend(msg)}
                            className="text-green-600 hover:text-green-800 text-xs font-medium"
                          >
                            📤 Gửi
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {messages.map(msg => {
              const typeInfo = ZALO_MSG_TYPES[msg.type] || { icon: '📝', label: msg.type };
              return (
                <div key={msg.id} className="bg-white rounded-xl border border-gray-200 p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800 text-sm">{msg.customer_name || '-'}</span>
                        <StatusBadge status={msg.status} />
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {msg.customer_phone} · {typeInfo.icon} {typeInfo.label}
                      </div>
                      <div className="text-xs text-gray-500 mt-1 line-clamp-2">{msg.content}</div>
                      <div className="text-[10px] text-gray-400 mt-1">{formatDateTimeVN(msg.created_at)}</div>
                    </div>
                    {msg.status === 'pending' && (
                      <button
                        onClick={() => handleSend(msg)}
                        className="ml-2 px-3 py-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-lg font-medium"
                      >
                        📤 Gửi
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-30 hover:bg-gray-50"
              >
                ← Trước
              </button>
              <span className="text-sm text-gray-500">
                Trang {page + 1}/{totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-30 hover:bg-gray-50"
              >
                Sau →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ================================================================
// SUB COMPONENTS
// ================================================================

function StatCard({ label, value, sub, color }) {
  const colors = {
    gray: 'border-gray-100',
    green: 'border-green-100',
    red: 'border-red-100',
    blue: 'border-blue-100',
  };
  const textColors = {
    gray: 'text-gray-800',
    green: 'text-green-700',
    red: 'text-red-700',
    blue: 'text-blue-700',
  };
  return (
    <div className={`bg-white rounded-xl p-4 shadow-sm border ${colors[color] || colors.gray}`}>
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${textColors[color] || textColors.gray}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function StatusBadge({ status }) {
  const info = ZALO_MSG_STATUSES[status] || { icon: '❓', label: status || '-' };
  const colors = {
    pending: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    sent: 'bg-green-100 text-green-700 border-green-200',
    failed: 'bg-red-100 text-red-700 border-red-200',
    delivered: 'bg-blue-100 text-blue-700 border-blue-200',
    read: 'bg-green-100 text-green-700 border-green-200',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${colors[status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
      {info.icon} {info.label}
    </span>
  );
}

function getPlaceholders(type) {
  const map = {
    order_confirm: ['customer_name', 'order_code', 'total_amount', 'products'],
    shipping: ['customer_name', 'order_code', 'carrier', 'tracking_code', 'estimated_date'],
    warranty_remind: ['customer_name', 'product_name', 'warranty_end_date', 'days_remaining'],
    birthday: ['customer_name', 'discount_percent', 'voucher_code', 'voucher_expiry'],
    win_back: ['customer_name', 'discount_percent', 'voucher_code'],
  };
  return map[type] || ['customer_name'];
}
