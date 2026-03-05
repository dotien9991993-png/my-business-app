import React from 'react';

export default function MobileHeader({ tenant }) {
  return (
    <header className="mobile-header">
      <div className="mobile-header-content">
        {tenant?.logo_url ? (
          <img src={tenant.logo_url} alt="" className="mobile-header-logo" />
        ) : (
          <span className="mobile-header-logo-fallback">🎵</span>
        )}
        <span className="mobile-header-title">{tenant?.name || 'Hoàng Nam Audio'}</span>
      </div>
    </header>
  );
}
