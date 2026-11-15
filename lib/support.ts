import { Alert, Platform } from 'react-native';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as WebBrowser from 'expo-web-browser';
import { apiRequest } from './api';
import { deferLock } from './appLock';
import { colors } from './theme';
import { t } from './i18n';

/**
 * Help, About and account deletion: the public web pages, the support message and the in-app
 * deletion request. Every call here is about the signed-in person's own account, so none sends
 * the family-profile header (`profile: false`).
 */

export const PRIVACY_URL = 'https://www.myclinicsoft.solutions/privacy';
export const TERMS_URL = 'https://www.myclinicsoft.solutions/terms';
export const DELETE_ACCOUNT_URL = 'https://www.myclinicsoft.solutions/delete-account';

/** Open one of our web pages in the in-app browser, so the patient stays in the app. */
export async function openWebPage(url: string): Promise<void> {
  try {
    // Reading the terms can take a while; coming back shouldn't ask to unlock.
    deferLock();
    await WebBrowser.openBrowserAsync(url, {
      controlsColor: colors.primary,
      toolbarColor: colors.surface,
      dismissButtonStyle: 'done',
      enableBarCollapsing: true,
    });
  } catch {
    Alert.alert(t('support.couldntOpen'), t('support.checkConnection'));
  }
}

// ── App and device details ───────────────────────────────────────────────────

export interface AppContext {
  appVersion: string;
  buildNumber: string;
  platform: string;
  osVersion: string;
}

/**
 * The installed build, read from the binary (expo-application): eas.json numbers builds remotely,
 * so app.json has no build number. In Expo Go these are Expo Go's own, or null.
 */
export function appContext(): AppContext {
  return {
    appVersion: Application.nativeApplicationVersion ?? Constants.expoConfig?.version ?? '',
    buildNumber: Application.nativeBuildVersion ?? '',
    platform: Platform.OS,
    osVersion: Device.osVersion ?? String(Platform.Version ?? ''),
  };
}

/** "1.1.5 (12)", or just "1.1.5" when the build number isn't known. */
export function versionLabel(ctx: AppContext = appContext()): string {
  return ctx.buildNumber ? `${ctx.appVersion} (${ctx.buildNumber})` : ctx.appVersion;
}

/** "Android 14" / "iOS 18.1", for showing the patient what a support message carries. */
export function platformLabel(ctx: AppContext = appContext()): string {
  const name = ctx.platform === 'ios' ? 'iOS' : ctx.platform === 'android' ? 'Android' : ctx.platform;
  return ctx.osVersion ? `${name} ${ctx.osVersion}` : name;
}

// ── Contact support ──────────────────────────────────────────────────────────

export const SUPPORT_ENDPOINT = '/api/patients/me/support';
export const SUPPORT_MESSAGE_MIN = 10;
export const SUPPORT_MESSAGE_MAX = 5000;

/** `POST /api/patients/me/support`. Resolves with the ticket reference. */
export async function sendSupportMessage(input: { message: string; email?: string }): Promise<string> {
  const body: { message: string; email?: string; context: AppContext } = {
    message: input.message.trim(),
    context: appContext(),
  };
  const email = input.email?.trim();
  if (email) body.email = email.toLowerCase();
  const data = await apiRequest<{ reference: string }>(SUPPORT_ENDPOINT, { method: 'POST', body, profile: false });
  return data.reference;
}

// ── Account deletion request ─────────────────────────────────────────────────

export const DELETION_ENDPOINT = '/api/patients/me/deletion-request';
export const DELETION_REASON_MAX = 1000;

export type DeletionStatus = 'open' | 'in-progress' | 'resolved' | 'closed';

export interface DeletionRequest {
  reference: string;
  status: DeletionStatus;
  /** ISO date. */
  requestedAt: string;
}

/** The account's deletion request, or null when there is none. */
export function getDeletionRequest(): Promise<DeletionRequest | null> {
  return apiRequest<DeletionRequest | null>(DELETION_ENDPOINT, { profile: false });
}

/** Ask for the account to be deleted. If one is already open, the server returns that one. */
export function requestDeletion(reason?: string): Promise<DeletionRequest> {
  const trimmed = reason?.trim();
  return apiRequest<DeletionRequest>(DELETION_ENDPOINT, {
    method: 'POST',
    body: trimmed ? { reason: trimmed } : {},
    profile: false,
  });
}
