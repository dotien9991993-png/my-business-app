import React from 'react';

export default function MobileHeader({ title, rightAction }) {
  return (
    <header className="mobile-header">
      <h1 className="mobile-header-title">{title}</h1>
      {rightAction && <div className="mobile-header-action">{rightAction}</div>}
    </header>
  );
}
