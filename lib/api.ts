import { API_BASE_URL } from './config';
import { clearSession, getSession, sessionGeneration, setSession, StoredSession } from './storage';
import { t } from './i18n';

export class ApiError extends Error {
  status: number;
  code?: string;
  /** The parsed JSON body, when there was one (e.g. validation `details`). */
  body: unknown;

  constructor(message: string, status: number, code?: string, body?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/** Session lifecycle endpoints. */
export const AUTH_ENDPOINTS = {
  token: '/api/patients/auth/token',
  refresh: '/api/patients/auth/refresh',
  session: '/api/patients/session',
  devices: '/api/patients/me/devices',
} as const;

/** Fields every sign-in, refresh and password-change response carries. */
export interface TokenPair {
  token: string;
  tokenType?: 'Bearer';
  /** Access-token lifetime in seconds. */
  expiresIn?: number;
  refreshToken?: string | null;
  refreshExpiresIn?: number;
}

/** Envelope for list endpoints. */
export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
  /** `GET /api/patients/me/appointments` sends `pages` instead of `totalPages`. */
  pages?: number;
}

export interface ListEnvelope<T> {
  success: true;
  data: T[];
  pagination?: Pagination;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: Method;
  body?: unknown;
  /**
   * Builds the body at send time, once per attempt. Used by sign-out so a retry
   * after a token refresh sends the *new* refresh token, not the spent one.
   */
  bodyFactory?: () => Promise<unknown>;
  auth?: boolean; // default true
  /**
   * Send the active family profile (`X-Patient-Profile`) so the call answers for that person.
   * Default true; false for calls that are always about the signed-in person (the family list).
   */
  profile?: boolean;
  /**
   * Answer for this family profile instead of the app's current one: a record id, or null for the
   * signed-in person (no header). Read when the call is made, so a profile switch meanwhile
   * doesn't change who the call is about. Background work (reminder sync) always passes it.
   */
  profileId?: string | null;
  /**
   * The call is part of a session hold (`withSessionHold`, e.g. the password save itself): its own
   * 401 recovery doesn't wait for the hold to end.
   */
  inSessionHold?: boolean;
  /** Give up after this long (default `REQUEST_TIMEOUT_MS`). */
  timeoutMs?: number;
}

// ── Family profile ───────────────────────────────────────────────────────────

/**
 * The family member whose records the app is showing (their record id), or null for the
 * signed-in person. Sent as `X-Patient-Profile` on authenticated calls; set by ProfileProvider.
 */
let activeProfileId: string | null = null;
let profileLostHandler: ((message: string) => void) | null = null;

export function setActiveProfileId(id: string | null): void {
  activeProfileId = id;
}

/** The active family profile's record id (null = the signed-in person). Offline copies are keyed by it. */
export function getActiveProfileId(): string | null {
  return activeProfileId;
}

/** Called when the server says the active profile can't be used any more (unlinked, turned 18). */
export function setProfileLostHandler(handler: ((message: string) => void) | null): void {
  profileLostHandler = handler;
}

/** Called when the server says the feature needs an active eMCR year (402 ACTIVATION_REQUIRED). */
let activationRequiredHandler: ((message: string) => void) | null = null;

export function setActivationRequiredHandler(handler: ((message: string) => void) | null): void {
  activationRequiredHandler = handler;
}

/**
 * For requests made outside `apiFetch` (file downloads) refused with 403: when a family profile
 * is active, the server most likely no longer lets this account see it (PROFILE_FORBIDDEN).
 * Returns true when the profile-lost handler ran.
 */
export function reportProfileLost(message = t('common.profileLost')): boolean {
  if (!activeProfileId || !profileLostHandler) return false;
  profileLostHandler(message);
  return true;
}

/** For requests made outside `apiFetch` (file downloads) that came back 402. */
export function reportActivationRequired(message = t('common.activateToUse')): void {
  activationRequiredHandler?.(message);
}

/**
 * Headers for an authenticated request made outside `apiFetch` (e.g. file downloads). `profileId`
 * defaults to the active family profile; null = the signed-in person.
 */
export function authHeaders(token: string, profileId: string | null = activeProfileId): Record<string, string> {
  return profileId
    ? { Authorization: `Bearer ${token}`, 'X-Patient-Profile': profileId }
    : { Authorization: `Bearer ${token}` };
}

// ── Server reachability ──────────────────────────────────────────────────────

/** True after a call failed to reach the server, until one gets an answer again. */
let serverUnreachable = false;
const reachableListeners = new Set<() => void>();

/**
 * Called when a call gets an answer from the server after earlier calls couldn't reach it (the
 * connection came back). The app has no network-state module; this is what the offline banners
 * go by too: the next successful request.
 */
export function onServerReachable(listener: () => void): () => void {
  reachableListeners.add(listener);
  return () => {
    reachableListeners.delete(listener);
  };
}

function noteReachable(reachable: boolean): void {
  if (!reachable) {
    serverUnreachable = true;
    return;
  }
  if (!serverUnreachable) return;
  serverUnreachable = false;
  reachableListeners.forEach((l) => {
    try {
      l();
    } catch {
      // A listener's failure is its own.
    }
  });
}

// ── Session hold (password changes) ──────────────────────────────────────────

/**
 * A password change signs every other session out and answers with a new token pair for this
 * one. While it is in flight, another call can get a 401 for the old token; refreshing then would
 * spend the (now revoked) refresh token and sign the patient out just before the new pair lands.
 * During a hold, token refresh and 401 recovery wait for the hold to end (bounded), then use
 * whatever session is stored by then.
 */
let sessionHolds = 0;
let holdWaiters: (() => void)[] = [];
/** A hold never keeps other calls waiting longer than this. */
const MAX_HOLD_WAIT_MS = 45_000;

export async function withSessionHold<T>(task: () => Promise<T>): Promise<T> {
  sessionHolds++;
  try {
    return await task();
  } finally {
    sessionHolds--;
    if (sessionHolds === 0) {
      const waiters = holdWaiters;
      holdWaiters = [];
      waiters.forEach((w) => w());
    }
  }
}

/** Whether a session hold (password change) is in flight. */
export function sessionHeld(): boolean {
  return sessionHolds > 0;
}

function waitForSessionHold(): Promise<void> {
  if (sessionHolds === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, MAX_HOLD_WAIT_MS);
    function done() {
      clearTimeout(timer);
      holdWaiters = holdWaiters.filter((w) => w !== done);
      resolve();
    }
    holdWaiters.push(done);
  });
}

// Functions, not constants, so the text follows the app language.
const SESSION_EXPIRED_MESSAGE = () => t('common.sessionExpired');
const NETWORK_MESSAGE = () => t('common.network');
/** Refresh this long before the access token's stated expiry. */
const EXPIRY_SKEW_MS = 60_000;
/**
 * React Native's fetch never times out on its own: on a dead connection a request can hang for
 * minutes, and the screens that poll (the queue) skip polls while one is still in flight.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/** `fetch` that rejects (with an AbortError) after `timeoutMs`. */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── Session expiry notification ──────────────────────────────────────────────

/**
 * Called when the session is gone. `message` is a server-supplied reason (e.g. a
 * deactivated account) to show on the sign-in screen instead of the generic notice.
 */
export type SessionExpiredHandler = (message?: string) => void;

let sessionExpiredHandler: SessionExpiredHandler | null = null;

/** The AuthProvider registers here so a dead refresh token sends the user to sign-in. */
export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  sessionExpiredHandler = handler;
}

async function expireSession(message?: string): Promise<never> {
  activeProfileId = null;
  await clearSession();
  sessionExpiredHandler?.(message);
  throw new ApiError(message ?? SESSION_EXPIRED_MESSAGE(), 401, 'SESSION_EXPIRED');
}

// ── Token storage ────────────────────────────────────────────────────────────

/**
 * Persist a token pair from a sign-in, refresh or password-change response.
 * A response without a refresh token clears the stored one: the backend kills
 * old refresh tokens whenever it re-issues an access token for a new session version.
 * With `ifGeneration` (refresh), returns false without storing when the session changed meanwhile.
 */
export async function storeTokens(pair: TokenPair, ifGeneration?: number): Promise<boolean> {
  return setSession(
    {
      accessToken: pair.token,
      refreshToken: pair.refreshToken ?? null,
      accessExpiresAt: pair.expiresIn ? Date.now() + pair.expiresIn * 1000 : jwtExpiresAt(pair.token),
    },
    { ifGeneration }
  );
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decode base64url to a UTF-8 string without relying on `atob`/`Buffer`. Null when malformed. */
function decodeBase64Url(input: string): string | null {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]*$/.test(b64) || b64.length % 4 === 1) return null;
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of b64) {
    buffer = (buffer << 6) | BASE64_ALPHABET.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  try {
    return decodeURIComponent(bytes.map((b) => `%${b.toString(16).padStart(2, '0')}`).join(''));
  } catch {
    return null;
  }
}

/** The access token's payload (decoded, not verified), or null when it isn't a readable JWT. */
export function tokenClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  const json = decodeBase64Url(parts[1]);
  if (!json) return null;
  try {
    const claims = JSON.parse(json) as unknown;
    return claims && typeof claims === 'object' ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Who a token signs in (the eMCR account, else the patient record), or null when unreadable.
 * Used to tell "the same person again" from "someone else" without a server call.
 */
export function tokenIdentity(token: string | null | undefined): string | null {
  if (!token) return null;
  const claims = tokenClaims(token);
  const id = claims?.acc ?? claims?.patientId ?? claims?.sub;
  return typeof id === 'string' && id ? id : null;
}

/** The access token's `exp` claim as epoch ms, or null when the token isn't a readable JWT. */
function jwtExpiresAt(token: string): number | null {
  const exp = tokenClaims(token)?.exp;
  return typeof exp === 'number' && isFinite(exp) && exp > 0 ? exp * 1000 : null;
}

// ── Refresh (single-flight) ──────────────────────────────────────────────────

interface RefreshOutcome {
  /** 'superseded': the user signed out or in while the refresh ran; its tokens were dropped. */
  outcome: 'refreshed' | 'expired' | 'unavailable' | 'superseded';
  /** Server reason for an 'expired' outcome (e.g. account deactivated). */
  message?: string;
}

let refreshInFlight: Promise<RefreshOutcome> | null = null;

/**
 * Trade the stored refresh token for a new pair. Concurrent callers share one
 * request: refresh tokens are single use, so two parallel refreshes would make
 * the second look like token reuse and revoke the whole chain.
 */
function refreshSession(): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function performRefresh(): Promise<RefreshOutcome> {
  const generation = sessionGeneration();
  const session = await getSession();
  if (!session?.refreshToken) return { outcome: 'expired' };

  let response: Response;
  try {
    response = await fetchWithTimeout(`${API_BASE_URL}${AUTH_ENDPOINTS.refresh}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
  } catch {
    return { outcome: 'unavailable' };
  }

  const json = (await readJson(response)) as
    | (Partial<TokenPair> & { success?: boolean; code?: string; error?: string })
    | null;

  if (response.ok && json?.token) {
    const stored = await storeTokens(
      { token: json.token, expiresIn: json.expiresIn, refreshToken: json.refreshToken },
      generation
    );
    return { outcome: stored ? 'refreshed' : 'superseded' };
  }
  // A lost or unreadable success body is retried later. The server accepts the spent token
  // again for a short grace period, so the retry doesn't look like token theft.

  // 401 REFRESH_INVALID / REFRESH_REUSED: the chain is dead, sign in again.
  if (response.status === 401) return { outcome: 'expired' };
  // 403 ACCOUNT_INACTIVE: the account was deactivated; show the server's reason.
  if (response.status === 403 && json?.code === 'ACCOUNT_INACTIVE') {
    return {
      outcome: 'expired',
      message: typeof json.error === 'string' && json.error ? json.error : t('common.accountInactive'),
    };
  }
  // 429 / 5xx: keep the session and let the caller retry later.
  return { outcome: 'unavailable' };
}

function isExpiringSoon(session: StoredSession): boolean {
  return session.accessExpiresAt !== null && session.accessExpiresAt - EXPIRY_SKEW_MS <= Date.now();
}

/**
 * A usable access token for an authenticated call made outside `apiFetch`
 * (e.g. file downloads). Refreshes first when the stored one is about to expire.
 */
export async function getAccessToken(options: { inSessionHold?: boolean } = {}): Promise<string> {
  let session = await getSession();
  if (!session) return expireSession();
  if (session.refreshToken && isExpiringSoon(session) && sessionHeld() && !options.inSessionHold) {
    // A password change may be rotating the pair right now; its new tokens make this refresh moot.
    await waitForSessionHold();
    session = await getSession();
    if (!session) return currentTokenAfterSupersede();
  }
  if (session.refreshToken && isExpiringSoon(session)) {
    const { outcome, message } = await refreshSession();
    if (outcome === 'expired') return expireSession(message);
    if (outcome === 'superseded') return currentTokenAfterSupersede();
    // 'unavailable': try the current token anyway; the server has the final word.
  }
  return (await getSession())?.accessToken ?? expireSession();
}

/**
 * After a refresh was superseded: the new session's token, or (signed out) a quiet failure.
 * Not `expireSession`: the user chose to sign out, so there is no "session expired" notice.
 */
async function currentTokenAfterSupersede(): Promise<string> {
  const current = await getSession();
  if (current) return current.accessToken;
  throw new ApiError(SESSION_EXPIRED_MESSAGE(), 401, 'SIGNED_OUT');
}

/**
 * Called after a request made with `usedToken` came back 401. Returns a token
 * worth retrying with, or signs the user out when the refresh token is dead.
 */
export async function recoverFromUnauthorized(usedToken: string, options: { inSessionHold?: boolean } = {}): Promise<string> {
  // The 401 may be the password change revoking the old token: wait for its new pair.
  if (sessionHeld() && !options.inSessionHold) await waitForSessionHold();
  const current = await getSession();
  if (!current) return expireSession();
  // Another request already refreshed while this one was in flight.
  if (current.accessToken !== usedToken) return current.accessToken;

  const { outcome, message } = await refreshSession();
  if (outcome === 'expired') return expireSession(message);
  if (outcome === 'superseded') return currentTokenAfterSupersede();
  if (outcome === 'unavailable') throw new ApiError(NETWORK_MESSAGE(), 0, 'NETWORK');
  const refreshed = await getSession();
  return refreshed?.accessToken ?? expireSession();
}

// ── Requests ─────────────────────────────────────────────────────────────────

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // Non-JSON response (e.g. 204, proxy error page).
    return null;
  }
}

/** The family profile a call is about: explicit `profileId`, else the active one (null = self). */
function profileFor(options: RequestOptions): string | null {
  if (options.profile === false) return null;
  if (options.profileId !== undefined) return options.profileId;
  return activeProfileId;
}

async function send(path: string, options: RequestOptions, token: string | null) {
  const { method = 'GET', body, bodyFactory } = options;
  const payload = bodyFactory ? await bodyFactory() : body;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  if (token) Object.assign(headers, authHeaders(token, profileFor(options)));

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_BASE_URL}${path}`,
      { method, headers, body: payload !== undefined ? JSON.stringify(payload) : undefined },
      options.timeoutMs
    );
  } catch {
    noteReachable(false);
    throw new ApiError(NETWORK_MESSAGE(), 0, 'NETWORK');
  }
  noteReachable(true);
  return { response, json: (await readJson(response)) as Record<string, unknown> | null };
}

/**
 * Fetch wrapper for the patient REST API. Returns the
 * whole JSON envelope (use it when you need `pagination`, `summary`, `unreadCount`).
 *
 * Authenticated calls send `Authorization: Bearer <token>`. On a 401 the wrapper
 * refreshes the token once (shared with any concurrent 401s) and retries; if the
 * refresh token is rejected the session is cleared and the user is sent to sign-in.
 */
export async function apiFetch<E = unknown>(path: string, options: RequestOptions = {}): Promise<E> {
  const auth = options.auth ?? true;
  // Fixed for the call (both attempts): a profile switch meanwhile doesn't change who it is about.
  const profileId = profileFor(options);
  const sendOptions: RequestOptions = { ...options, profileId };
  let token = auth ? await getAccessToken({ inSessionHold: options.inSessionHold }) : null;

  let { response, json } = await send(path, sendOptions, token);

  if (auth && token && response.status === 401) {
    token = await recoverFromUnauthorized(token, { inSessionHold: options.inSessionHold });
    ({ response, json } = await send(path, sendOptions, token));
  }

  // The family member's profile is gone (unlinked, or a child turned 18): back to the signed-in
  // person. The session itself is fine, so this is never treated like a 401. Only when the call
  // was about the profile on screen: background work for another profile handles it itself.
  if (response.status === 403 && json?.code === 'PROFILE_FORBIDDEN' && profileId !== null && profileId === activeProfileId) {
    profileLostHandler?.(typeof json.error === 'string' ? json.error : t('common.profileLost'));
  }

  // eMCR isn't activated: the app opens the "Enter your activation code" screen. The call still
  // fails, so the screen that made it shows the server's message too.
  if (response.status === 402 && json?.code === 'ACTIVATION_REQUIRED') {
    reportActivationRequired(typeof json.error === 'string' ? json.error : undefined);
  }

  if (!response.ok || json?.success === false) {
    const message =
      typeof json?.error === 'string'
        ? json.error
        : response.status === 429
          ? t('common.tooManyAttempts')
          : t('common.requestFailed', { status: response.status });
    throw new ApiError(message, response.status, typeof json?.code === 'string' ? json.code : undefined, json);
  }

  return json as E;
}

/** Like `apiFetch`, but unwraps `data` from the `{ success, data }` envelope. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const json = await apiFetch<Record<string, unknown> | null>(path, options);
  return (json && 'data' in json ? json.data : json) as T;
}

/** Message to show for any error thrown by the api layer. */
export function errorMessage(error: unknown, fallback = t('common.somethingWrong')): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** Build a query string, skipping empty values. */
export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
