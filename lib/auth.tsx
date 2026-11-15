import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  apiFetch,
  apiRequest,
  ApiError,
  AUTH_ENDPOINTS,
  isPasswordChangeRequired,
  onServerReachable,
  query,
  setActiveProfileId,
  setSessionExpiredHandler,
  storeTokens,
  tokenClaims,
  tokenIdentity,
  TokenPair,
} from './api';
import { clearSession, getOrCreateDeviceId, getSession } from './storage';
import { registerForPushNotifications, watchPushToken } from './push';
import { clearDocumentCache } from './documents';
import { noteFreshSignIn } from './appLock';
import { emitRefresh } from './events';
import { clearOfflineCache } from './offlineCache';
import { t } from './i18n';
import { clearMedicineReminders, resumeMedicineReminders, suspendMedicineReminders } from './medicineReminders';
import { clearEmcrSignInState, getCredentialStep, noteEmcrSignInCompleted, setCredentialStep } from './emcr';
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

/**
 * Whether a token was issued for the clinic's temporary password (`pwc`): the server answers
 * 403 PASSWORD_CHANGE_REQUIRED on patient data until the patient chooses their own.
 */
function isPasswordChangeToken(token: string | null | undefined): boolean {
  return !!token && !!tokenClaims(token)?.pwc;
}

/**
 * The temporary password must be replaced before anything loads. After a relaunch the app no
 * longer has it in memory, so /create-password asks for it (a `temp` step without it).
 */
function owePasswordChange(): void {
  if (!getCredentialStep()) setCredentialStep({ mode: 'temp' }, { forSignIn: false });
}

/**
 * `/api/patients/me` with the picture (a data URI): every call here fills the header / More
 * avatar. Current servers leave the picture out unless asked; older ones ignore `include` and
 * always send it.
 */
const ME_WITH_PHOTO_PATH = '/api/patients/me?include=photo';

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

  /**
   * Store the new token pair a password change returns (other devices are signed out). Call it
   * inside the same `withSessionHold` as the password request. Stored even if the session was
   * cleared meanwhile (expired), as long as the new pair is for the same account and the patient
   * didn't sign out.
   */
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
    profileImage: p.profileImage ?? null,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [notice, setNotice] = useState<string | null>(null);
  /** The state as last rendered, for callbacks that must not re-create on every change. */
  const stateRef = useRef(state);
  stateRef.current = state;
  const signingOut = useRef(false);
  /** Who the last session on this device signed in (token identity); null after a sign-out. */
  const lastIdentity = useRef<string | null>(null);
  /** The last signed-in summary, to come back to when an expired session is restored. */
  const lastSignedIn = useRef<{ patient: PatientSummary | null; guardianOnly: boolean } | null>(null);
  useEffect(() => {
    if (state.status === 'signedIn') lastSignedIn.current = { patient: state.patient, guardianOnly: state.guardianOnly };
  }, [state]);

  // A rejected refresh token anywhere in the app lands here. Not a sign-out: reminders stop, but
  // their schedules are kept for when the same account signs in again.
  useEffect(() => {
    setSessionExpiredHandler((message) => {
      clearDocumentCache();
      clearEmcrSignInState();
      suspendMedicineReminders().catch(() => {});
      setState({ status: 'signedOut' });
      if (!signingOut.current) setNotice(message ?? t('common.sessionExpired'));
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  /**
   * Fetch the signed-in person's picture once after a sign-in, for the header and More (sign-in
   * responses carry none). Only sets a picture it got; never clears a known one. Never throws.
   */
  const loadPhoto = useCallback((patientId: string | null) => {
    apiRequest<PatientProfile>(ME_WITH_PHOTO_PATH, { profile: false })
      .then((p) => {
        if (!p.profileImage) return;
        setState((prev) =>
          prev.status === 'signedIn' && prev.patient && prev.patient.id === p._id && (patientId === null || patientId === p._id)
            ? { ...prev, patient: { ...prev.patient, profileImage: p.profileImage } }
            : prev
        );
      })
      .catch(() => {});
  }, []);

  /** `/api/patients/me` refused the stored session: 401 expired it, 403 deactivated the account. */
  const endSessionAfterRefusal = useCallback(async (error: ApiError) => {
    setActiveProfileId(null);
    await clearSession();
    clearDocumentCache();
    clearEmcrSignInState();
    if (error.status === 403) {
      lastIdentity.current = null;
      clearMedicineReminders().catch(() => {});
    } else {
      suspendMedicineReminders().catch(() => {});
    }
    setState({ status: 'signedOut' });
    if (error.status === 403) setNotice(error.message);
  }, []);

  // Restore the stored session on launch.
  useEffect(() => {
    (async () => {
      const session = await getSession();
      if (!session) {
        setState({ status: 'signedOut' });
        return;
      }
      lastIdentity.current = tokenIdentity(session.accessToken);
      if (isPasswordChangeToken(session.accessToken)) {
        // Signed in with the clinic's temporary password and never replaced it: nothing loads
        // until it is (app/index.tsx sends the patient to /create-password). Works offline too.
        owePasswordChange();
        setState({ status: 'signedIn', patient: null, guardianOnly: isGuardianToken(session.accessToken) });
        return;
      }
      try {
        const profile = await apiRequest<PatientProfile>(ME_WITH_PHOTO_PATH);
        const current = await getSession();
        setState({
          status: 'signedIn',
          patient: patientSummaryFromProfile(profile),
          guardianOnly: isGuardianToken(current?.accessToken),
        });
        registerForPushNotifications({ prompt: false }).catch(() => {});
      } catch (error) {
        if (isPasswordChangeRequired(error)) {
          owePasswordChange();
          setState({ status: 'signedIn', patient: null, guardianOnly: isGuardianToken(session.accessToken) });
          return;
        }
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          // 401 here means even the refresh failed (expired: reminders are kept for the same
          // account's next sign-in); 403 means the account was deactivated (everything goes).
          await endSessionAfterRefusal(error);
          return;
        }
        // Offline or server error: keep the session; screens show their own errors.
        setState({ status: 'signedIn', patient: null, guardianOnly: isGuardianToken(session.accessToken) });
      }
    })();
  }, []);

  const signedIn = state.status === 'signedIn';
  const summaryMissing = state.status === 'signedIn' && state.patient === null;

  useEffect(() => {
    if (!signedIn) return;
    return watchPushToken();
  }, [signedIn]);

  // Opened offline on a stored session: who is signed in is fetched again when the app comes back
  // to the foreground, when the server answers again, and every minute until it loads.
  useEffect(() => {
    if (!summaryMissing) return;
    let inFlight = false;
    let cancelled = false;
    const retry = () => {
      if (inFlight || cancelled) return;
      inFlight = true;
      apiRequest<PatientProfile>(ME_WITH_PHOTO_PATH, { profile: false })
        .then(async (profile) => {
          const current = await getSession();
          if (cancelled || !current) return;
          setState((prev) =>
            prev.status === 'signedIn' && prev.patient === null
              ? { status: 'signedIn', patient: patientSummaryFromProfile(profile), guardianOnly: isGuardianToken(current.accessToken) }
              : prev
          );
          registerForPushNotifications({ prompt: false }).catch(() => {});
        })
        .catch((error) => {
          // Still offline: try again later. A 401 is handled by the api layer (session expired).
          // A 403 without a family-profile code means the account was deactivated meanwhile.
          if (
            !cancelled &&
            error instanceof ApiError &&
            error.status === 403 &&
            error.code !== 'PROFILE_FORBIDDEN' &&
            error.code !== 'NOT_FOR_FAMILY_PROFILE' &&
            // The temporary password is still in use: the api layer opens /create-password.
            !isPasswordChangeRequired(error)
          ) {
            endSessionAfterRefusal(error).catch(() => {});
          }
        })
        .finally(() => {
          inFlight = false;
        });
    };
    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') retry();
    });
    const unsubscribe = onServerReachable(retry);
    const timer = setInterval(retry, 60_000);
    return () => {
      cancelled = true;
      appState.remove();
      unsubscribe();
      clearInterval(timer);
    };
  }, [summaryMissing, endSessionAfterRefusal]);

  const completeSignIn = useCallback(async (result: PatientTokenResponse) => {
    noteFreshSignIn();
    const identity = tokenIdentity(result.token);
    const samePerson = identity !== null && identity === lastIdentity.current;
    // A sign-in can replace another session without a sign-out, so nothing of the previous
    // person's stays: offline copies, downloaded files, the family profile, the badge. Reminders
    // are kept only when the same account signs in again.
    await clearOfflineCache();
    clearDocumentCache();
    // The password step and phone proof the sign-in screens set for this sign-in stay; anything
    // older (another person's, or a temporary password from before) goes.
    noteEmcrSignInCompleted();
    setActiveProfileId(null);
    if (result.patient?.id) await resumeMedicineReminders(result.patient.id).catch(() => {});
    else if (!samePerson) await clearMedicineReminders().catch(() => {});
    await storeTokens(result);
    lastIdentity.current = identity;
    setNotice(null);
    setState({
      status: 'signedIn',
      patient: result.patient,
      guardianOnly: result.guardianOnly ?? isGuardianToken(result.token),
    });
    emitRefresh('notifications');
    registerForPushNotifications({ prompt: false }).catch(() => {});
    // Sign-in responses carry no picture: fetch it once so the header and More show it at once.
    // Not while the clinic's temporary password is in use (the server refuses it until replaced).
    if (!isPasswordChangeToken(result.token)) loadPhoto(result.patient?.id ?? null);
  }, [loadPhoto]);

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
    if (!pair.token) return;
    const identity = tokenIdentity(pair.token);
    const session = await getSession();
    if (session) {
      // A different account signed in while the password was saving: its session stays.
      const current = tokenIdentity(session.accessToken);
      if (current && identity && current !== identity) return;
    } else if (signingOut.current || !identity || identity !== lastIdentity.current) {
      // Cleared meanwhile: a sign-out wins. An expired session (the change itself revoked the old
      // refresh token) is replaced by the new pair when it is the same account.
      return;
    }
    await storeTokens({
      token: pair.token,
      expiresIn: pair.expiresIn,
      refreshToken: pair.refreshToken,
    });
    lastIdentity.current = identity;
    if (!session) {
      const restored = lastSignedIn.current;
      setNotice(null);
      setState({
        status: 'signedIn',
        patient: restored?.patient ?? null,
        guardianOnly: restored?.guardianOnly ?? isGuardianToken(pair.token),
      });
      if (restored?.patient?.id) resumeMedicineReminders(restored.patient.id).catch(() => {});
    }
    // Opened on a temporary-password session, who is signed in couldn't load: it can now.
    const shown = stateRef.current;
    if (!isPasswordChangeToken(pair.token) && (!session || (shown.status === 'signedIn' && shown.patient === null))) {
      apiRequest<PatientProfile>(ME_WITH_PHOTO_PATH, { profile: false })
        .then((profile) => {
          setState((now) =>
            now.status === 'signedIn' && now.patient === null ? { ...now, patient: patientSummaryFromProfile(profile) } : now
          );
        })
        .catch(() => {});
    }
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
      lastIdentity.current = null;
      lastSignedIn.current = null;
      await clearSession();
      clearDocumentCache();
      clearEmcrSignInState();
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
