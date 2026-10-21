import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { apiRequest, setActiveProfileId, setProfileLostHandler } from './api';
import { useAuth } from './auth';
import { clearDocumentCache } from './documents';
import { useRefreshOn } from './events';
import { FamilyMember, FamilyOverview } from './types';

/** The person whose records the app is showing. */
export interface ViewingPerson {
  id: string;
  firstName: string;
  lastName: string;
  /**
   * True for the signed-in person; false for a family member they manage. Always false for a
   * guardian-only eMCR session, which is signed in on a managed record.
   */
  self: boolean;
}

interface ProfileContextValue {
  /** Null only while the signed-in person's summary hasn't loaded. */
  viewing: ViewingPerson | null;
  /** The family list (`GET /api/patients/me/family`), once loaded. */
  family: FamilyOverview | null;
  refreshFamily: () => Promise<FamilyOverview | null>;
  /**
   * Show a family member's records (null = the signed-in person's). Every screen reloads for
   * that person; then the app opens `href` (default: Home).
   */
  switchTo: (member: FamilyMember | null, href?: string) => void;
  /** Switch to the member with this record id if they're in the family; false when they aren't. */
  switchToId: (id: string, href?: string) => Promise<boolean>;
  /** Taken once by the screen tree after a switch: where to go. */
  takePendingRoute: () => string | null;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

const HOME = '/patient/home';

/**
 * Family accounts. Holds the active family profile and puts it on every API call
 * (`X-Patient-Profile`, see lib/api.ts). Starts as the signed-in person on every launch.
 */
export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { signedIn, patient, guardianOnly } = useAuth();
  const [family, setFamily] = useState<FamilyOverview | null>(null);
  const [active, setActive] = useState<FamilyMember | null>(null);
  const pendingRoute = useRef<string | null>(null);

  const refreshFamily = useCallback(async () => {
    try {
      const overview = await apiRequest<FamilyOverview>('/api/patients/me/family', { profile: false });
      setFamily(overview);
      return overview;
    } catch {
      return null;
    }
  }, []);

  const switchTo = useCallback((member: FamilyMember | null, href: string = HOME) => {
    setActiveProfileId(member?.id ?? null);
    clearDocumentCache();
    pendingRoute.current = href;
    setActive(member);
  }, []);

  const switchToId = useCallback(
    async (id: string, href?: string) => {
      if (id === patient?.id || id === family?.self?.id) {
        switchTo(null, href);
        return true;
      }
      const overview = family?.members.some((m) => m.id === id) ? family : await refreshFamily();
      const member = overview?.members.find((m) => m.id === id);
      if (!member) return false;
      switchTo(member, href);
      return true;
    },
    [family, patient?.id, refreshFamily, switchTo]
  );

  // Signed out (or a different person signed in): back to "me", forget the family.
  useEffect(() => {
    setActiveProfileId(null);
    setActive(null);
    setFamily(null);
    if (signedIn) refreshFamily();
  }, [signedIn, patient?.id, refreshFamily]);

  // A claim or removal elsewhere in the app changed who is in the family.
  useRefreshOn(signedIn ? 'family' : null, () => {
    refreshFamily();
  });

  // The server refused the active profile: back to the signed-in person and say why.
  useEffect(() => {
    setProfileLostHandler((message) => {
      switchTo(null);
      refreshFamily();
      Alert.alert('Switched back to you', message);
    });
    return () => setProfileLostHandler(null);
  }, [refreshFamily, switchTo]);

  const viewing = useMemo<ViewingPerson | null>(() => {
    if (active) return { id: active.id, firstName: active.firstName, lastName: active.lastName, self: false };
    if (patient) {
      return { id: patient.id, firstName: patient.firstName, lastName: patient.lastName, self: !guardianOnly };
    }
    return null;
  }, [active, patient, guardianOnly]);

  const value = useMemo<ProfileContextValue>(
    () => ({
      viewing,
      family,
      refreshFamily,
      switchTo,
      switchToId,
      takePendingRoute: () => {
        const href = pendingRoute.current;
        pendingRoute.current = null;
        return href;
      },
    }),
    [viewing, family, refreshFamily, switchTo, switchToId]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}

/** "Ana's" / "Your" for copy that names whose records are on screen. */
export function possessive(viewing: ViewingPerson | null): string {
  if (!viewing || viewing.self) return 'Your';
  return viewing.firstName.endsWith('s') ? `${viewing.firstName}'` : `${viewing.firstName}'s`;
}
