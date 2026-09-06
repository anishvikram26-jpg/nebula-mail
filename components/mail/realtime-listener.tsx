'use client';

import { useEffect, useRef } from 'react';
import { useMailStore } from '@/store/mail-store';

/**
 * RealtimeListener
 *
 * Coordinates real-time mail data revalidation in the background:
 * - Periodically triggers silent mail-list revalidation (default 45s).
 * - Pauses polling when the browser tab is hidden to conserve bandwidth and CPU.
 * - Immediately triggers a refresh when the user returns to the tab (visibility change).
 * - On initial mount, verifies or registers the Gmail watch subscription via /api/mail/watch.
 * - Completely non-destructive: preserves selected email, open compose modal,
 *   draft content, and AI assistant state.
 */
export function RealtimeListener() {
  const { triggerRefresh, isSyncing } = useMailStore();
  const lastRefreshTimeRef = useRef<number>(0);
  const isSyncingRef = useRef(isSyncing);

  useEffect(() => {
    lastRefreshTimeRef.current = Date.now();
  }, []);

  useEffect(() => {
    isSyncingRef.current = isSyncing;
  }, [isSyncing]);

  useEffect(() => {
    // 1. Initial watch setup (non-blocking, fire-and-forget)
    async function initWatch() {
      try {
        await fetch('/api/mail/watch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
      } catch {
        // Watch API setup failure is non-fatal to frontend browsing
      }
    }

    initWatch();

    // 2. Periodic background revalidation
    const INTERVAL_MS = 45000; // 45 seconds (reasonable non-aggressive interval)
    let intervalId: NodeJS.Timeout | null = null;

    function startInterval() {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        // Don't trigger if already syncing or tab is hidden
        if (!isSyncingRef.current && document.visibilityState === 'visible') {
          lastRefreshTimeRef.current = Date.now();
          triggerRefresh();
        }
      }, INTERVAL_MS);
    }

    function stopInterval() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    // 3. Tab visibility listener
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastRefreshTimeRef.current;
        // If more than 30s elapsed while tab was hidden, revalidate immediately
        if (elapsed > 30000 && !isSyncingRef.current) {
          lastRefreshTimeRef.current = Date.now();
          triggerRefresh();
        }
        startInterval();
      } else {
        stopInterval();
      }
    }

    // Start polling if tab is currently active
    if (typeof document !== 'undefined') {
      if (document.visibilityState === 'visible') {
        startInterval();
      }
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      stopInterval();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, [triggerRefresh]);

  // Headless component
  return null;
}
