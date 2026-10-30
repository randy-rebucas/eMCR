// Clinic loyalty memberships (tier, points, discount). Read-only in the app; the clinic's desk
// enrols, renews and records points. Backend: `GET /api/patients/me/membership`.

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

export const STATE_LABEL: Record<MembershipState, string> = {
  active: 'Active',
  due: 'Renewal due',
  expired: 'Expired',
  suspended: 'Suspended',
  inactive: 'Inactive',
};

/** Card colours per tier (background, text on it). */
export const TIER_COLORS: Record<MembershipTier, { bg: string; fg: string; accent: string }> = {
  bronze: { bg: '#8C5A33', fg: '#FFFFFF', accent: '#E8B98F' },
  silver: { bg: '#5E6B78', fg: '#FFFFFF', accent: '#D5DDE5' },
  gold: { bg: '#8A6A12', fg: '#FFFFFF', accent: '#F4D77A' },
  platinum: { bg: '#24384F', fg: '#FFFFFF', accent: '#B8D4F0' },
};

export function tierColors(tier: string) {
  return TIER_COLORS[tier as MembershipTier] ?? TIER_COLORS.bronze;
}
