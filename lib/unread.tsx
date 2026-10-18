import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { apiFetch } from './api';
import { useRefreshOn } from './events';
import { NotificationsEnvelope } from './types';

interface UnreadContextValue {
  unreadCount: number;
  refreshUnread: () => void;
  setUnreadCount: (count: number) => void;
}

const UnreadContext = createContext<UnreadContextValue>({
  unreadCount: 0,
  refreshUnread: () => {},
  setUnreadCount: () => {},
});

/** Patient notification badge count, refreshed on foreground and on the "notifications" topic. */
export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshUnread = useCallback(() => {
    apiFetch<NotificationsEnvelope>('/api/patients/me/notifications?limit=1')
      .then((json) => setUnreadCount(json.unreadCount ?? 0))
      .catch(() => {
        // Badge is best-effort; keep the last known count.
      });
  }, []);

  useEffect(() => {
    refreshUnread();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshUnread();
    });
    return () => subscription.remove();
  }, [refreshUnread]);

  useRefreshOn(['notifications', 'appointments', 'lab-results', 'invoices', 'prescriptions'], refreshUnread);

  return (
    <UnreadContext.Provider value={{ unreadCount, refreshUnread, setUnreadCount }}>{children}</UnreadContext.Provider>
  );
}

export function useUnread(): UnreadContextValue {
  return useContext(UnreadContext);
}
