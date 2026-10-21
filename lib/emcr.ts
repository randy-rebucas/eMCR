import { apiFetch, apiRequest, query } from './api';
import {
  ClinicDirectoryEntry,
  EmcrAccount,
  EmcrClaimResult,
  EmcrRedeemResult,
  EmcrVerifyResult,
  FamilyRelationship,
} from './types';

/**
 * eMCR phone sign-in, "Is this your record?", access requests and activation vouchers
 * (MOBILE_API.md, "eMCR sign-in, claim and activation").
 */

export const EMCR_ENDPOINTS = {
  otpRequest: '/api/emcr/auth/otp/request',
  otpVerify: '/api/emcr/auth/otp/verify',
  claim: '/api/emcr/auth/claim',
  accessRequests: '/api/emcr/access-requests',
  account: '/api/emcr/account',
  redeem: '/api/emcr/activation/redeem',
  clinics: '/api/tenants/directory',
} as const;

// ── Sign-in and claim ────────────────────────────────────────────────────────

/** Text a sign-in code to the number. Always the same answer, whether or not a clinic has it. */
export async function requestPhoneCode(phone: string): Promise<string> {
  const result = await apiFetch<{ message?: string }>(EMCR_ENDPOINTS.otpRequest, {
    method: 'POST',
    auth: false,
    body: { phone },
  });
  return result.message ?? 'If a clinic has this number on file, a code will arrive by SMS within a minute.';
}

/** Prove the phone. Returns a claim token, and a session when the account already has a profile. */
export function verifyPhoneCode(phone: string, otp: string): Promise<EmcrVerifyResult> {
  return apiFetch<EmcrVerifyResult>(EMCR_ENDPOINTS.otpVerify, {
    method: 'POST',
    auth: false,
    body: { phone, otp },
  });
}

export interface ClaimInput {
  relation: 'self' | 'other';
  firstName: string;
  /** YYYY-MM-DD */
  dateOfBirth: string;
  relationship?: FamilyRelationship;
}

/** "Is this your record?": attach a clinic record to the account behind `claimToken`. */
export function claimRecord(claimToken: string, input: ClaimInput): Promise<EmcrClaimResult> {
  return apiFetch<EmcrClaimResult>(EMCR_ENDPOINTS.claim, {
    method: 'POST',
    auth: false,
    body: {
      claimToken,
      relation: input.relation,
      firstName: input.firstName,
      dateOfBirth: input.dateOfBirth,
      ...(input.relation === 'other' && input.relationship ? { relationship: input.relationship } : {}),
    },
  });
}

/**
 * The phone proof between the code step and the claim steps. Kept in memory (never in router
 * params or storage): it is a 15-minute credential for this phone number.
 */
export interface ClaimContext {
  claimToken: string;
  /** Epoch ms. */
  expiresAt: number;
  peopleOnNumber: number;
  phone: string;
  /** Whether the account already holds its own record (then "It's me" doesn't apply). */
  hasOwnRecord: boolean;
  /** 'add': started from Family while signed in; return there when done. */
  mode: 'signin' | 'add';
}

let claimContext: ClaimContext | null = null;

export function setClaimContext(context: ClaimContext | null): void {
  claimContext = context;
}

/** The current claim proof, or null when there is none or it has expired. */
export function getClaimContext(): ClaimContext | null {
  if (claimContext && claimContext.expiresAt <= Date.now()) claimContext = null;
  return claimContext;
}

export function updateClaimContext(changes: Partial<ClaimContext>): void {
  if (claimContext) claimContext = { ...claimContext, ...changes };
}

export function claimContextFrom(result: EmcrVerifyResult, phone: string, mode: ClaimContext['mode']): ClaimContext {
  const parsed = Date.parse(result.claimExpiresAt);
  return {
    claimToken: result.claimToken,
    // Leave a minute of slack so the app never sends a token the server is about to refuse.
    expiresAt: (isFinite(parsed) ? parsed : Date.now() + 15 * 60_000) - 60_000,
    peopleOnNumber: result.peopleOnNumber ?? 0,
    phone,
    hasOwnRecord: !!result.account?.hasOwnRecord,
    mode,
  };
}

// ── Access requests ──────────────────────────────────────────────────────────

/** Active clinics matching `search`, for the "Request access" clinic picker. */
export function searchClinics(search: string): Promise<ClinicDirectoryEntry[]> {
  return apiRequest<ClinicDirectoryEntry[]>(EMCR_ENDPOINTS.clinics + query({ search: search.trim(), limit: 20 }), {
    auth: false,
  });
}

export interface AccessRequestInput {
  tenantId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  contactPhone?: string;
  contactEmail?: string;
}

/** Ask a clinic for access. Always the same generic answer. */
export async function requestAccess(input: AccessRequestInput): Promise<string> {
  const result = await apiFetch<{ message?: string }>(EMCR_ENDPOINTS.accessRequests, {
    method: 'POST',
    auth: false,
    body: {
      tenantId: input.tenantId,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth,
      ...(input.contactPhone ? { contactPhone: input.contactPhone } : {}),
      ...(input.contactEmail ? { contactEmail: input.contactEmail } : {}),
    },
  });
  return (
    result.message ??
    'Thank you. If the clinic has your record, we’ll send sign-in instructions to the phone number or email the clinic has on file. If not, the clinic will contact you.'
  );
}

// ── Account and activation ───────────────────────────────────────────────────

export function getEmcrAccount(): Promise<EmcrAccount> {
  return apiRequest<EmcrAccount>(EMCR_ENDPOINTS.account, { profile: false });
}

/** Redeem a voucher code for the signed-in account (any spelling; the server normalizes it). */
export function redeemActivationCode(code: string): Promise<EmcrRedeemResult> {
  return apiFetch<EmcrRedeemResult>(EMCR_ENDPOINTS.redeem, {
    method: 'POST',
    profile: false,
    body: { code: normalizeVoucherCode(code) },
  });
}

/** Characters used in voucher codes: no look-alikes (0/O, 1/I/L). */
const VOUCHER_ALPHABET = /[ABCDEFGHJKMNPQRSTUVWXYZ23456789]/;
export const VOUCHER_LENGTH = 12;

/** Uppercase, keep only code characters, at most 12. */
export function normalizeVoucherCode(input: string): string {
  return input
    .toUpperCase()
    .split('')
    .filter((ch) => VOUCHER_ALPHABET.test(ch))
    .join('')
    .slice(0, VOUCHER_LENGTH);
}

/** "ABCDEFGHJKMN" → "ABCD-EFGH-JKMN" (partial input groups as typed). */
export function formatVoucherCode(input: string): string {
  return normalizeVoucherCode(input).match(/.{1,4}/g)?.join('-') ?? '';
}

/**
 * The code from a scanned voucher QR: either the bare code or JSON
 * `{"type":"emcr_voucher","code":"…"}`. Null when the QR is something else.
 */
export function voucherCodeFromQr(data: string): string | null {
  const text = data.trim();
  let candidate: string | null = null;
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text) as { type?: unknown; code?: unknown };
      if (parsed?.type === 'emcr_voucher' && typeof parsed.code === 'string') candidate = parsed.code;
    } catch {
      return null;
    }
  } else if (/^[A-Za-z0-9\s-]+$/.test(text)) {
    candidate = text;
  }
  if (!candidate) return null;
  // Reject anything with characters codes never use, rather than silently dropping them.
  const compact = candidate.toUpperCase().replace(/[\s-]/g, '');
  if (compact.length !== VOUCHER_LENGTH || normalizeVoucherCode(compact) !== compact) return null;
  return compact;
}

// ── Dates ────────────────────────────────────────────────────────────────────

/** Mask typed digits as YYYY-MM-DD. */
export function maskBirthDate(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

/** A real calendar date in YYYY-MM-DD, not in the future, after 1900. */
export function isValidBirthDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return false;
  return y >= 1900 && date.getTime() <= Date.now();
}
