import React from 'react';

export default function MobileSkeleton({ type = 'card', count = 3 }) {
  const items = Array.from({ length: count });

  if (type === 'chat') {
    return (
      <div className="mskel-wrap">
        {items.map((_, i) => (
          <div key={i} className={`mskel-chat ${i % 3 === 0 ? 'mskel-chat-right' : ''}`}>
            {i % 3 !== 0 && <div className="mskel-avatar" />}
            <div className="mskel-bubble" style={{ width: `${40 + Math.random() * 35}%` }} />
          </div>
        ))}
      </div>
    );
  }

  if (type === 'list') {
    return (
      <div className="mskel-wrap">
        {items.map((_, i) => (
          <div key={i} className="mskel-list-item">
            <div className="mskel-circle" />
            <div className="mskel-lines">
              <div className="mskel-line" style={{ width: '70%' }} />
              <div className="mskel-line mskel-line-short" style={{ width: '45%' }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // type === 'card'
  return (
    <div className="mskel-wrap">
      {items.map((_, i) => (
        <div key={i} className="mskel-card">
          <div className="mskel-line" style={{ width: '80%', height: '14px' }} />
          <div className="mskel-line mskel-line-short" style={{ width: '50%' }} />
          <div className="mskel-line mskel-line-short" style={{ width: '60%' }} />
        </div>
      ))}
    </div>
  );
}
