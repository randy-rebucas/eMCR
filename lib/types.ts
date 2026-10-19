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

export type NotificationScreen = 'appointments' | 'lab-results' | 'invoices' | 'prescriptions';

export interface PatientNotification {
  /** Opaque; may carry a status suffix (e.g. `<invoiceId>:paid`). Never parse it. */
  id: string;
  type: 'appointment' | 'lab_result' | 'invoice' | 'prescription';
  title: string;
  message: string;
  date: string;
  read: boolean;
  target: { screen: NotificationScreen; id: string };
  /** Extra fields by type; invoice notifications may carry `balance` (PHP). */
  metadata?: { balance?: number } & Record<string, unknown>;
}

/** `GET /api/patients/me/notifications` */
export interface NotificationsEnvelope {
  data: PatientNotification[];
  unreadCount: number;
}
