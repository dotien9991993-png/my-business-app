import React, { useEffect, useState } from 'react';
import { subscribe, dismissToast, TOAST_TYPES } from '../../utils/toast';

// Container render toàn bộ toast trên màn hình.
// Mount 1 lần trong App root.
export default function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    return subscribe(({ type, toast, id }) => {
      if (type === 'add') {
        setToasts(prev => [...prev, toast]);
      } else if (type === 'remove') {
        setToasts(prev => prev.filter(t => t.id !== id));
      }
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-[9999] pointer-events-none"
      style={{
        top: 'env(safe-area-inset-top, 16px)',
        left: 0,
        right: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        padding: '0 16px',
      }}
    >
      {toasts.map(t => {
        const cfg = TOAST_TYPES[t.type] || TOAST_TYPES.info;
        return (
          <div
            key={t.id}
            onClick={() => dismissToast(t.id)}
            className={`${cfg.color} text-white rounded-xl shadow-lg px-4 py-3 max-w-md w-full pointer-events-auto cursor-pointer animate-toast-in`}
            style={{
              display: 'flex',
              gap: '10px',
              alignItems: 'flex-start',
              fontSize: '14px',
              lineHeight: '1.4',
            }}
            role="alert"
          >
            <span style={{ fontSize: '18px', flexShrink: 0 }}>{cfg.icon}</span>
            <div style={{ flex: 1, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.message}</div>
          </div>
        );
      })}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-toast-in { animation: toast-in 180ms ease-out; }
      `}</style>
    </div>
  );
}
