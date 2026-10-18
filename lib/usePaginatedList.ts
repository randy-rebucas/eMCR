import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, errorMessage, Pagination } from './api';
import { RefreshTopic, useRefreshOn } from './events';

interface Options {
  /** Page size sent as `limit`. */
  limit?: number;
  /** Refetch the first page silently when any of these topics is emitted. */
  refreshOn?: RefreshTopic[];
}

type Envelope<T> = { data?: T[]; pagination?: Pagination } & Record<string, unknown>;

/**
 * Paginated list endpoint (`?page=&limit=` → `{ data, pagination }`).
 * `extra` is the first page's envelope, for side fields like `summary` or `unreadCount`.
 * `basePath` may already carry a query string (filters); `page`/`limit` are appended.
 */
export function usePaginatedList<T extends { _id?: string; id?: string }, X = Record<string, unknown>>(
  basePath: string | null,
  options: Options = {}
) {
  const { limit = 20, refreshOn } = options;
  const [items, setItems] = useState<T[]>([]);
  const [extra, setExtra] = useState<X | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(basePath !== null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const mounted = useRef(true);
  // Ignore responses from a superseded request (filter changed, pulled to refresh).
  const generation = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const urlFor = useCallback(
    (p: number) => {
      if (!basePath) return null;
      const sep = basePath.includes('?') ? '&' : '?';
      return `${basePath}${sep}page=${p}&limit=${limit}`;
    },
    [basePath, limit]
  );

  const loadFirst = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      const url = urlFor(1);
      if (!url) return;
      const gen = ++generation.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      if (mode !== 'silent') setError(null);
      try {
        const json = await apiFetch<Envelope<T>>(url);
        if (!mounted.current || gen !== generation.current) return;
        setItems(json.data ?? []);
        setExtra(json as unknown as X);
        setPage(1);
        setTotalPages(json.pagination?.totalPages ?? json.pagination?.pages ?? 1);
        setError(null);
        setLoadMoreError(null);
      } catch (err) {
        if (!mounted.current || gen !== generation.current) return;
        setError(errorMessage(err, 'Failed to load. Pull to retry.'));
      } finally {
        if (mounted.current && gen === generation.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [urlFor]
  );

  useEffect(() => {
    if (basePath === null) {
      setLoading(false);
      return;
    }
    setItems([]);
    loadFirst('initial');
  }, [loadFirst, basePath]);

  const hasMore = page < totalPages;

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading || refreshing) return;
    const url = urlFor(page + 1);
    if (!url) return;
    const gen = generation.current;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const json = await apiFetch<Envelope<T>>(url);
      if (!mounted.current || gen !== generation.current) return;
      setItems((prev) => {
        // Records created since page 1 shift later pages; drop duplicates.
        const key = (item: T) => item._id ?? item.id;
        const seen = new Set(prev.map(key));
        return [...prev, ...(json.data ?? []).filter((item) => !seen.has(key(item)))];
      });
      setPage(page + 1);
      setTotalPages(json.pagination?.totalPages ?? json.pagination?.pages ?? page + 1);
    } catch (err) {
      if (mounted.current) setLoadMoreError(errorMessage(err, "Couldn't load more."));
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }, [hasMore, loadingMore, loading, refreshing, urlFor, page]);

  const refresh = useCallback(() => loadFirst('refresh'), [loadFirst]);
  const reload = useCallback(() => loadFirst('initial'), [loadFirst]);
  const poll = useCallback(() => loadFirst('silent'), [loadFirst]);

  useRefreshOn(refreshOn, poll);

  return {
    items,
    setItems,
    extra,
    loading,
    refreshing,
    loadingMore,
    error,
    loadMoreError,
    hasMore,
    refresh,
    reload,
    poll,
    loadMore,
  };
}
