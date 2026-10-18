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
  notes?: string;
  doctor?: DoctorRef | null;
  createdAt?: string;
}

/** `GET /api/patients/appointments` (+ `?date&doctorId`) */
export interface BookingOptions {
  doctors: DoctorRef[];
  availableSlots?: string[];
}

export interface QueueEntry {
  _id: string;
  queueNumber: string;
  status: 'waiting' | 'in-progress' | 'completed' | 'cancelled' | 'no-show';
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
  prescribedBy?: { firstName?: string; lastName?: string; email?: string } | null;
  createdAt: string;
}

export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';

export interface Invoice {
  _id: string;
  invoiceNumber?: string;
  items?: { code?: string; description?: string; quantity: number; unitPrice: number; total: number }[];
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
  id: string;
  type: 'appointment' | 'lab_result' | 'invoice' | 'prescription';
  title: string;
  message: string;
  date: string;
  read: boolean;
  target: { screen: NotificationScreen; id: string };
}

/** `GET /api/patients/me/notifications` */
export interface NotificationsEnvelope {
  data: PatientNotification[];
  unreadCount: number;
}
