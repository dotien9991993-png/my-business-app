import React from 'react';
import logo from '../assets/logo-icon.png';

export default function MobileHeader() {
  return (
    <header className="mobile-header">
      <div className="mobile-header-content">
        <img src={logo} alt="Hoàng Nam Audio" className="mobile-header-logo" />
      </div>
    </header>
  );
}
