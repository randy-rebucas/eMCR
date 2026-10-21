import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { ApiError, apiRequest, AUTH_ENDPOINTS } from './api';
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

/**
 * The OS notification permission for this app: 'unavailable' where push can't work at all
 * (Expo Go on Android, simulators, web), otherwise the OS status.
 */
export type PushPermission = 'unavailable' | 'granted' | 'denied' | 'undetermined';

export async function getPushPermission(): Promise<PushPermission> {
  if (!pushSupported() || !Notifications) return 'unavailable';
  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  // Asked once and refused: only the phone's Settings app can turn it back on.
  return status === 'undetermined' && canAskAgain ? 'undetermined' : 'denied';
}

/** Push categories the patient can mute on this device (server: MobileDevice.pushPrefs). */
export type PushCategory = 'appointments' | 'labResults' | 'queue' | 'messages';
export type PushPrefs = Record<PushCategory, boolean>;

const PREFS_ENDPOINT = `${AUTH_ENDPOINTS.devices}/preferences`;

/** This device's push categories. Registers the device first if the server doesn't know it yet. */
export async function getPushPrefs(): Promise<PushPrefs> {
  const deviceId = await getOrCreateDeviceId();
  const load = () => apiRequest<PushPrefs>(`${PREFS_ENDPOINT}?deviceId=${encodeURIComponent(deviceId)}`, { profile: false });
  try {
    return await load();
  } catch (err) {
    if (!(err instanceof ApiError && err.code === 'DEVICE_NOT_FOUND')) throw err;
    await registerForPushNotifications({ prompt: false });
    return load();
  }
}

/** Turn categories on or off for this device. Returns the full set as saved. */
export async function updatePushPrefs(changes: Partial<PushPrefs>): Promise<PushPrefs> {
  const deviceId = await getOrCreateDeviceId();
  return apiRequest<PushPrefs>(PREFS_ENDPOINT, { method: 'PATCH', body: { deviceId, ...changes }, profile: false });
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
 * web `data.url`, which is ignored. `data.screen: "activate"` opens the activation screen.
 */
export function routeForNotification(data: Record<string, unknown> | undefined): NotificationRoute {
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  // eMCR activation and renewal reminders (`data.screen: "activate"`, tag `emcr-renewal-…`).
  if (str(data?.screen) === 'activate' || str(data?.tag)?.startsWith('emcr-renewal-')) {
    return { href: '/patient/activate', topics: ['activation'] };
  }

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
