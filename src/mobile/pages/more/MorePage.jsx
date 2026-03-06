import React from 'react';

export default function MorePage({ user, tenantId, onNavigate, onLogout }) {
  return (
    <div className="mobile-page">
      <div className="mobile-placeholder">
        <span className="mobile-placeholder-icon">☰</span>
        <h2>Khác</h2>
        <p>Đang phát triển...</p>
      </div>
    </div>
  );
}
