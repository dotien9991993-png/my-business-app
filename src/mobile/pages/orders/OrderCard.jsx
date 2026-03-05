import React from 'react';
import { formatMoney } from '../../utils/formatters';

const ORDER_STATUS = {
  open: { label: 'Mở', cls: 'mord-badge-gray' },
  confirmed: { label: 'Xác nhận', cls: 'mord-badge-blue' },
  completed: { label: 'Hoàn thành', cls: 'mord-badge-green' },
  cancelled: { label: 'Đã hủy', cls: 'mord-badge-red' },
  returned: { label: 'Trả hàng', cls: 'mord-badge-orange' },
  exchanged: { label: 'Đổi hàng', cls: 'mord-badge-purple' },
};

const SHIPPING_STATUS = {
  pending: 'Chờ xử lý',
  packing: 'Đóng gói',
  shipped: 'Đã giao VC',
  in_transit: 'Đang giao',
  delivered: 'Đã giao',
  delivery_failed: 'Giao thất bại',
  returned_to_sender: 'Hoàn về',
  pickup: 'Lấy tại shop',
};

const PAYMENT_STATUS = {
  unpaid: { label: 'Chưa TT', cls: 'mord-pay-unpaid' },
  partial: { label: 'TT 1 phần', cls: 'mord-pay-partial' },
  partial_paid: { label: 'TT 1 phần', cls: 'mord-pay-partial' },
  paid: { label: 'Đã TT', cls: 'mord-pay-paid' },
  refunded: { label: 'Hoàn tiền', cls: 'mord-pay-refund' },
  partial_refunded: { label: 'Hoàn 1 phần', cls: 'mord-pay-refund' },
};

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit',
    timeZone: 'Asia/Ho_Chi_Minh'
  });
};

export default function OrderCard({ order, onClick }) {
  const status = ORDER_STATUS[order.order_status] || ORDER_STATUS.open;
  const payment = PAYMENT_STATUS[order.payment_status] || PAYMENT_STATUS.unpaid;
  const shipping = SHIPPING_STATUS[order.shipping_status] || '';

  return (
    <button className="mord-card" onClick={onClick}>
      <div className="mord-card-top">
        <span className="mord-card-code">{order.order_number}</span>
        <span className={`mord-badge ${status.cls}`}>{status.label}</span>
      </div>

      <div className="mord-card-customer">
        <span className="mord-card-name">{order.customer_name || 'Khách lẻ'}</span>
        {order.customer_phone && (
          <a
            className="mord-card-phone"
            href={`tel:${order.customer_phone}`}
            onClick={e => e.stopPropagation()}
          >
            📞 {order.customer_phone}
          </a>
        )}
      </div>

      <div className="mord-card-bottom">
        <div className="mord-card-left">
          <span className="mord-card-amount">{formatMoney(order.total_amount)}</span>
          <span className={`mord-pay-badge ${payment.cls}`}>{payment.label}</span>
        </div>
        <div className="mord-card-right">
          {shipping && <span className="mord-card-shipping">{shipping}</span>}
          <span className="mord-card-date">{formatDate(order.created_at)}</span>
        </div>
      </div>
    </button>
  );
}
