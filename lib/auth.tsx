import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  apiFetch,
  apiRequest,
  ApiError,
  AUTH_ENDPOINTS,
  query,
  setSessionExpiredHandler,
  storeTokens,
  TokenPair,
} from './api';
import { clearSession, getOrCreateDeviceId, getSession } from './storage';
import { registerForPushNotifications, watchPushToken } from './push';
import { clearDocumentCache } from './documents';
import { PatientProfile, PatientSummary } from './types';

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; patient: PatientSummary | null };

interface PatientTokenResponse extends TokenPair {
  patient: PatientSummary;
}

interface AuthContextValue {
  loading: boolean;
  signedIn: boolean;
  patient: PatientSummary | null;
  /** One-off message for the sign-in screen (e.g. "session expired"). */
  notice: string | null;
  clearNotice: () => void;

  loginWithPassword: (email: string, password: string) => Promise<void>;
  requestOtp: (phone: string) => Promise<string>;
  loginWithOtp: (phone: string, otp: string) => Promise<void>;
  loginWithQr: (qrCode: string) => Promise<void>;

  /** Store the new token pair a password change returns (other devices are signed out). */
  applyRotatedTokens: (pair: Partial<TokenPair>) => Promise<void>;
  setPatientSummary: (patient: PatientSummary) => void;
  /** Sign out on this device, or everywhere. Throws only when "everywhere" couldn't reach the server. */
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
    setSessionExpiredHandler(() => {
      clearDocumentCache();
      setState({ status: 'signedOut' });
      if (!signingOut.current) setNotice('Your session has expired. Please sign in again.');
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
        setState({ status: 'signedIn', patient: patientSummaryFromProfile(profile) });
        registerForPushNotifications().catch(() => {});
      } catch (error) {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          // 401 here means even the refresh failed; 403 means the account was deactivated.
          await clearSession();
          setState({ status: 'signedOut' });
          if (error.status === 403) setNotice(error.message);
          return;
        }
        // Offline or server error: keep the session; screens show their own errors.
        setState({ status: 'signedIn', patient: null });
      }
    })();
  }, []);

  const signedIn = state.status === 'signedIn';

  useEffect(() => {
    if (!signedIn) return;
    return watchPushToken();
  }, [signedIn]);

  const completeSignIn = useCallback(async (result: PatientTokenResponse) => {
    await storeTokens(result);
    setNotice(null);
    setState({ status: 'signedIn', patient: result.patient });
    registerForPushNotifications().catch(() => {});
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
    return result.message ?? 'If a matching account is found, a code will be sent to your phone.';
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

  const applyRotatedTokens = useCallback(async (pair: Partial<TokenPair>) => {
    const session = await getSession();
    if (!session || !pair.token) return;
    await storeTokens({
      token: pair.token,
      expiresIn: pair.expiresIn,
      refreshToken: pair.refreshToken,
    });
  }, []);

  const setPatientSummary = useCallback((patient: PatientSummary) => {
    setState((prev) => (prev.status === 'signedIn' ? { status: 'signedIn', patient } : prev));
  }, []);

  const signOut = useCallback(async (options: { everywhere?: boolean } = {}) => {
    const everywhere = options.everywhere ?? false;
    signingOut.current = true;
    try {
      const session = await getSession();
      if (session) {
        const deviceId = await getOrCreateDeviceId();
        const path = AUTH_ENDPOINTS.session + query({ deviceId, all: everywhere ? 'true' : undefined });
        try {
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
          const alreadyExpired = error instanceof ApiError && error.code === 'SESSION_EXPIRED';
          // "Everywhere" is a security action: tell the user if it didn't happen.
          if (everywhere && !alreadyExpired) throw error;
        }
      }
      await clearSession();
      clearDocumentCache();
      setNotice(null);
      setState({ status: 'signedOut' });
    } finally {
      signingOut.current = false;
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading: state.status === 'loading',
      signedIn,
      patient: state.status === 'signedIn' ? state.patient : null,
      notice,
      clearNotice: () => setNotice(null),
      loginWithPassword,
      requestOtp,
      loginWithOtp,
      loginWithQr,
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
