import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const SCANNER_ID = 'qr-scanner-region';

export default function QRScanner({ onScanSuccess, isOpen, onClose }) {
  const html5QrCodeRef = useRef(null);
  const [error, setError] = useState(null);
  const mountedRef = useRef(false);

  const playBeep = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1000;
      osc.type = 'sine';
      gain.gain.value = 0.3;
      osc.start();
      setTimeout(() => { osc.stop(); ctx.close(); }, 200);
    } catch (_e) { /* ignore */ }
  };

  useEffect(() => {
    if (!isOpen) return;
    mountedRef.current = true;
    setError(null);

    const startScanner = async () => {
      try {
        const html5QrCode = new Html5Qrcode(SCANNER_ID);
        html5QrCodeRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
          (decodedText) => {
            if (!mountedRef.current) return;
            playBeep();
            // Pause briefly to prevent rapid-fire scans
            html5QrCode.pause(true);
            onScanSuccess(decodedText);
            // Resume after short delay
            setTimeout(() => {
              if (mountedRef.current && html5QrCodeRef.current) {
                try { html5QrCode.resume(); } catch (_e) { /* ignore */ }
              }
            }, 2000);
          },
          () => { /* ignore continuous scan errors */ }
        );
      } catch (_err) {
        if (mountedRef.current) {
          setError('Không thể truy cập camera. Vui lòng cấp quyền camera hoặc dùng HTTPS.');
        }
      }
    };

    // Small delay to ensure DOM element exists
    const timer = setTimeout(startScanner, 150);

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
      if (html5QrCodeRef.current) {
        html5QrCodeRef.current.stop().catch(() => {});
        html5QrCodeRef.current = null;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-[70] flex flex-col items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full overflow-hidden">
        <div className="p-3 bg-green-700 text-white flex justify-between items-center">
          <span className="font-bold text-sm">Quét mã QR / Barcode</span>
          <button onClick={onClose} className="text-white/80 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <div id={SCANNER_ID} style={{ width: '100%' }} />
        {error && (
          <div className="p-3 bg-red-50 text-red-600 text-sm text-center">{error}</div>
        )}
        <div className="p-3 text-center text-xs text-gray-500">
          Hướng camera vào mã QR hoặc barcode trên phiếu giao hàng
        </div>
      </div>
    </div>
  );
}
