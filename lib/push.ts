import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { apiRequest, AUTH_ENDPOINTS } from './api';
import { RefreshTopic } from './events';
import { Notifications } from './notifications';
import { getOrCreateDeviceId } from './storage';

Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function pushSupported(): boolean {
  return !!Notifications && Device.isDevice && (Platform.OS === 'ios' || Platform.OS === 'android');
}

/**
 * True when the OS hasn't been asked for notification permission yet, so the
 * app should show its own "Stay updated" screen before triggering the prompt.
 */
export async function shouldAskForNotifications(): Promise<boolean> {
  if (!pushSupported() || !Notifications) return false;
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  return status === 'undetermined' && canAskAgain;
}

/**
 * Obtains an Expo push token when permission allows and registers this device
 * with the devices endpoint. With `prompt` (the default) it asks for permission
 * first if the OS hasn't been asked yet; `prompt: false` never shows the OS
 * dialog. Call after sign-in and whenever the push token changes. Silently
 * no-ops on simulators/emulators and on web, where push tokens aren't available.
 */
export async function registerForPushNotifications({ prompt = true }: { prompt?: boolean } = {}): Promise<void> {
  if (!pushSupported() || !Notifications) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted' && prompt) {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  const deviceId = await getOrCreateDeviceId();
  let pushToken: string | undefined;
  if (finalStatus === 'granted') {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    try {
      // Throws without an EAS projectId (run `eas init`) or when the push service is unreachable.
      pushToken = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    } catch (error) {
      if (__DEV__) console.warn('[push] Could not get an Expo push token; registering device without one.', error);
    }
  }

  // Registered even without a push token so the backend knows the device for sign-out.
  await apiRequest(AUTH_ENDPOINTS.devices, {
    method: 'POST',
    body: {
      deviceId,
      platform: Platform.OS,
      pushToken,
      appVersion: Constants.expoConfig?.version,
    },
  });
}

/** Re-register when the OS rotates the push token. Returns an unsubscribe function. */
export function watchPushToken(): () => void {
  if (!Notifications) return () => {};
  const subscription = Notifications.addPushTokenListener(() => {
    registerForPushNotifications({ prompt: false }).catch(() => {});
  });
  return () => subscription.remove();
}

export interface NotificationRoute {
  /** Screen to open, or null to stay where the user is. */
  href: string | null;
  /** Data to refetch. */
  topics: RefreshTopic[];
}

/**
 * Where a tapped push should take the user. Patient payloads carry `data.tag`
 * (`appointment-confirm-<id>`, `lab-result-<id>`, `queue-<id>`) and sometimes a
 * web `data.url`, which is ignored.
 */
export function routeForNotification(data: Record<string, unknown> | undefined): NotificationRoute {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  const tag = str(data?.tag) ?? '';
  const idAfter = (prefix: string) => (tag.startsWith(prefix) ? tag.slice(prefix.length) || null : null);

  if (tag.startsWith('appointment-')) {
    const id = idAfter('appointment-confirm-');
    return {
      href: id ? `/patient/appointments/${id}` : '/patient/appointments',
      topics: ['appointments', 'notifications'],
    };
  }
  if (tag.startsWith('lab-result-')) {
    const id = idAfter('lab-result-');
    return { href: id ? `/patient/results/${id}` : '/patient/results', topics: ['lab-results', 'notifications'] };
  }
  if (tag.startsWith('message-')) {
    return { href: '/patient/notifications', topics: ['notifications'] };
  }
  if (tag.startsWith('queue-')) {
    return { href: '/patient/queue', topics: ['queue'] };
  }
  return { href: null, topics: ['notifications', 'appointments', 'lab-results', 'queue'] };
}
