import { useEffect } from 'react';
import { router } from 'expo-router';
import { emitRefresh } from '@/lib/events';
import { Notifications as MaybeNotifications } from '@/lib/notifications';
import { routeForNotification } from '@/lib/push';

// Survives remounts (sign out → sign in) so one tap is never handled twice.
const handled = new Set<string>();

/**
 * Mounted inside the signed-in area. A push that arrives in the foreground
 * refreshes the matching data; a tapped push (including the one that launched
 * the app) also navigates to the matching screen.
 */
export function NotificationResponder() {
  return MaybeNotifications ? <Responder Notifications={MaybeNotifications} /> : null;
}

function Responder({ Notifications }: { Notifications: NonNullable<typeof MaybeNotifications> }) {
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!lastResponse || lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = lastResponse.notification.request.identifier;
    if (handled.has(id)) return;
    handled.add(id);
    Notifications.clearLastNotificationResponse();

    const route = routeForNotification(lastResponse.notification.request.content.data ?? undefined);
    emitRefresh(...route.topics);
    if (route.href) router.push(route.href);
  }, [lastResponse]);

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const route = routeForNotification(notification.request.content.data ?? undefined);
      emitRefresh(...route.topics);
    });
    return () => subscription.remove();
  }, []);

  return null;
}
