import { useEffect, useRef } from 'react';

/**
 * Tiny in-process "this data changed" bus. Push taps and mutations (booking,
 * cancelling, editing a profile…) emit a topic; screens showing that data refetch.
 */
export type RefreshTopic =
  | 'appointments'
  | 'lab-results'
  | 'prescriptions'
  | 'invoices'
  | 'documents'
  | 'queue'
  | 'notifications'
  | 'profile'
  | 'family'
  | 'activation';

type Listener = () => void;
const listeners = new Map<RefreshTopic, Set<Listener>>();

export function emitRefresh(...topics: RefreshTopic[]): void {
  for (const topic of topics) {
    listeners.get(topic)?.forEach((listener) => listener());
  }
}

export function onRefresh(topic: RefreshTopic, listener: Listener): () => void {
  let set = listeners.get(topic);
  if (!set) {
    set = new Set();
    listeners.set(topic, set);
  }
  set.add(listener);
  return () => {
    set?.delete(listener);
  };
}

/** Call `callback` whenever any of `topics` is emitted, for the component's lifetime. */
export function useRefreshOn(topics: RefreshTopic[] | RefreshTopic | null | undefined, callback: () => void): void {
  const latest = useRef(callback);
  latest.current = callback;
  const key = topics ? (Array.isArray(topics) ? topics : [topics]).join(',') : '';

  useEffect(() => {
    if (!key) return;
    const unsubscribers = (key.split(',') as RefreshTopic[]).map((topic) =>
      onRefresh(topic, () => latest.current())
    );
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [key]);
}
