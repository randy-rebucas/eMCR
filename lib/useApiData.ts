import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, apiRequest, errorMessage } from './api';
import { RefreshTopic, useRefreshOn } from './events';

type LoadMode = 'initial' | 'refresh' | 'silent';

interface Options {
  /** Return the whole JSON envelope instead of unwrapping `data`. */
  envelope?: boolean;
  /** Refetch silently when any of these topics is emitted. */
  refreshOn?: RefreshTopic[];
}

export function useApiData<T>(path: string | null, options: Options = {}) {
  const { envelope = false, refreshOn } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (mode: LoadMode = 'initial') => {
      if (!path) return;
      // Background polls never stack on top of a request that is still running.
      if (mode === 'silent' && inFlight.current) return;
      inFlight.current = true;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      if (mode !== 'silent') setError(null);
      try {
        const result = envelope ? await apiFetch<T>(path) : await apiRequest<T>(path);
        if (!mounted.current) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted.current) return;
        setError(errorMessage(err, 'Failed to load. Pull to retry.'));
      } finally {
        inFlight.current = false;
        if (mounted.current) {
          if (mode === 'initial') setLoading(false);
          if (mode === 'refresh') setRefreshing(false);
        }
      }
    },
    [path, envelope]
  );

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => load('refresh'), [load]);
  /** Refetch without showing the pull-to-refresh spinner (for polling). */
  const poll = useCallback(() => load('silent'), [load]);

  useRefreshOn(refreshOn, poll);

  return { data, setData, loading, refreshing, error, refresh, poll };
}
