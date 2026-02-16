import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';

const formatMoney = (n) => {
  if (!n && n !== 0) return '';
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ';
};

const formatDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
};

// Status configs
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

// Attachment type config
const ATTACHMENT_TYPES = [
  { type: 'order', icon: '📦', label: 'Đơn hàng', table: 'orders', searchFields: ['order_number', 'customer_name'] },
  { type: 'task', icon: '🎬', label: 'Video / Task', table: 'tasks', searchFields: ['title', 'assignee'] },
  { type: 'product', icon: '📦', label: 'Sản phẩm', table: 'products', searchFields: ['name', 'sku'] },
  { type: 'customer', icon: '👥', label: 'Khách hàng', table: 'customers', searchFields: ['name', 'phone'] },
  { type: 'technical_job', icon: '🔧', label: 'Phiếu kỹ thuật', table: 'technical_jobs', searchFields: ['title', 'customer_name'] },
  { type: 'warranty', icon: '🛡️', label: 'Phiếu bảo hành', table: 'warranty_cards', searchFields: ['card_number', 'customer_name', 'product_name'] }
];

// Build attachment object from raw data
function buildAttachment(type, item) {
  switch (type) {
    case 'order':
      return {
        type: 'order', id: item.id,
        title: item.order_number || 'Đơn hàng',
        subtitle: `KH: ${item.customer_name || 'N/A'}`,
        amount: item.total_amount,
        status: item.status,
        status_label: ORDER_STATUS[item.status] || item.status
      };
    case 'task':
      return {
        type: 'task', id: item.id,
        title: item.title || 'Task',
        subtitle: `Gán: ${item.assignee || 'Chưa gán'}`,
        status: item.status,
        status_label: TASK_STATUS[item.status] || item.status,
        due_date: item.due_date
      };
    case 'product':
      return {
        type: 'product', id: item.id,
        title: item.name || 'Sản phẩm',
        subtitle: item.sku ? `SKU: ${item.sku}` : '',
        amount: item.sell_price,
        status: item.stock_quantity > 0 ? 'in_stock' : 'out_of_stock',
        status_label: item.stock_quantity > 0 ? `Tồn: ${item.stock_quantity}` : '⚠️ Hết hàng'
      };
    case 'customer':
      return {
        type: 'customer', id: item.id,
        title: item.name || 'Khách hàng',
        subtitle: item.phone || item.email || '',
        status: 'active',
        status_label: item.phone || ''
      };
    case 'technical_job':
      return {
        type: 'technical_job', id: item.id,
        title: item.title || 'Phiếu kỹ thuật',
        subtitle: `KH: ${item.customer_name || 'N/A'}`,
        status: item.status,
        status_label: JOB_STATUS[item.status] || item.status,
        due_date: item.scheduled_date
      };
    case 'warranty':
      return {
        type: 'warranty', id: item.id,
        title: item.card_number || 'Phiếu BH',
        subtitle: `${item.product_name || ''} · ${item.customer_name || ''}`,
        status: item.status,
        status_label: WARRANTY_STATUS[item.status] || item.status,
        due_date: item.warranty_end
      };
    default:
      return null;
  }
}

// Search modal for a specific type
function SearchModal({ config, onSelect, onClose }) {
  const { tenant } = useApp();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadItems = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    try {
      let query = supabase
        .from(config.table)
        .select('*')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(30);

      // Active filter for products
      if (config.type === 'product') {
        query = query.eq('is_active', true);
      }

      const { data, error } = await query;
      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error(`Error loading ${config.type}:`, err);
    } finally {
      setLoading(false);
    }
  }, [tenant?.id, config.table, config.type]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // Client-side search filter
  const filtered = items.filter(item => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return config.searchFields.some(f => (item[f] || '').toLowerCase().includes(q));
  });

  const handleSelect = (item) => {
    const attachment = buildAttachment(config.type, item);
    if (attachment) onSelect(attachment);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[10002] flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full md:max-w-md md:rounded-xl rounded-t-xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <span>{config.icon}</span>
            <span className="font-bold text-sm">Chọn {config.label.toLowerCase()}</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Tìm ${config.label.toLowerCase()}...`}
            className="w-full px-3 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            autoFocus
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">Đang tải...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">
              {search ? 'Không tìm thấy' : 'Chưa có dữ liệu'}
            </div>
          ) : (
            filtered.map(item => (
              <button
                key={item.id}
                onClick={() => handleSelect(item)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 transition-colors"
              >
                <ItemPreview type={config.type} item={item} />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Item preview renders for each type
function ItemPreview({ type, item }) {
  switch (type) {
    case 'order':
      return (
        <div>
          <div className="font-medium text-sm">{item.order_number}</div>
          <div className="text-xs text-gray-500 mt-0.5">KH: {item.customer_name || 'N/A'} · {formatMoney(item.total_amount)}</div>
          <div className="text-xs mt-0.5">{ORDER_STATUS[item.status] || item.status} · {formatDate(item.created_at)}</div>
        </div>
      );
    case 'task':
      return (
        <div>
          <div className="font-medium text-sm">{item.title}</div>
          <div className="text-xs text-gray-500 mt-0.5">Gán: {item.assignee || 'Chưa gán'} · HSD: {formatDate(item.due_date)}</div>
          <div className="text-xs mt-0.5">{TASK_STATUS[item.status] || item.status}</div>
        </div>
      );
    case 'product':
      return (
        <div>
          <div className="font-medium text-sm">{item.name}</div>
          <div className="text-xs text-gray-500 mt-0.5">{item.sku ? `SKU: ${item.sku} · ` : ''}Giá: {formatMoney(item.sell_price)}</div>
          <div className="text-xs mt-0.5">Tồn: {item.stock_quantity ?? 0} {item.stock_quantity <= 0 ? '⚠️ Hết hàng' : ''}</div>
        </div>
      );
    case 'customer':
      return (
        <div>
          <div className="font-medium text-sm">{item.name}</div>
          <div className="text-xs text-gray-500 mt-0.5">{item.phone || ''}{item.email ? ` · ${item.email}` : ''}</div>
        </div>
      );
    case 'technical_job':
      return (
        <div>
          <div className="font-medium text-sm">{item.title}</div>
          <div className="text-xs text-gray-500 mt-0.5">KH: {item.customer_name || 'N/A'} · {formatDate(item.scheduled_date)}</div>
          <div className="text-xs mt-0.5">{JOB_STATUS[item.status] || item.status}</div>
        </div>
      );
    case 'warranty':
      return (
        <div>
          <div className="font-medium text-sm">{item.card_number}</div>
          <div className="text-xs text-gray-500 mt-0.5">{item.product_name} · {item.customer_name}</div>
          <div className="text-xs mt-0.5">{WARRANTY_STATUS[item.status] || item.status} · HSD: {formatDate(item.warranty_end)}</div>
        </div>
      );
    default:
      return null;
  }
}

// Main component: attachment type menu
export default function AttachmentPicker({ onSelect, onFileClick, onImageClick, onClose }) {
  const [activeType, setActiveType] = useState(null);

  const handleSelect = (attachment) => {
    setActiveType(null);
    onSelect(attachment);
  };

  // If a search modal is open
  if (activeType) {
    const config = ATTACHMENT_TYPES.find(t => t.type === activeType);
    if (config) {
      return <SearchModal config={config} onSelect={handleSelect} onClose={() => setActiveType(null)} />;
    }
  }

  // Menu
  return (
    <>
      <div className="fixed inset-0 z-[10001]" onClick={onClose} />
      <div className="absolute bottom-full left-0 mb-2 bg-white rounded-xl shadow-xl border z-[10002] py-2 w-52">
        <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b mb-1">Đính kèm</div>
        {ATTACHMENT_TYPES.map(t => (
          <button
            key={t.type}
            onClick={() => setActiveType(t.type)}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors"
          >
            <span>{t.icon}</span> {t.label}
          </button>
        ))}
        <div className="border-t mt-1 pt-1">
          <button
            onClick={() => { onImageClick?.(); onClose(); }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors"
          >
            🖼️ Chọn ảnh
          </button>
          <button
            onClick={() => { onFileClick(); onClose(); }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors"
          >
            📄 File (PDF, Excel, Word)
          </button>
        </div>
      </div>
    </>
  );
}
