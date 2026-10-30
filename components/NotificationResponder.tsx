import { useEffect } from 'react';
import { router } from 'expo-router';
import { emitRefresh } from '@/lib/events';
import { Notifications as MaybeNotifications } from '@/lib/notifications';
import { useMedicineReminderSync } from '@/lib/medicineReminders';
import { routeForNotification } from '@/lib/push';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';

const ACTIVATE_HREF = '/patient/activate';

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
  const { viewing, switchToId } = useProfile();
  const { patient } = useAuth();

  // Local medicine reminders follow prescription changes even when their screen isn't open.
  useMedicineReminderSync(patient?.id, viewing ? { id: viewing.id, who: viewing.self ? null : viewing.firstName } : null);

  useEffect(() => {
    if (!lastResponse || lastResponse.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = lastResponse.notification.request.identifier;
    if (handled.has(id)) return;
    handled.add(id);
    Notifications.clearLastNotificationResponse();

    const data = lastResponse.notification.request.content.data ?? undefined;
    const route = routeForNotification(data);
    // A push about a family member (`data.profileId`) opens their profile first. The screens
    // remount for that person, so there's nothing to refresh here. Activation belongs to the
    // account, not to one person, so an activation reminder never switches profile.
    const profileId =
      typeof data?.profileId === 'string' && route.href !== ACTIVATE_HREF ? data.profileId : null;
    if (profileId && profileId !== viewing?.id) {
      switchToId(profileId, route.href ?? undefined).then((switched) => {
        if (!switched && route.href) router.push(route.href);
      });
      return;
    }
    emitRefresh(...route.topics);
    if (route.href) router.push(route.href);
  }, [lastResponse, viewing?.id, switchToId]);

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const route = routeForNotification(notification.request.content.data ?? undefined);
      emitRefresh(...route.topics);
    });
    return () => subscription.remove();
  }, []);

  return null;
}
