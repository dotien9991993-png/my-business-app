import { useState, useEffect } from 'react';

export function useMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    // Capacitor native → always mobile
    if (window.Capacitor?.isNativePlatform()) return true;
    return window.innerWidth < 768;
  });

  useEffect(() => {
    // Native platform → always mobile, no listener needed
    if (window.Capacitor?.isNativePlatform()) return;

    const mq = window.matchMedia('(max-width: 767.98px)');
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
