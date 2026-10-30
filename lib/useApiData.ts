import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, ApiError, apiRequest, errorMessage, getActiveProfileId } from './api';
import { RefreshTopic, useRefreshOn } from './events';
import {
  offlineCacheEpoch,
  offlineCacheKey,
  readOffline,
  removeOffline,
  shouldDropCacheOnStatus,
  writeOffline,
} from './offlineCache';
import { sessionGeneration } from './storage';
import { t } from './i18n';

type LoadMode = 'initial' | 'refresh' | 'silent';

interface Options {
  /** Return the whole JSON envelope instead of unwrapping `data`. */
  envelope?: boolean;
  /** Refetch silently when any of these topics is emitted. */
  refreshOn?: RefreshTopic[];
  /**
   * Keep an encrypted copy of the last response on the device (per family profile) and show it
   * straight away on the next visit, then refetch. When the network is down the copy stays on
   * screen with `offline: true` and `updatedAt` = when it was saved. Only for GET endpoints.
   */
  offline?: boolean;
}

/** True for the api layer's "couldn't reach the server" (no connection, timeout). */
export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'NETWORK';
}

export function useApiData<T>(path: string | null, options: Options = {}) {
  const { envelope = false, refreshOn, offline: keepOffline = false } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** When `data` last loaded successfully (epoch ms), so a failed poll can say how old it is. */
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  /** The last load couldn't reach the server, and `data` is an older copy. */
  const [offline, setOffline] = useState(false);
  /** `data` is the saved offline copy; the server hasn't confirmed it yet this visit. */
  const [stale, setStale] = useState(false);
  const inFlight = useRef(0);
  // Only the latest request may write state (path changed, refresh over a slow load).
  const sequence = useRef(0);
  const mounted = useRef(true);
  const dataRef = useRef<T | null>(null);
  dataRef.current = data;
  /** The path whose data the server has returned this visit (a saved copy never replaces it). */
  const loadedPath = useRef<string | null>(null);
  const fromCache = useRef(false);

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
      if (mode === 'silent' && inFlight.current > 0) return;
      inFlight.current++;
      const seq = ++sequence.current;
      const isLatest = () => mounted.current && seq === sequence.current;
      const cacheKey = keepOffline ? offlineCacheKey(path, getActiveProfileId(), envelope ? 'envelope' : 'data') : null;
      // Read before the request: a response that lands after sign-out must not be saved.
      const cacheEpoch = offlineCacheEpoch();
      const sessionGen = sessionGeneration();
      let outcome: 'pending' | 'ok' | 'network' | 'failed' = 'pending';
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      if (mode !== 'silent') setError(null);

      // Stale-while-revalidate: show the saved copy while the request runs (or after it failed offline).
      if (cacheKey && mode === 'initial' && loadedPath.current !== path) {
        readOffline<T>(cacheKey).then((hit) => {
          if (!hit || !isLatest() || outcome === 'ok' || outcome === 'failed' || loadedPath.current === path) return;
          fromCache.current = true;
          setData(hit.data);
          setUpdatedAt(hit.savedAt);
          setStale(true);
          setLoading(false);
          if (outcome === 'network') setOffline(true);
        });
      }

      try {
        const result = envelope ? await apiFetch<T>(path) : await apiRequest<T>(path);
        outcome = 'ok';
        if (cacheKey && sessionGen === sessionGeneration()) writeOffline(cacheKey, result, cacheEpoch);
        if (!isLatest()) return;
        loadedPath.current = path;
        fromCache.current = false;
        setData(result);
        setUpdatedAt(Date.now());
        setError(null);
        setOffline(false);
        setStale(false);
      } catch (err) {
        const network = isNetworkError(err);
        outcome = network ? 'network' : 'failed';
        // Signed out, no access, or gone: the saved copy must not be shown again.
        const drop = !network && err instanceof ApiError && shouldDropCacheOnStatus(err.status);
        if (cacheKey && drop) removeOffline(cacheKey);
        if (!isLatest()) return;
        if (drop && fromCache.current) {
          fromCache.current = false;
          setData(null);
          setUpdatedAt(null);
          setStale(false);
        }
        setOffline(network && (dataRef.current !== null || fromCache.current));
        setError(errorMessage(err, t('common.failedToLoad')));
      } finally {
        inFlight.current--;
        // The latest request clears every spinner, including one a superseded request started.
        if (isLatest()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [path, envelope, keepOffline]
  );

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => load('refresh'), [load]);
  /** Refetch without showing the pull-to-refresh spinner (for polling). */
  const poll = useCallback(() => load('silent'), [load]);

  useRefreshOn(refreshOn, poll);

  return { data, setData, loading, refreshing, error, updatedAt, offline, stale, refresh, poll };
}
