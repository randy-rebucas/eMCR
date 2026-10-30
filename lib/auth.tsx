import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  apiFetch,
  apiRequest,
  ApiError,
  AUTH_ENDPOINTS,
  query,
  setActiveProfileId,
  setSessionExpiredHandler,
  storeTokens,
  tokenClaims,
  TokenPair,
} from './api';
import { clearSession, getOrCreateDeviceId, getSession } from './storage';
import { registerForPushNotifications, watchPushToken } from './push';
import { clearDocumentCache } from './documents';
import { noteFreshSignIn } from './appLock';
import { clearOfflineCache } from './offlineCache';
import { t } from './i18n';
import { clearMedicineReminders } from './medicineReminders';
import { EmcrSession, PatientProfile, PatientSummary } from './types';

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; patient: PatientSummary | null; guardianOnly: boolean };

interface PatientTokenResponse extends TokenPair {
  patient: PatientSummary;
  /** eMCR sessions: the account has no record of its own (token `rel: "guardian"`). */
  guardianOnly?: boolean;
}

/** Whether a token is a guardian-only eMCR session (`rel: "guardian"`; refresh keeps it). */
function isGuardianToken(token: string | null | undefined): boolean {
  return !!token && tokenClaims(token)?.rel === 'guardian';
}

interface AuthContextValue {
  loading: boolean;
  signedIn: boolean;
  patient: PatientSummary | null;
  /**
   * Signed in on a record the account manages, with no record of its own (eMCR guardian-only).
   * Credential actions (password, login QR, family add/remove) aren't available.
   */
  guardianOnly: boolean;
  /** One-off message for the sign-in screen (e.g. "session expired"). */
  notice: string | null;
  clearNotice: () => void;

  loginWithPassword: (email: string, password: string) => Promise<void>;
  requestOtp: (phone: string) => Promise<string>;
  loginWithOtp: (phone: string, otp: string) => Promise<void>;
  loginWithQr: (qrCode: string) => Promise<void>;
  /**
   * Store a session from the eMCR sign-in endpoints (otp/verify, claim). Replaces any current
   * session, the same way a fresh sign-in does.
   */
  applySession: (session: EmcrSession) => Promise<void>;

  /** Store the new token pair a password change returns (other devices are signed out). */
  applyRotatedTokens: (pair: Partial<TokenPair>) => Promise<void>;
  setPatientSummary: (patient: PatientSummary) => void;
  /**
   * Sign out on this device, or everywhere. The local session is always cleared.
   * With `everywhere`, throws (after clearing) when the server didn't confirm the
   * other sessions were revoked; the same warning is also set as the sign-in `notice`.
   */
  signOut: (options?: { everywhere?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function patientSummaryFromProfile(p: PatientProfile): PatientSummary {
  return {
    id: p._id,
    patientCode: p.patientCode ?? null,
    firstName: p.firstName,
    lastName: p.lastName,
    email: p.email ?? null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  const signingOut = useRef(false);

  // A rejected refresh token anywhere in the app lands here.
  useEffect(() => {
    setSessionExpiredHandler((message) => {
      clearDocumentCache();
      clearMedicineReminders().catch(() => {});
      setState({ status: 'signedOut' });
      if (!signingOut.current) setNotice(message ?? t('common.sessionExpired'));
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  // Restore the stored session on launch.
  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (!session) {
        setState({ status: 'signedOut' });
        return;
      }
      try {
        const profile = await apiRequest<PatientProfile>('/api/patients/me');
        const current = await getSession();
        setState({
          status: 'signedIn',
          patient: patientSummaryFromProfile(profile),
          guardianOnly: isGuardianToken(current?.accessToken),
        });
        registerForPushNotifications({ prompt: false }).catch(() => {});
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          // 401 here means even the refresh failed; 403 means the account was deactivated.
          await clearSession();
          clearMedicineReminders().catch(() => {});
          setState({ status: 'signedOut' });
          if (error.status === 403) setNotice(error.message);
          return;
        }
        // Offline or server error: keep the session; screens show their own errors.
        setState({ status: 'signedIn', patient: null, guardianOnly: isGuardianToken(session.accessToken) });
      }
    })();
  }, []);

  const signedIn = state.status === 'signedIn';

  useEffect(() => {
    if (!signedIn) return;
    return watchPushToken();
  }, [signedIn]);

  const completeSignIn = useCallback(async (result: PatientTokenResponse) => {
    noteFreshSignIn();
    // A sign-in can replace another person's session without a sign-out: start with no offline copies.
    await clearOfflineCache();
    await storeTokens(result);
    setNotice(null);
    setState({
      status: 'signedIn',
      patient: result.patient,
      guardianOnly: result.guardianOnly ?? isGuardianToken(result.token),
    });
    registerForPushNotifications({ prompt: false }).catch(() => {});
  }, []);

  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      const result = await apiFetch<PatientTokenResponse>(AUTH_ENDPOINTS.token, {
        method: 'POST',
        auth: false,
        body: { method: 'password', email, password },
      });
      await completeSignIn(result);
    },
    [completeSignIn]
  );

  const requestOtp = useCallback(async (phone: string) => {
    const result = await apiFetch<{ message?: string }>('/api/patients/auth/otp/request', {
      method: 'POST',
      auth: false,
      body: { phone },
    });
    return result.message ?? t('auth.otpRequested');
  }, []);

  const loginWithOtp = useCallback(
    async (phone: string, otp: string) => {
      const result = await apiFetch<PatientTokenResponse>(AUTH_ENDPOINTS.token, {
        method: 'POST',
        auth: false,
        body: { method: 'otp', phone, otp },
      });
      await completeSignIn(result);
    },
    [completeSignIn]
  );

  const loginWithQr = useCallback(
    async (qrCode: string) => {
      const result = await apiFetch<PatientTokenResponse>(AUTH_ENDPOINTS.token, {
        method: 'POST',
        auth: false,
        body: { method: 'qr', qrCode },
      });
      await completeSignIn(result);
    },
    [completeSignIn]
  );

  const applySession = useCallback(
    async (session: EmcrSession) => {
      await completeSignIn(session);
    },
    [completeSignIn]
  );

  const applyRotatedTokens = useCallback(async (pair: Partial<TokenPair>) => {
    const session = await getSession();
    if (!session || !pair.token) return;
    await storeTokens({
      token: pair.token,
      expiresIn: pair.expiresIn,
      refreshToken: pair.refreshToken,
    });
    // A password change drops the backend's device registrations; register this one again.
    registerForPushNotifications({ prompt: false }).catch(() => {});
  }, []);

  const setPatientSummary = useCallback((patient: PatientSummary) => {
    setState((prev) => (prev.status === 'signedIn' ? { ...prev, patient } : prev));
  }, []);

  const signOut = useCallback(async (options: { everywhere?: boolean } = {}) => {
    const everywhere = options.everywhere ?? false;
    signingOut.current = true;
    let failure: unknown = null;
    try {
      const session = await getSession();
      if (session) {
        const deviceId = await getOrCreateDeviceId();
        const path = AUTH_ENDPOINTS.session + query({ deviceId, all: everywhere ? 'true' : undefined });
        try {
          // apiFetch refreshes a stale access token first. The refresh token always
          // rides along in the body, so the server can still honour the sign-out
          // when the access token has expired.
          await apiFetch(path, {
            method: 'DELETE',
            // Read at send time: if the access token had to be refreshed first, the
            // refresh token rotated and only the new one is worth revoking.
            bodyFactory: async () => {
              const current = await getSession();
              return current?.refreshToken ? { refreshToken: current.refreshToken } : undefined;
            },
          });
        } catch (error) {
          failure = error;
        }
      }
      // Whatever the server said, this device is signed out.
      setActiveProfileId(null);
      await clearSession();
      clearDocumentCache();
      await clearMedicineReminders().catch(() => {});
      setState({ status: 'signedOut' });
      if (everywhere && failure) {
        // "Everywhere" is a security action: tell the user it may not have happened.
        const message = t('auth.notice.signOutEverywhereFailed');
        setNotice(message);
        throw new ApiError(
          message,
          failure instanceof ApiError ? failure.status : 0,
          'SIGN_OUT_EVERYWHERE_FAILED',
          failure instanceof ApiError ? failure.body : undefined
        );
      }
      setNotice(null);
    } finally {
      signingOut.current = false;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading: state.status === 'loading',
      signedIn,
      patient: state.status === 'signedIn' ? state.patient : null,
      guardianOnly: state.status === 'signedIn' ? state.guardianOnly : false,
      notice,
      clearNotice: () => setNotice(null),
      loginWithPassword,
      requestOtp,
      loginWithOtp,
      loginWithQr,
      applySession,
      applyRotatedTokens,
      setPatientSummary,
      signOut,
    }),
    [
      state,
      signedIn,
      notice,
      loginWithPassword,
      requestOtp,
      loginWithOtp,
      loginWithQr,
      applySession,
      applyRotatedTokens,
      setPatientSummary,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
