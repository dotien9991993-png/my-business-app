import React from 'react';
import logo from '../assets/logo-icon.png';

export default function MobileHeader() {
  return (
    <header className="mobile-header">
      <div className="mobile-header-content">
        <img src={logo} alt="Logo" className="mobile-header-logo" />
        <span className="mobile-header-title">HOÀNG NAM AUDIO</span>
      </div>
    </header>
  );
}
