import { useEffect, useState } from 'react';
import { getJson } from '../api/client';

const DEFAULT_POLL_MS = 15_000;

/** Poll a JSON GET endpoint on an interval. */
export function usePolledJson<T>(url: string, intervalMs = DEFAULT_POLL_MS) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const next = await getJson<T>(url);
        if (cancelled) return;
        setError(null);
        setData(next);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Request failed');
      }
    };

    void load();
    const id = setInterval(() => void load(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [url, intervalMs]);

  return { data, error };
}
