import React from 'react';

const TABS = [
  { id: 'chat', icon: '💬', label: 'Chat' },
  { id: 'orders', icon: '📦', label: 'Đơn hàng' },
  { id: 'media', icon: '🎬', label: 'Video' },
  { id: 'jobs', icon: '🔧', label: 'Kỹ thuật' },
  { id: 'more', icon: '☰', label: 'Khác' },
];

export default function MobileBottomNav({ activeTab, onTabChange, badges = {} }) {
  return (
    <nav className="mobile-bottom-nav">
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`mobile-nav-item ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          <span className="mobile-nav-icon">
            {tab.icon}
            {badges[tab.id] > 0 && (
              <span className="mobile-nav-badge">{badges[tab.id] > 99 ? '99+' : badges[tab.id]}</span>
            )}
          </span>
          <span className="mobile-nav-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
}
