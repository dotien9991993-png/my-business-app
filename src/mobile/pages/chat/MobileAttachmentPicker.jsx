import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../supabaseClient';

const formatMoney = (n) => {
  if (!n && n !== 0) return '';
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ';
};

const formatDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
};

const ORDER_STATUS = {
  new: '🆕 Mới', confirmed: '✅ Xác nhận', packing: '📦 Đóng gói', shipping: '🚚 Đang giao',
  delivered: '📬 Đã giao', completed: '✅ Hoàn thành', returned: '↩️ Hoàn trả', cancelled: '❌ Đã hủy'
};

const TASK_STATUS = {
  'Nháp': '📝 Nháp', 'Đang làm': '🟡 Đang làm', 'Chờ duyệt': '🔵 Chờ duyệt',
  'Hoàn thành': '✅ Hoàn thành', 'Quá hạn': '🔴 Quá hạn'
};

const JOB_STATUS = {
  'Chờ XN': '⏳ Chờ XN', 'Đã XN': '✅ Đã XN', 'Đang làm': '🟡 Đang làm',
  'Hoàn thành': '✅ Hoàn thành', 'Hủy': '❌ Hủy'
};

const WARRANTY_STATUS = {
  active: '✅ Còn hạn', expired: '❌ Hết hạn', voided: '🚫 Đã hủy'
};

const ATTACHMENT_TYPES = [
  { type: 'order', icon: '📦', label: 'Đơn hàng', table: 'orders', searchFields: ['order_number', 'customer_name'] },
  { type: 'task', icon: '🎬', label: 'Video / Task', table: 'tasks', searchFields: ['title', 'assignee'] },
  { type: 'product', icon: '📦', label: 'Sản phẩm', table: 'products', searchFields: ['name', 'sku'] },
  { type: 'customer', icon: '👥', label: 'Khách hàng', table: 'customers', searchFields: ['name', 'phone'] },
  { type: 'technical_job', icon: '🔧', label: 'Phiếu kỹ thuật', table: 'technical_jobs', searchFields: ['title', 'customer_name'] },
  { type: 'warranty', icon: '🛡️', label: 'Phiếu bảo hành', table: 'warranty_cards', searchFields: ['card_number', 'customer_name', 'product_name'] }
];

function buildAttachment(type, item) {
  switch (type) {
    case 'order':
      return { type: 'order', id: item.id, title: item.order_number || 'Đơn hàng', subtitle: `KH: ${item.customer_name || 'N/A'}`, amount: item.total_amount, status_label: ORDER_STATUS[item.status] || item.status };
    case 'task':
      return { type: 'task', id: item.id, title: item.title || 'Task', subtitle: `Gán: ${item.assignee || 'Chưa gán'}`, status_label: TASK_STATUS[item.status] || item.status };
    case 'product':
      return { type: 'product', id: item.id, title: item.name || 'Sản phẩm', subtitle: item.sku ? `SKU: ${item.sku}` : '', status_label: item.stock_quantity > 0 ? `Tồn: ${item.stock_quantity}` : '⚠️ Hết hàng' };
    case 'customer':
      return { type: 'customer', id: item.id, title: item.name || 'Khách hàng', subtitle: item.phone || item.email || '' };
    case 'technical_job':
      return { type: 'technical_job', id: item.id, title: item.title || 'Phiếu kỹ thuật', subtitle: `KH: ${item.customer_name || 'N/A'}`, status_label: JOB_STATUS[item.status] || item.status };
    case 'warranty':
      return { type: 'warranty', id: item.id, title: item.card_number || 'Phiếu BH', subtitle: `${item.product_name || ''} · ${item.customer_name || ''}`, status_label: WARRANTY_STATUS[item.status] || item.status };
    default:
      return null;
  }
}

function SearchModal({ config, tenantId, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadItems = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      let query = supabase.from(config.table).select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(30);
      if (config.type === 'product') query = query.eq('is_active', true);
      const { data, error } = await query;
      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error(`Error loading ${config.type}:`, err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, config.table, config.type]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const filtered = items.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return config.searchFields.some(f => (item[f] || '').toLowerCase().includes(q));
  });

  return (
    <div className="matt-picker-overlay" onClick={onClose}>
      <div className="matt-picker-sheet" onClick={e => e.stopPropagation()}>
        <div className="matt-picker-header">
          <button className="matt-picker-back" onClick={onClose}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span>{config.icon} Chọn {config.label.toLowerCase()}</span>
        </div>
        <div className="matt-picker-search">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Tìm ${config.label.toLowerCase()}...`}
            autoFocus
          />
        </div>
        <div className="matt-picker-list">
          {loading ? (
            <div className="matt-picker-empty">Đang tải...</div>
          ) : filtered.length === 0 ? (
            <div className="matt-picker-empty">{search ? 'Không tìm thấy' : 'Chưa có dữ liệu'}</div>
          ) : (
            filtered.map(item => {
              const att = buildAttachment(config.type, item);
              return (
                <button key={item.id} className="matt-picker-item" onClick={() => { if (att) onSelect(att); }}>
                  <div className="matt-picker-item-title">{att?.title}</div>
                  <div className="matt-picker-item-sub">{att?.subtitle}{att?.status_label ? ` · ${att.status_label}` : ''}</div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function MobileAttachmentPicker({ tenantId, onSelect, onImageClick, onFileClick, onClose }) {
  const [activeType, setActiveType] = useState(null);

  if (activeType) {
    const config = ATTACHMENT_TYPES.find(t => t.type === activeType);
    if (config) {
      return (
        <SearchModal
          config={config}
          tenantId={tenantId}
          onSelect={(att) => { setActiveType(null); onSelect(att); }}
          onClose={() => setActiveType(null)}
        />
      );
    }
  }

  return (
    <>
      <div className="matt-picker-overlay" onClick={onClose} />
      <div className="matt-attach-menu">
        <div className="matt-attach-menu-title">Đính kèm</div>
        {ATTACHMENT_TYPES.map(t => (
          <button key={t.type} className="matt-attach-menu-item" onClick={() => setActiveType(t.type)}>
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
        <div className="matt-attach-menu-divider" />
        <button className="matt-attach-menu-item" onClick={() => { onImageClick?.(); onClose(); }}>
          <span>🖼️</span> Chọn ảnh
        </button>
        <button className="matt-attach-menu-item" onClick={() => { onFileClick?.(); onClose(); }}>
          <span>📄</span> File (PDF, Excel, Word)
        </button>
      </div>
    </>
  );
}
