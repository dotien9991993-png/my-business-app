import React, { useRef, useState, useCallback } from 'react';

const THRESHOLD = 60;

export default function MobilePullRefresh({ onRefresh, children }) {
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const containerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    const el = containerRef.current;
    if (!el || refreshing) return;
    const scrollParent = el.closest('.mobile-content') || el.parentElement;
    if (scrollParent && scrollParent.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    setPulling(true);
  }, [refreshing]);

  const handleTouchMove = useCallback((e) => {
    if (!pulling || refreshing) return;
    const el = containerRef.current;
    const scrollParent = el?.closest('.mobile-content') || el?.parentElement;
    if (scrollParent && scrollParent.scrollTop > 0) { setPulling(false); setPullDistance(0); return; }
    const dy = Math.max(0, e.touches[0].clientY - startY.current);
    const dist = Math.min(dy * 0.4, 80);
    setPullDistance(dist);
  }, [pulling, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return;
    setPulling(false);
    if (pullDistance >= THRESHOLD && onRefresh) {
      setRefreshing(true);
      try { await onRefresh(); } catch (_) { /* handled by caller */ }
      setRefreshing(false);
    }
    setPullDistance(0);
  }, [pulling, pullDistance, onRefresh]);

  return (
    <div
      ref={containerRef}
      className="mpr-container"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {(pullDistance > 0 || refreshing) && (
        <div className="mpr-indicator" style={{ height: refreshing ? 36 : pullDistance }}>
          {refreshing ? (
            <div className="mpr-spinner" />
          ) : (
            <span className="mpr-arrow" style={{
              transform: pullDistance >= THRESHOLD ? 'rotate(180deg)' : 'rotate(0deg)'
            }}>↓</span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
