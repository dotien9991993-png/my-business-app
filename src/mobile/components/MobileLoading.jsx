import React from 'react';

export default function MobileLoading({ text = 'Đang tải...' }) {
  return (
    <div className="mobile-loading">
      <div className="mobile-loading-spinner" />
      <p>{text}</p>
    </div>
  );
}
