import { useState, useEffect, useCallback } from 'react';

// Simple hash-based router
export const useHashRouter = () => {
  const [hash, setHash] = useState(window.location.hash.slice(1) || '');

  useEffect(() => {
    const handleHashChange = () => {
      setHash(window.location.hash.slice(1) || '');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useCallback((path) => {
    window.location.hash = path;
  }, []);

  return { path: hash, navigate };
};
