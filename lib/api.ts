import { API_BASE_URL } from './config';
import { clearSession, getSession, setSession, StoredSession } from './storage';

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

/** Called when the server says the active profile can't be used any more (unlinked, turned 18). */
export function setProfileLostHandler(handler: ((message: string) => void) | null): void {
  profileLostHandler = handler;
}

/** Called when the server says the feature needs an active eMCR year (402 ACTIVATION_REQUIRED). */
let activationRequiredHandler: ((message: string) => void) | null = null;

export function setActivationRequiredHandler(handler: ((message: string) => void) | null): void {
  activationRequiredHandler = handler;
}

/** For requests made outside `apiFetch` (file downloads) that came back 402. */
export function reportActivationRequired(message = 'Activate eMCR to use this.'): void {
  activationRequiredHandler?.(message);
}

/** Headers for an authenticated request made outside `apiFetch` (e.g. file downloads). */
export function authHeaders(token: string): Record<string, string> {
  return activeProfileId
    ? { Authorization: `Bearer ${token}`, 'X-Patient-Profile': activeProfileId }
    : { Authorization: `Bearer ${token}` };
}

const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';
const NETWORK_MESSAGE = "Can't reach the server. Check your connection and try again.";
/** Refresh this long before the access token's stated expiry. */
const EXPIRY_SKEW_MS = 60_000;

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
  await clearSession();
  sessionExpiredHandler?.(message);
  throw new ApiError(message ?? SESSION_EXPIRED_MESSAGE, 401, 'SESSION_EXPIRED');
}

// ── Token storage ────────────────────────────────────────────────────────────

/**
 * Persist a token pair from a sign-in, refresh or password-change response.
 * A response without a refresh token clears the stored one: the backend kills
 * old refresh tokens whenever it re-issues an access token for a new session version.
 */
export async function storeTokens(pair: TokenPair): Promise<void> {
  await setSession({
    accessToken: pair.token,
    refreshToken: pair.refreshToken ?? null,
    accessExpiresAt: pair.expiresIn ? Date.now() + pair.expiresIn * 1000 : jwtExpiresAt(pair.token),
  });
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

/** The access token's `exp` claim as epoch ms, or null when the token isn't a readable JWT. */
function jwtExpiresAt(token: string): number | null {
  const exp = tokenClaims(token)?.exp;
  return typeof exp === 'number' && isFinite(exp) && exp > 0 ? exp * 1000 : null;
}

// ── Refresh (single-flight) ──────────────────────────────────────────────────

interface RefreshOutcome {
  outcome: 'refreshed' | 'expired' | 'unavailable';
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
  const session = await getSession();
  if (!session?.refreshToken) return { outcome: 'expired' };

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${AUTH_ENDPOINTS.refresh}`, {
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
    await storeTokens({
      token: json.token,
      expiresIn: json.expiresIn,
      refreshToken: json.refreshToken,
    });
    return { outcome: 'refreshed' };
  }

  // 401 REFRESH_INVALID / REFRESH_REUSED: the chain is dead, sign in again.
  if (response.status === 401) return { outcome: 'expired' };
  // 403 ACCOUNT_INACTIVE: the account was deactivated; show the server's reason.
  if (response.status === 403 && json?.code === 'ACCOUNT_INACTIVE') {
    return {
      outcome: 'expired',
      message: typeof json.error === 'string' && json.error ? json.error : 'Your account is no longer active.',
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
export async function getAccessToken(): Promise<string> {
  const session = await getSession();
  if (!session) return expireSession();
  if (session.refreshToken && isExpiringSoon(session)) {
    const { outcome, message } = await refreshSession();
    if (outcome === 'expired') return expireSession(message);
    // 'unavailable': try the current token anyway; the server has the final word.
  }
  return (await getSession())?.accessToken ?? expireSession();
}

/**
 * Called after a request made with `usedToken` came back 401. Returns a token
 * worth retrying with, or signs the user out when the refresh token is dead.
 */
export async function recoverFromUnauthorized(usedToken: string): Promise<string> {
  const current = await getSession();
  if (!current) return expireSession();
  // Another request already refreshed while this one was in flight.
  if (current.accessToken !== usedToken) return current.accessToken;

  const { outcome, message } = await refreshSession();
  if (outcome === 'expired') return expireSession(message);
  if (outcome === 'unavailable') throw new ApiError(NETWORK_MESSAGE, 0, 'NETWORK');
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

async function send(path: string, options: RequestOptions, token: string | null) {
  const { method = 'GET', body, bodyFactory } = options;
  const payload = bodyFactory ? await bodyFactory() : body;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (payload !== undefined) headers['Content-Type'] = 'application/json';
  if (token) Object.assign(headers, options.profile === false ? { Authorization: `Bearer ${token}` } : authHeaders(token));

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
    });
  } catch {
    throw new ApiError(NETWORK_MESSAGE, 0, 'NETWORK');
  }
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
  let token = auth ? await getAccessToken() : null;

  let { response, json } = await send(path, options, token);

  if (auth && token && response.status === 401) {
    token = await recoverFromUnauthorized(token);
    ({ response, json } = await send(path, options, token));
  }

  // The family member's profile is gone (unlinked, or a child turned 18): back to the signed-in
  // person. The session itself is fine, so this is never treated like a 401.
  if (response.status === 403 && json?.code === 'PROFILE_FORBIDDEN') {
    profileLostHandler?.(typeof json.error === 'string' ? json.error : 'You no longer manage this family member’s records.');
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
          ? 'Too many attempts. Please wait a moment and try again.'
          : `Request failed (${response.status})`;
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
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return error instanceof ApiError ? error.message : fallback;
}

/** Build a query string, skipping empty values. */
export function query(params: Record<string, string | number | boolean | null | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}
