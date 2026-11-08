import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';
import { clearOfflineCache } from './offlineCache';

/**
 * Session credentials live in SecureStore only — never AsyncStorage. They are
 * equivalent to a password for as long as they're valid.
 *
 * - access token: 7-day Bearer JWT sent on every authenticated request
 * - refresh token: opaque, 60-day, single use; rotated on every refresh
 * - accessExpiresAt: epoch ms derived from `expiresIn`, so the api wrapper can
 *   refresh proactively instead of waiting for a 401
 */
export interface StoredSession {
  accessToken: string;
  refreshToken: string | null;
  accessExpiresAt: number | null;
}

const KEYS = {
  /** Earlier builds also signed in medical representatives; only 'patient' is still valid. */
  audience: 'session_audience',
  access: 'session_access_token',
  refresh: 'session_refresh_token',
  accessExpiresAt: 'session_access_expires_at',
  /** Builds before refresh tokens stored a patient token under this key. */
  legacyPatient: 'patient_token',
} as const;

/**
 * iOS keychain class for credentials: readable after the first unlock since boot (so a refresh
 * started while the phone is locked still works) and never moved to another device by a backup
 * restore. Android ignores it (Keystore). The keychain lookup doesn't match on this attribute, so
 * items written by earlier builds (default "when unlocked") still read; they are rewritten once.
 */
const SECURE: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
/** Set once the stored session has been rewritten with `SECURE`. */
const KEYCHAIN_MIGRATED_KEY = 'session_keychain_v2';

// In-memory mirror so every request doesn't hit the keychain. `undefined` = not loaded yet.
let cache: StoredSession | null | undefined;

/**
 * Bumped whenever the session is replaced or cleared. A token refresh captures it before its
 * request and only stores the result if it is unchanged, so a refresh that finishes after
 * sign-out (or after a new sign-in) can't write the old session back.
 */
let generation = 0;

export function sessionGeneration(): number {
  return generation;
}

export async function getSession(): Promise<StoredSession | null> {
  if (cache !== undefined) return cache;

  const [audience, accessToken, refreshToken, expiresAt] = await Promise.all([
    SecureStore.getItemAsync(KEYS.audience),
    SecureStore.getItemAsync(KEYS.access),
    SecureStore.getItemAsync(KEYS.refresh),
    SecureStore.getItemAsync(KEYS.accessExpiresAt),
  ]);

  // A leftover representative session can't be used against the patient API.
  if (audience && audience !== 'patient') {
    await clearSession();
    return null;
  }

  if (accessToken) {
    const loaded: StoredSession = {
      accessToken,
      refreshToken,
      accessExpiresAt: expiresAt ? Number(expiresAt) || null : null,
    };
    cache = loaded;
    await migrateKeychainClass(loaded);
    return cache;
  }

  // One-time migration of a pre-refresh-token patient session. It has no refresh
  // token, so the patient signs in again once it expires.
  const legacy = await SecureStore.getItemAsync(KEYS.legacyPatient);
  if (legacy) {
    await SecureStore.deleteItemAsync(KEYS.legacyPatient);
    const migrated: StoredSession = {
      accessToken: legacy,
      refreshToken: null,
      accessExpiresAt: null,
    };
    await setSession(migrated);
    return migrated;
  }

  cache = null;
  return null;
}

/**
 * One-time rewrite of a session stored by an earlier build, so it gets the `SECURE` keychain
 * class (an update with the option changes the item's class in place). Skipped when the session
 * changed meanwhile, so it can never write back a session that was replaced or cleared.
 */
async function migrateKeychainClass(session: StoredSession): Promise<void> {
  if (Platform.OS !== 'ios') return;
  try {
    if ((await SecureStore.getItemAsync(KEYCHAIN_MIGRATED_KEY)) === '1') return;
    const at = generation;
    await setSession(session, { ifGeneration: at });
    // App Lock follows the session's keychain class, so both read in the same device states.
    if ((await SecureStore.getItemAsync('app_lock')) === '1') await SecureStore.setItemAsync('app_lock', '1', SECURE);
    if (generation === at) await SecureStore.setItemAsync(KEYCHAIN_MIGRATED_KEY, '1');
  } catch {
    // Retried on the next launch; the session still reads either way.
  }
}

/**
 * Store a session. With `ifGeneration` (token refresh), nothing is written and false is
 * returned when the session was replaced or cleared since that generation was read.
 */
export async function setSession(session: StoredSession, options: { ifGeneration?: number } = {}): Promise<boolean> {
  if (options.ifGeneration === undefined) generation++;
  else if (options.ifGeneration !== generation) return false;
  cache = session;
  await Promise.all([
    SecureStore.setItemAsync(KEYS.audience, 'patient', SECURE),
    SecureStore.setItemAsync(KEYS.access, session.accessToken, SECURE),
    session.refreshToken
      ? SecureStore.setItemAsync(KEYS.refresh, session.refreshToken, SECURE)
      : SecureStore.deleteItemAsync(KEYS.refresh),
    session.accessExpiresAt
      ? SecureStore.setItemAsync(KEYS.accessExpiresAt, String(session.accessExpiresAt), SECURE)
      : SecureStore.deleteItemAsync(KEYS.accessExpiresAt),
  ]);
  return true;
}

/** Sign-out on this device, whatever the path: the session and every offline copy of records go. */
export async function clearSession(): Promise<void> {
  generation++;
  cache = null;
  await Promise.all([
    clearOfflineCache(),
    SecureStore.deleteItemAsync(KEYS.audience),
    SecureStore.deleteItemAsync(KEYS.access),
    SecureStore.deleteItemAsync(KEYS.refresh),
    SecureStore.deleteItemAsync(KEYS.accessExpiresAt),
    SecureStore.deleteItemAsync(KEYS.legacyPatient),
  ]);
}

/** Whether this install has already shown the first-launch welcome screen. */
export async function getWelcomeSeen(): Promise<boolean> {
  return (await SecureStore.getItemAsync('welcome_seen')) === '1';
}

export async function setWelcomeSeen(): Promise<void> {
  await SecureStore.setItemAsync('welcome_seen', '1');
}

/** Whether this install has finished (or skipped) the in-app quick tour. */
export async function getTourSeen(): Promise<boolean> {
  return (await SecureStore.getItemAsync('tour_seen')) === '1';
}

export async function setTourSeen(): Promise<void> {
  await SecureStore.setItemAsync('tour_seen', '1');
}

/** The app language the patient picked ('en' | 'fil'); null = same as the phone. Not PHI. */
export async function getLanguagePreference(): Promise<string | null> {
  return SecureStore.getItemAsync('app_language');
}

export async function setLanguagePreference(language: string | null): Promise<void> {
  if (language) await SecureStore.setItemAsync('app_language', language);
  else await SecureStore.deleteItemAsync('app_language');
}

/** Whether the patient turned on App Lock (fingerprint, face or screen lock to open the app). */
export async function getAppLockEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync('app_lock')) === '1';
}

export async function setAppLockEnabled(enabled: boolean): Promise<void> {
  if (enabled) await SecureStore.setItemAsync('app_lock', '1', SECURE);
  else await SecureStore.deleteItemAsync('app_lock');
}

/**
 * Stable per-install identifier sent as `deviceId` to the devices and session
 * endpoints. Expo has no persistent hardware id, so one is generated once (a random UUID; ids
 * stored by earlier builds are kept as they are, since the server knows the device by them).
 */
let deviceIdPromise: Promise<string> | null = null;

export function getOrCreateDeviceId(): Promise<string> {
  // One read per launch, and two first-time callers can't each create a different id.
  if (!deviceIdPromise) {
    deviceIdPromise = (async () => {
      const KEY = 'device_id';
      let id = await SecureStore.getItemAsync(KEY);
      if (!id) {
        id = randomUUID();
        await SecureStore.setItemAsync(KEY, id, SECURE);
      }
      return id;
    })().catch((error) => {
      deviceIdPromise = null;
      throw error;
    });
  }
  return deviceIdPromise;
}
