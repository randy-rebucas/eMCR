import { useCallback, useEffect } from 'react';
import { router } from 'expo-router';
import { emitRefresh } from '@/lib/events';
import { Notifications as MaybeNotifications } from '@/lib/notifications';
import { useMedicineReminderSync } from '@/lib/medicineReminders';
import { routeForNotification } from '@/lib/push';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';

const ACTIVATE_HREF = '/patient/activate';

type NotificationsModule = NonNullable<typeof MaybeNotifications>;
type Response = NonNullable<ReturnType<NotificationsModule['useLastNotificationResponse']>>;

/** A tapped notification: its dedupe id and payload. */
interface Tap {
  id: string;
  data: Record<string, unknown> | undefined;
}

// Survives remounts (sign out → sign in) so one tap is never handled twice. Keyed on the request
// id plus when that notification was delivered: a repeating local reminder (medicine reminders'
// daily trigger) reuses one id every day, and each day's tap must still open the screen.
const handled = new Set<string>();

/**
 * A notification tapped while signed out (or the one that launched the app before sign-in): kept
 * here by NotificationTapCatcher and opened by the Responder once the patient is signed in.
 */
let pendingTap: Tap | null = null;

/** Whether a tap is waiting for sign-in (it takes precedence over the screen to resume). */
export function hasPendingNotificationTap(): boolean {
  return pendingTap !== null;
}

function tapFrom(Notifications: NotificationsModule, response: Response | null | undefined): Tap | null {
  if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return null;
  return {
    id: `${response.notification.request.identifier}@${response.notification.date}`,
    data: response.notification.request.content.data ?? undefined,
  };
}

/**
 * Mounted inside the signed-in area. A push that arrives in the foreground
 * refreshes the matching data; a tapped push (including the one that launched
 * the app, or one tapped before sign-in) also navigates to the matching screen.
 */
export function NotificationResponder() {
  return MaybeNotifications ? <Responder Notifications={MaybeNotifications} /> : null;
}

/**
 * Mounted at the root. While signed out, a tapped notification would otherwise be lost (the
 * Responder only exists signed in): its target is kept for after the sign-in.
 */
export function NotificationTapCatcher() {
  return MaybeNotifications ? <Catcher Notifications={MaybeNotifications} /> : null;
}

function Catcher({ Notifications }: { Notifications: NotificationsModule }) {
  const lastResponse = Notifications.useLastNotificationResponse();
  const { loading, signedIn } = useAuth();

  useEffect(() => {
    // While the session is restoring nothing is decided yet; signed in, the Responder opens it.
    if (loading || signedIn) return;
    const tap = tapFrom(Notifications, lastResponse);
    if (tap && !handled.has(tap.id)) pendingTap = tap;
  }, [Notifications, lastResponse, loading, signedIn]);

  return null;
}

function Responder({ Notifications }: { Notifications: NotificationsModule }) {
  const lastResponse = Notifications.useLastNotificationResponse();
  const { viewing, switchToId } = useProfile();
  const { patient } = useAuth();

  // Local medicine reminders follow prescription changes even when their screen isn't open, for
  // every profile that has reminders (not only the one on screen).
  useMedicineReminderSync(patient?.id);

  const open = useCallback(
    (tap: Tap) => {
      if (handled.has(tap.id)) return;
      handled.add(tap.id);
      Notifications.clearLastNotificationResponse();

      const data = tap.data;
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
    },
    [Notifications, viewing?.id, switchToId]
  );

  // Declared before the lastResponse effect, so a tap kept from before sign-in is opened (and
  // marked handled) first, and the same response from the hook is then skipped.
  useEffect(() => {
    const tap = pendingTap;
    pendingTap = null;
    if (tap) open(tap);
    // Once per mount: the pending tap is only ever set while signed out.
  }, []);

  useEffect(() => {
    const tap = tapFrom(Notifications, lastResponse);
    if (tap) open(tap);
  }, [Notifications, lastResponse, open]);

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const route = routeForNotification(notification.request.content.data ?? undefined);
      emitRefresh(...route.topics);
    });
    return () => subscription.remove();
  }, [Notifications]);

  return null;
}
