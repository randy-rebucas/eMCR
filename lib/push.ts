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

/**
 * Requests notification permission (no-op if already granted/denied), obtains
 * an Expo push token, and registers this device with the devices endpoint. Call after sign-in and whenever the push token changes. Silently
 * no-ops on simulators/emulators and on web, where push tokens aren't available.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (!Notifications || !Device.isDevice) return;
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  const deviceId = await getOrCreateDeviceId();
  let pushToken: string | undefined;
  if (finalStatus === 'granted') {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    pushToken = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
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
    registerForPushNotifications().catch(() => {});
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
  if (tag.startsWith('queue-')) {
    return { href: '/patient/queue', topics: ['queue'] };
  }
  return { href: null, topics: ['notifications', 'appointments', 'lab-results', 'queue'] };
}
