import { useEffect, useMemo, useRef } from 'react';
import { useQuotaStore } from '@/stores/useQuotaStore';
import type { QuotaFileEntry } from '../logic';
import type { QuotaLoadOptions } from './useQuotaBatchLoader';

export const QUOTA_POLL_INTERVAL_MS = 5 * 60 * 1000;
/** How often the poll checks whether an interval has passed. */
const POLL_CHECK_MS = 60 * 1000;

/**
 * Loads every visible credential once per visit, then refreshes them in the
 * background every five minutes while the browser tab is visible. A tab that
 * was hidden past an interval catches up as soon as it is shown again.
 *
 * All loads are silent, so rows that already show data update in place.
 */
export function useQuotaAutoLoad(
  entries: QuotaFileEntry[],
  disabled: boolean,
  loadQuota: (targets: QuotaFileEntry[], options?: QuotaLoadOptions) => Promise<void>
) {
  const attempted = useRef(new Set<string>());
  const lastLoadAt = useRef(0);
  const session = useQuotaStore((state) => state.cacheGeneration);
  const fileGenerations = useQuotaStore((state) => state.fileGenerations);

  const enabledEntries = useMemo(() => entries.filter(({ file }) => !file.disabled), [entries]);

  // First load for credentials this visit hasn't fetched yet.
  useEffect(() => {
    if (disabled) return;
    const targets = enabledEntries.filter(({ file }) => {
      const key = JSON.stringify([
        session,
        fileGenerations[file.name] ?? 0,
        file.name,
        file.authIndex,
      ]);
      if (attempted.current.has(key)) return false;
      attempted.current.add(key);
      return true;
    });
    if (targets.length === 0) return;
    lastLoadAt.current = Date.now();
    void loadQuota(targets, { silent: true });
  }, [disabled, enabledEntries, fileGenerations, loadQuota, session]);

  // Background poll.
  useEffect(() => {
    if (disabled || enabledEntries.length === 0) return;
    const poll = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoadAt.current < QUOTA_POLL_INTERVAL_MS) return;
      lastLoadAt.current = Date.now();
      void loadQuota(enabledEntries, { silent: true });
    };
    const timer = window.setInterval(poll, POLL_CHECK_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [disabled, enabledEntries, loadQuota]);
}
