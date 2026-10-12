import { useEffect, useState } from 'react';
import { routingApi, type RoutingPreview } from '@/services/api';

/** Fetches which account the router would pick next; refetches when `reloadSignal` changes. */
export function useRoutingPreview(reloadSignal: unknown, enabled: boolean) {
  const [preview, setPreview] = useState<RoutingPreview | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let current = true;
    routingApi
      .preview()
      .then((next) => current && setPreview(next))
      .catch(() => current && setPreview(null));
    return () => {
      current = false;
    };
  }, [enabled, reloadSignal]);

  return preview;
}
