// Clinic loyalty memberships (tier, points, discount). Read-only in the app; the clinic's desk
// enrols, renews and records points. Backend: `GET /api/patients/me/membership`.
import type { PlainKey } from './i18n';

export type MembershipTier = 'bronze' | 'silver' | 'gold' | 'platinum';
/** `due` = active but inside the 30-day renewal window. */
export type MembershipState = 'active' | 'due' | 'expired' | 'suspended' | 'inactive';

export interface MembershipPoints {
  type: 'earn' | 'redeem' | 'expire' | 'adjustment';
  /** Change to the balance: positive earned, negative used or expired. */
  points: number;
  description: string;
  createdAt: string | null;
}

/** One clinic's membership, as the endpoint returns it (an array, one per clinic). */
export interface PatientMembership {
  id: string;
  tenantId: string;
  clinicName: string | null;
  membershipNumber: string;
  tier: MembershipTier;
  tierLabel: string;
  status: string;
  state: MembershipState;
  points: number;
  totalPointsEarned: number;
  totalPointsRedeemed: number;
  discountPercentage: number;
  /** The discount applies to bills today (an expired or suspended membership gives none). */
  discountActive: boolean;
  /** Readable benefit names ("Priority booking"). */
  benefits: string[];
  joinDate: string | null;
  expiryDate: string | null;
  /** Latest points first (up to 10). */
  history: MembershipPoints[];
}

export const MEMBERSHIP_PATH = '/api/patients/me/membership';

/** String keys: show with `t(STATE_LABEL[state])`. */
export const STATE_LABEL: Record<MembershipState, PlainKey> = {
  active: 'membership.state.active',
  due: 'membership.state.due',
  expired: 'membership.state.expired',
  suspended: 'membership.state.suspended',
  inactive: 'membership.state.inactive',
};

/** Status chip tone: renewal due or expired needs the patient (amber); suspended is the clinic's call. */
export function stateTone(state: MembershipState): 'teal' | 'attention' | 'neutral' {
  if (state === 'active') return 'teal';
  if (state === 'due' || state === 'expired') return 'attention';
  return 'neutral';
}
