import React, { useState } from 'react';
import { formatMoney } from '../../utils/formatters';

const ORDER_STATUS = {
  open: { label: 'Mở', icon: '📝' },
  confirmed: { label: 'Xác nhận', icon: '✅' },
  completed: { label: 'Hoàn thành', icon: '🎉' },
  cancelled: { label: 'Đã hủy', icon: '❌' },
  returned: { label: 'Trả hàng', icon: '↩️' },
  exchanged: { label: 'Đổi hàng', icon: '🔄' },
};

const SHIPPING_STATUS = {
  pending: { label: 'Chờ xử lý', icon: '⏳' },
  packing: { label: 'Đóng gói', icon: '📦' },
  shipped: { label: 'Đã giao VC', icon: '🚚' },
  in_transit: { label: 'Đang giao', icon: '🛵' },
  delivered: { label: 'Đã giao', icon: '📬' },
  delivery_failed: { label: 'Giao thất bại', icon: '⚠️' },
  returned_to_sender: { label: 'Hoàn về', icon: '↩️' },
  pickup: { label: 'Lấy tại shop', icon: '🏪' },
};

const PAYMENT_STATUS = {
  unpaid: { label: 'Chưa thanh toán', icon: '💰' },
  partial: { label: 'TT 1 phần', icon: '💳' },
  partial_paid: { label: 'TT 1 phần', icon: '💳' },
  paid: { label: 'Đã thanh toán', icon: '✅' },
  refunded: { label: 'Đã hoàn tiền', icon: '💸' },
  partial_refunded: { label: 'Hoàn 1 phần', icon: '↩️' },
};

const PAYMENT_METHODS = {
  cash: 'Tiền mặt',
  transfer: 'Chuyển khoản',
  cod: 'COD',
  debt: 'Công nợ',
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
};

export default function OrderDetail({ order, detail, loading, onBack }) {
  const [expandSection, setExpandSection] = useState({ items: true, payment: false, shipping: false });

  const toggleSection = (key) => {
    setExpandSection(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const status = ORDER_STATUS[order.order_status] || ORDER_STATUS.open;
  const shipping = SHIPPING_STATUS[order.shipping_status] || SHIPPING_STATUS.pending;
  const payment = PAYMENT_STATUS[order.payment_status] || PAYMENT_STATUS.unpaid;

  const items = detail?.items || [];
  const payments = detail?.payments || [];

  const remaining = (order.total_amount || 0) - (order.paid_amount || 0);

  return (
    <div className="mobile-page mord-detail-page">
      {/* Header */}
      <div className="mord-detail-header">
        <button className="mord-detail-back" onClick={onBack}>← Quay lại</button>
        <span className="mord-detail-code">{order.order_number}</span>
      </div>

      {/* Status badges */}
      <div className="mord-detail-statuses">
        <span className="mord-detail-status">{status.icon} {status.label}</span>
        <span className="mord-detail-status">{shipping.icon} {shipping.label}</span>
        <span className="mord-detail-status">{payment.icon} {payment.label}</span>
      </div>

      {/* Customer info */}
      <div className="mord-section">
        <h3 className="mord-section-title">👤 Khách hàng</h3>
        <div className="mord-section-body">
          <div className="mord-info-row">
            <span>Tên</span>
            <span className="mord-info-val">{order.customer_name || 'Khách lẻ'}</span>
          </div>
          {order.customer_phone && (
            <div className="mord-info-row">
              <span>SĐT</span>
              <a className="mord-info-val mord-link" href={`tel:${order.customer_phone}`}>
                {order.customer_phone}
              </a>
            </div>
          )}
          {order.shipping_address && (
            <div className="mord-info-row">
              <span>Địa chỉ</span>
              <span className="mord-info-val mord-info-address">{order.shipping_address}</span>
            </div>
          )}
        </div>
      </div>

      {/* Order summary */}
      <div className="mord-section">
        <div className="mord-summary-grid">
          <div className="mord-summary-item">
            <span className="mord-summary-label">Tổng tiền</span>
            <span className="mord-summary-val primary">{formatMoney(order.total_amount)}</span>
          </div>
          <div className="mord-summary-item">
            <span className="mord-summary-label">Đã thanh toán</span>
            <span className="mord-summary-val green">{formatMoney(order.paid_amount)}</span>
          </div>
          {remaining > 0 && (
            <div className="mord-summary-item">
              <span className="mord-summary-label">Còn lại</span>
              <span className="mord-summary-val red">{formatMoney(remaining)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Items - expandable */}
      <div className="mord-section">
        <button className="mord-section-title mord-section-toggle" onClick={() => toggleSection('items')}>
          📦 Sản phẩm ({items.length})
          <span>{expandSection.items ? '▼' : '▶'}</span>
        </button>
        {expandSection.items && (
          <div className="mord-section-body">
            {loading ? (
              <div className="mord-loading-text">Đang tải...</div>
            ) : items.length === 0 ? (
              <div className="mord-loading-text">Không có sản phẩm</div>
            ) : (
              items.map((item, i) => (
                <div key={i} className="mord-item-row">
                  <div className="mord-item-info">
                    <span className="mord-item-name">{item.product_name}</span>
                    {item.variant_name && <span className="mord-item-variant">{item.variant_name}</span>}
                    <span className="mord-item-price">{formatMoney(item.unit_price)} × {item.quantity}</span>
                  </div>
                  <span className="mord-item-subtotal">{formatMoney(item.subtotal)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Payment history - expandable */}
      <div className="mord-section">
        <button className="mord-section-title mord-section-toggle" onClick={() => toggleSection('payment')}>
          💳 Thanh toán ({payments.length})
          <span>{expandSection.payment ? '▼' : '▶'}</span>
        </button>
        {expandSection.payment && (
          <div className="mord-section-body">
            {payments.length === 0 ? (
              <div className="mord-loading-text">Chưa có thanh toán</div>
            ) : (
              payments.map((p, i) => (
                <div key={i} className="mord-payment-row">
                  <div className="mord-payment-info">
                    <span className="mord-payment-method">
                      {PAYMENT_METHODS[p.payment_method] || p.payment_method}
                    </span>
                    <span className="mord-payment-date">{formatDateTime(p.created_at)}</span>
                    {p.note && <span className="mord-payment-note">{p.note}</span>}
                  </div>
                  <span className="mord-payment-amount">{formatMoney(p.amount)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Shipping info - expandable */}
      <div className="mord-section">
        <button className="mord-section-title mord-section-toggle" onClick={() => toggleSection('shipping')}>
          🚚 Vận chuyển
          <span>{expandSection.shipping ? '▼' : '▶'}</span>
        </button>
        {expandSection.shipping && (
          <div className="mord-section-body">
            <div className="mord-info-row">
              <span>Đơn vị VC</span>
              <span className="mord-info-val">{order.shipping_provider || '—'}</span>
            </div>
            {order.tracking_number && (
              <div className="mord-info-row">
                <span>Mã vận đơn</span>
                <span className="mord-info-val">{order.tracking_number}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Meta */}
      <div className="mord-meta">
        <span>Tạo bởi: {order.created_by}</span>
        <span>{formatDateTime(order.created_at)}</span>
      </div>
      {order.note && (
        <div className="mord-note">
          📝 {order.note}
        </div>
      )}
    </div>
  );
}
