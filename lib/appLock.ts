import { Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { getAppLockEnabled as readAppLockEnabled, setAppLockEnabled } from './storage';
import { t } from './i18n';

/**
 * App Lock: an optional fingerprint, face or screen-lock check before the records show, on
 * launch and after the app has been in the background for a while. It is local to the device;
 * the session itself is unchanged. The lock screen is components/PrivacyGuard.tsx.
 */

/** Lock again after this long in the background. */
export const LOCK_AFTER_MS = 30_000;

/**
 * The App Lock setting, read once before the first screen (`loadAppLockSetting`, awaited by the
 * root layout) so the lock can cover the records on the very first render. null = not read yet.
 */
let lockEnabledCache: boolean | null = null;

export async function getAppLockEnabled(): Promise<boolean> {
  try {
    lockEnabledCache = await readAppLockEnabled();
  } catch {
    // Keychain unavailable: keep the last known value; unknown counts as on (fail closed).
    if (lockEnabledCache === null) return true;
  }
  return lockEnabledCache;
}

/** Read the setting into memory. Safe to call more than once; never rejects. */
export function loadAppLockSetting(): Promise<void> {
  return getAppLockEnabled().then(
    () => {},
    () => {}
  );
}

/** The setting as last read: true/false, or null before `loadAppLockSetting` finished. */
export function appLockEnabledSync(): boolean | null {
  return lockEnabledCache;
}

/** Whether the phone has a screen lock (biometric, PIN, pattern or passcode) App Lock can use. */
export async function canUseAppLock(): Promise<boolean> {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

export type UnlockResult = { ok: true } | { ok: false; message: string | null };

/** Ask for the fingerprint, face or screen lock. `message` is null when the patient cancelled. */
export async function authenticate(promptMessage = t('common.lock.prompt')): Promise<UnlockResult> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: t('common.cancel') });
    if (result.success) return { ok: true };
    switch (result.error) {
      case 'user_cancel':
      case 'system_cancel':
      case 'app_cancel':
        return { ok: false, message: null };
      case 'not_enrolled':
      case 'passcode_not_set':
      case 'not_available':
        return { ok: false, message: t('common.lock.noScreenLock') };
      case 'lockout':
        return { ok: false, message: t('common.lock.lockout') };
      default:
        return { ok: false, message: t('common.lock.failed') };
    }
  } catch {
    return { ok: false, message: t('common.lock.failed') };
  }
}

/** Turn App Lock on (only after a successful check) or off. */
export async function setAppLock(enabled: boolean): Promise<UnlockResult> {
  if (enabled) {
    const check = await authenticate(t('common.lock.confirmPrompt'));
    if (!check.ok) return check;
  }
  await setAppLockEnabled(enabled);
  lockEnabledCache = enabled;
  return { ok: true };
}

/** Until when coming back from the background doesn't lock (an in-app flow such as paying). */
let lockDeferredUntil = 0;

/** Long enough for an e-wallet hop (GCash/Maya app, OTP); short enough not to leave the app open. */
export const LOCK_DEFER_MS = 5 * 60_000;

/**
 * Call before handing the patient to an in-app browser they're expected to spend time in, so
 * returning from it doesn't ask them to unlock. Lapses after `forMs`, and on Android also on the
 * first return to the app (the pay page is a Custom Tab: the app only comes back when it closes).
 * On iOS the pay page is shown inside the app, so hopping out to an e-wallet and back to it can
 * happen more than once; there the window simply lapses.
 */
export function deferLock(forMs = LOCK_DEFER_MS): void {
  lockDeferredUntil = Date.now() + Math.min(forMs, LOCK_DEFER_MS);
}

export function lockDeferred(): boolean {
  return Date.now() < lockDeferredUntil;
}

/** On return to the app: whether the lock is deferred. On Android this ends the deferral. */
export function takeLockDeferral(): boolean {
  const deferred = lockDeferred();
  if (deferred && Platform.OS === 'android') lockDeferredUntil = 0;
  return deferred;
}

/**
 * A fresh sign-in shouldn't be followed by a lock screen. Set by the auth provider; the guard
 * only locks on its first mount when the app opened on a stored session.
 */
let signedInThisLaunch = false;
let launchLockChecked = false;

export function noteFreshSignIn(): void {
  signedInThisLaunch = true;
}

/** True once per app launch, when the app opened on a stored session (not a fresh sign-in). */
export function takeLaunchLock(): boolean {
  if (launchLockChecked) return false;
  launchLockChecked = true;
  return !signedInThisLaunch;
}

/** Like `takeLaunchLock`, without using it up (for the guard's first render). */
export function launchLockPending(): boolean {
  return !launchLockChecked && !signedInThisLaunch;
}
