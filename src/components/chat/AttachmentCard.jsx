import React from 'react';

const formatMoney = (n) => {
  if (!n && n !== 0) return '';
  return new Intl.NumberFormat('vi-VN').format(n) + 'đ';
};

const TYPE_CONFIG = {
  order: { icon: '📦', label: 'ĐƠN HÀNG', module: 'sales', tab: 'orders' },
  task: { icon: '🎬', label: 'VIDEO TASK', module: 'media', tab: 'tasks' },
  product: { icon: '📦', label: 'SẢN PHẨM', module: 'warehouse', tab: 'inventory' },
  customer: { icon: '👥', label: 'KHÁCH HÀNG', module: 'sales', tab: 'customers' },
  technical_job: { icon: '🔧', label: 'KỸ THUẬT', module: 'technical', tab: 'jobs' },
  warranty: { icon: '🛡️', label: 'BẢO HÀNH', module: 'warranty', tab: 'cards' }
};

export default function AttachmentCard({ attachment, isOwn, onNavigate }) {
  if (!attachment) return null;

  const config = TYPE_CONFIG[attachment.type] || { icon: '📎', label: 'ĐÍNH KÈM' };

  const handleClick = (e) => {
    e.stopPropagation();
    if (onNavigate && config.module) {
      onNavigate(config.module, config.tab);
    }
  };

  return (
    <div
      className={`rounded-lg p-2.5 mt-1 mb-0.5 cursor-pointer transition-colors border ${
        isOwn
          ? 'bg-green-900/30 border-green-400/30 hover:bg-green-900/40'
          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
      }`}
      onClick={handleClick}
    >
      {/* Type label */}
      <div className={`text-[10px] font-bold tracking-wide mb-1 ${isOwn ? 'text-green-200' : 'text-gray-400'}`}>
        {config.icon} {config.label}
      </div>

      {/* Title */}
      <div className={`text-sm font-medium ${isOwn ? 'text-white' : 'text-gray-900'}`}>
        {attachment.title}
      </div>

      {/* Subtitle */}
      {attachment.subtitle && (
        <div className={`text-xs mt-0.5 ${isOwn ? 'text-green-200' : 'text-gray-500'}`}>
          {attachment.subtitle}
        </div>
      )}

      {/* Amount + Status */}
      <div className="flex items-center justify-between mt-1">
        <div className={`text-xs ${isOwn ? 'text-green-200' : 'text-gray-500'}`}>
          {attachment.amount ? `💰 ${formatMoney(attachment.amount)}` : ''}
          {attachment.due_date && !attachment.amount ? `📅 ${new Date(attachment.due_date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' })}` : ''}
        </div>
        <div className={`text-[11px] ${isOwn ? 'text-green-200' : 'text-gray-500'}`}>
          {attachment.status_label}
        </div>
      </div>

      {/* View detail link */}
      <div className={`text-[11px] mt-1 text-right font-medium ${isOwn ? 'text-green-300' : 'text-green-600'}`}>
        Xem chi tiết →
      </div>
    </div>
  );
}
