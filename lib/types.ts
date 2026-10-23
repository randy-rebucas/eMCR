// Response shapes for the endpoints the app uses. Field sets follow the backend's
// Mongoose models; most are optional because records written by older clinic
// software versions may lack them.

// ── Patient: auth & profile ──────────────────────────────────────────────────

/** `patient` in the sign-in response. */
export interface PatientSummary {
  id: string;
  patientCode: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
}

/** One entry of `GET /api/patients/me/clinics`: a clinic the patient is registered at. */
export interface PatientClinic {
  tenantId: string;
  name: string;
  subdomain: string | null;
  logo: string | null;
  address: { street?: string; city?: string; state?: string; zipCode?: string; country?: string } | null;
  phone: string | null;
  /** The patient's code at this clinic. */
  patientCode: string | null;
  lastVisitAt: string | null;
}

/** `GET /api/patients/me` */
export interface PatientProfile {
  _id: string;
  patientCode?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  dateOfBirth?: string;
  sex?: string;
  email?: string;
  phone?: string;
  contacts?: { phone?: string; email?: string; address?: string };
  address?: { street?: string; city?: string; state?: string; zipCode?: string };
  emergencyContact?: { name?: string; phone?: string; relationship?: string };
  hasPassword?: boolean;
  /** Recorded by the clinic; read-only for the patient. */
  allergies?: Array<string | { substance: string; reaction?: string; severity?: string }>;
  preExistingConditions?: Array<{ condition: string; status?: 'active' | 'resolved' | 'chronic'; notes?: string }>;
}

/** The only fields `PATCH /api/patients/me` accepts. */
export interface PatientProfileUpdate {
  contacts?: { email?: string; address?: string };
  address?: { street?: string; city?: string; state?: string; zipCode?: string };
  emergencyContact?: { name?: string; phone?: string; relationship?: string };
}

// ── Patient: records ─────────────────────────────────────────────────────────

export type AppointmentStatus =
  | 'pending'
  | 'scheduled'
  | 'confirmed'
  | 'rescheduled'
  | 'no-show'
  | 'completed'
  | 'cancelled';

export interface DoctorRef {
  _id?: string;
  firstName: string;
  lastName: string;
  specialization?: string;
}

export interface Appointment {
  _id: string;
  appointmentCode?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  scheduledAt?: string;
  duration?: number;
  status: AppointmentStatus;
  reason?: string;
  room?: string;
  doctor?: DoctorRef | null;
  createdAt?: string;
  /** 'teleconsult' for a video visit. Missing on older servers (= in person). */
  modality?: 'in-person' | 'teleconsult';
  /** Video visit join details; null for in-person visits. */
  teleconsult?: Teleconsult | null;
}

export interface Teleconsult {
  /** Only present while the call can be joined (15 min before start until 2 h after the end). */
  joinUrl: string | null;
  opensAt: string | null;
  closesAt: string | null;
  joinable: boolean;
}

/** `GET /api/patients/appointments` (+ `?date&doctorId`) */
export interface BookingDoctor extends DoctorRef {
  /** "Mon–Fri 9 AM–5 PM · Sat 9 AM–12 PM"; null when the clinic hasn't set weekly hours. */
  hoursSummary?: string | null;
  /** "yyyy-MM-dd" days the doctor sees patients (next 60 days). Missing on older servers. */
  bookableDates?: string[];
}

export interface BookingOptions {
  doctors: BookingDoctor[];
  availableSlots?: string[];
  /** The doctor isn't seeing patients on the requested date. */
  dayOff?: boolean;
  /** The clinic takes video-visit bookings. */
  teleconsultAvailable?: boolean;
}

export interface QueueEntry {
  _id: string;
  queueNumber: string;
  queueType?: 'appointment' | 'walk-in' | 'follow-up';
  status: 'waiting' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
  /** Only checked-in patients appear on the clinic's queue display. */
  checkedIn?: boolean;
  /** JSON the clinic kiosk/front desk scans to check the patient in. */
  qrCode?: string;
  queuedAt?: string;
  position: number | null;
  estimatedWaitTime?: number;
  doctor?: { firstName: string; lastName: string } | null;
  room?: { name: string } | null;
}

export interface LabResult {
  _id: string;
  requestCode?: string;
  status: string;
  orderDate?: string;
  resultDate?: string;
  request?: {
    testType: string;
    description?: string;
    urgency?: string;
    specialInstructions?: string;
    fastingRequired?: boolean;
    preparationNotes?: string;
  };
  /** Structured values, e.g. `{ hb: 13.2 }`. */
  results?: Record<string, unknown> | null;
  referenceRanges?: Record<string, unknown> | null;
  abnormalFlags?: Record<string, 'high' | 'low' | 'normal'> | null;
  interpretation?: string;
  createdAt: string;
}

export interface Medication {
  name: string;
  genericName?: string;
  form?: string;
  strength?: string;
  dose?: string;
  route?: string;
  frequency?: string;
  durationDays?: number;
  quantity?: number;
  instructions?: string;
}

export interface Prescription {
  _id: string;
  prescriptionCode?: string;
  status?: string;
  issuedAt?: string;
  medications: Medication[];
  notes?: string;
  /** `{ _id, name }` from current servers; older servers sent firstName/lastName/email. */
  prescribedBy?: {
    _id?: string;
    name?: string;
    /** @deprecated older servers only */
    firstName?: string;
    /** @deprecated older servers only */
    lastName?: string;
    /** @deprecated older servers only */
    email?: string;
  } | null;
  /** The encounter it was written in (header fields only); a bare id from older servers. */
  visit?: PrescriptionVisit | string | null;
  pharmacyDispenses?: { pharmacyName?: string; dispensedAt?: string }[];
  createdAt: string;
}

export interface PrescriptionVisit {
  _id: string;
  date?: string;
  visitType?: 'consultation' | 'follow-up' | 'checkup' | 'emergency' | 'teleconsult' | 'vaccination';
  visitCode?: string;
  /** Treating provider, when the server includes it: `{ _id, name }` only. */
  provider?: { _id?: string; name?: string } | null;
}

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';

export interface Invoice {
  _id: string;
  invoiceNumber?: string;
  items?: { code?: string; description?: string; category?: string; quantity: number; unitPrice: number; total: number }[];
  subtotal?: number;
  discounts?: { type: string; reason?: string; amount: number }[];
  tax?: number;
  total?: number;
  payments?: { method: string; amount: number; date: string; receiptNo?: string }[];
  outstandingBalance?: number;
  status: InvoiceStatus;
  createdAt: string;
}

/** `GET /api/patients/me/invoices` */
export interface InvoiceListEnvelope {
  data: Invoice[];
  summary?: { outstandingBalance: number; unpaidCount: number };
}

/** `GET /api/patients/me/invoices/[id]` */
export interface InvoiceDetailEnvelope {
  data: Invoice;
  summary: { paid: number; balance: number };
}

export interface PatientDocument {
  _id: string;
  documentCode?: string;
  title: string;
  description?: string;
  category?: string;
  documentType?: 'pdf' | 'image' | 'word' | 'excel' | 'other';
  filename?: string;
  size?: number;
  uploadDate?: string;
}

/** 'messages' has no screen of its own: the full text is shown in the feed. */
export type NotificationScreen = 'appointments' | 'lab-results' | 'invoices' | 'prescriptions' | 'messages';

export interface PatientNotification {
  /** Opaque; may carry a status suffix (e.g. `<invoiceId>:paid`). Never parse it. */
  id: string;
  /** 'message': sent by the clinic (a doctor's note, an announcement); `metadata.from` names the sender. */
  type: 'appointment' | 'lab_result' | 'invoice' | 'prescription' | 'message';
  title: string;
  message: string;
  date: string;
  read: boolean;
  target: { screen: NotificationScreen; id: string };
  /** Extra fields by type; invoice notifications may carry `balance` (PHP). */
  metadata?: { balance?: number; from?: string } & Record<string, unknown>;
}

/** `GET /api/patients/me/notifications` */
export interface NotificationsEnvelope {
  data: PatientNotification[];
  unreadCount: number;
}

// ── Family accounts ──────────────────────────────────────────────────────────

/** A person the signed-in patient manages. `id` is sent as `X-Patient-Profile`. */
export interface FamilyMember {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  sex: string | null;
  relationship: string | null;
  /** 'phone': added in the app (a minor on the patient's phone number); 'clinic': added by staff. */
  source: 'phone' | 'clinic';
  /** For 'phone' links: the 18th birthday, when access ends (YYYY-MM-DD). */
  accessEndsAt: string | null;
  clinics: string[];
}

/** A minor registered with the patient's phone number who can be added. */
export interface FamilySuggestion {
  key: string;
  firstName: string;
  lastInitial: string;
  birthYear: number | null;
  clinics: string[];
}

/** `GET /api/patients/me/family` */
export interface FamilyOverview {
  /**
   * Null for a guardian-only eMCR account (no record of its own): the session is signed in on
   * one of `members`.
   */
  self: { id: string; firstName: string; lastName: string } | null;
  /** True when `self` is null. Missing from older servers. */
  guardianOnly?: boolean;
  members: FamilyMember[];
  suggestions: FamilySuggestion[];
}

// ── eMCR account, claim and activation ───────────────────────────────────────

/** Relationships accepted by `POST /api/emcr/auth/claim` (`relationship`). */
export const FAMILY_RELATIONSHIPS = ['child', 'parent', 'spouse', 'sibling', 'grandparent', 'grandchild', 'other'] as const;
export type FamilyRelationship = (typeof FAMILY_RELATIONSHIPS)[number];

/** The account's activation year. */
export interface EmcrActivation {
  active: boolean;
  plan: 'basic' | 'plus' | null;
  activatedAt: string | null;
  expiresAt: string | null;
  /** Whole days until `expiresAt` (0 when inactive). */
  daysLeft: number;
  /** False while the server doesn't gate features on activation yet. */
  enforced: boolean;
}

/** `GET /api/emcr/account` (and `account` on the sign-in/claim responses, without `guardianOnly`). */
export interface EmcrAccount {
  id: string | null;
  hasOwnRecord: boolean;
  guardianOnly?: boolean;
  pendingRequests: number;
  /** False until the holder chooses a password for mobile number + password sign-in. */
  hasPassword?: boolean;
  /** Signed in with the clinic's temporary password: must choose their own before going on. */
  mustChangePassword?: boolean;
  /**
   * Structured login ID, e.g. `qc01.jdc.19900425@myclinicsoft.solutions`: signs in with the password
   * like the mobile number. Not a mailbox. Null for guardian-only accounts and until one is given.
   */
  loginId?: string | null;
  activation: EmcrActivation;
}

/** Bearer fields from the eMCR sign-in endpoints (same shape as `POST /api/patients/auth/token`). */
export interface EmcrSession {
  token: string;
  tokenType?: 'Bearer';
  expiresIn?: number;
  refreshToken?: string | null;
  refreshExpiresIn?: number;
  guardianOnly?: boolean;
  patient: PatientSummary;
}

/** `POST /api/emcr/auth/otp/verify` */
export interface EmcrVerifyResult {
  claimToken: string;
  claimExpiresAt: string;
  peopleOnNumber: number;
  account: EmcrAccount;
  /** Null on a first sign-in: ask "Is this your record?" with `claimToken`. */
  session: EmcrSession | null;
}

/** `POST /api/emcr/auth/claim` */
export interface EmcrClaimResult {
  status: 'linked' | 'already_linked' | 'pending_approval';
  profileId?: string;
  /** For `pending_approval`: how many clinics were asked. */
  clinics?: number;
  account: EmcrAccount;
  session: EmcrSession | null;
}

/** `POST /api/emcr/invite/preview` */
export interface EmcrInvitePreview {
  clinicName: string;
  mode: 'self' | 'guardian';
  /** "Maria D." for each person on the invite; the first is the record it was made from. */
  people: string[];
  /** The masked number the sign-in code goes to. */
  phoneHint: string;
  expiresAt: string;
}

/** `POST /api/emcr/invite/redeem` and `POST /api/emcr/auth/password` */
export interface EmcrInviteRedeemResult {
  account: EmcrAccount;
  session: EmcrSession | null;
}

/** `POST /api/emcr/activation/redeem` */
export interface EmcrRedeemResult {
  message?: string;
  activation: EmcrActivation;
  soldBy?: string | null;
}

/** `GET /api/tenants/directory` row. */
export interface ClinicDirectoryEntry {
  id: string;
  name: string;
  displayName: string;
  subdomain: string;
  city: string | null;
  state: string | null;
  country: string | null;
  logo: string | null;
}

// ── Health summary ───────────────────────────────────────────────────────────

export interface SummaryMedication {
  name: string;
  genericName: string | null;
  strength: string | null;
  dose: string | null;
  frequency: string | null;
  route: string | null;
  durationDays: number | null;
  instructions: string | null;
  issuedAt: string;
  endsAt: string | null;
  prescriptionId: string;
  prescriber: string | null;
  clinic: string | null;
}

/** `GET /api/patients/me/health-summary` */
export interface HealthSummary {
  generatedAt: string;
  patient: {
    firstName: string;
    middleName: string | null;
    lastName: string;
    suffix: string | null;
    dateOfBirth: string | null;
    sex: string | null;
  };
  clinics: { tenantId: string; name: string; patientCode: string | null }[];
  allergies: { substance: string; reaction: string | null; severity: string | null; clinics: string[] }[];
  conditions: {
    condition: string;
    status: 'active' | 'resolved' | 'chronic';
    diagnosisDate: string | null;
    notes: string | null;
    clinics: string[];
  }[];
  medications: { current: SummaryMedication[]; recent: SummaryMedication[] };
  immunizations: { name: string; date: string; batch: string | null; notes: string | null; clinic: string | null }[];
}

// ── Self check-in ────────────────────────────────────────────────────────────

/** `POST /api/patients/me/check-in` */
export interface CheckInResult {
  status: 'checked-in' | 'already-checked-in';
  queue: QueueEntry & { clinic: { tenantId: string; name: string | null } };
}
