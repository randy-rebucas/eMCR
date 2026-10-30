import * as LocalAuthentication from 'expo-local-authentication';
import { getAppLockEnabled, setAppLockEnabled } from './storage';
import { t } from './i18n';

/**
 * App Lock: an optional fingerprint, face or screen-lock check before the records show, on
 * launch and after the app has been in the background for a while. It is local to the device;
 * the session itself is unchanged. The lock screen is components/PrivacyGuard.tsx.
 */

/** Lock again after this long in the background. */
export const LOCK_AFTER_MS = 30_000;

export { getAppLockEnabled };

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
  return { ok: true };
}

/** Until when coming back from the background doesn't lock (an in-app flow such as paying). */
let lockDeferredUntil = 0;

/**
 * Call before handing the patient to an in-app browser they're expected to spend time in, so
 * returning from it doesn't ask them to unlock. Lapses after `forMs`.
 */
export function deferLock(forMs = 15 * 60_000): void {
  lockDeferredUntil = Date.now() + forMs;
}

export function lockDeferred(): boolean {
  return Date.now() < lockDeferredUntil;
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
