import { API_BASE_URL } from './config';
import { clearSession, getSession, setSession, StoredSession } from './storage';

export class ApiError extends Error {
  status: number;
  code?: string;
  /** The parsed JSON body, when there was one (e.g. `requires2fa` / `pendingToken`). */
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
}

const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';
const NETWORK_MESSAGE = "Can't reach the server. Check your connection and try again.";
/** Refresh this long before the access token's stated expiry. */
const EXPIRY_SKEW_MS = 60_000;

// ── Session expiry notification ──────────────────────────────────────────────

let sessionExpiredHandler: (() => void) | null = null;

/** The AuthProvider registers here so a dead refresh token sends the user to sign-in. */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler;
}

async function expireSession(): Promise<never> {
  await clearSession();
  sessionExpiredHandler?.();
  throw new ApiError(SESSION_EXPIRED_MESSAGE, 401, 'SESSION_EXPIRED');
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
    accessExpiresAt: pair.expiresIn ? Date.now() + pair.expiresIn * 1000 : null,
  });
}

// ── Refresh (single-flight) ──────────────────────────────────────────────────

type RefreshOutcome = 'refreshed' | 'expired' | 'unavailable';

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
  if (!session?.refreshToken) return 'expired';

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${AUTH_ENDPOINTS.refresh}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
  } catch {
    return 'unavailable';
  }

  const json = (await readJson(response)) as (Partial<TokenPair> & { success?: boolean }) | null;

  if (response.ok && json?.token) {
    await storeTokens({
      token: json.token,
      expiresIn: json.expiresIn,
      refreshToken: json.refreshToken,
    });
    return 'refreshed';
  }

  // 401 REFRESH_INVALID / REFRESH_REUSED: the chain is dead, sign in again.
  if (response.status === 401) return 'expired';
  // 429 / 5xx: keep the session and let the caller retry later.
  return 'unavailable';
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
    const outcome = await refreshSession();
    if (outcome === 'expired') return expireSession();
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

  const outcome = await refreshSession();
  if (outcome === 'expired') return expireSession();
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
  if (token) headers.Authorization = `Bearer ${token}`;

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
