// In-app "How was your visit?" feedback. Backend: lib/visit-feedback.ts (shared with the SMS/email
// link), `GET /api/patients/me/feedback/pending` and `POST /api/patients/me/visits/[id]/feedback`.

import { apiRequest } from './api';
import { t } from './i18n';

/** A recent visit the clinic asked for feedback on, as the pending list returns it. */
export interface PendingFeedback {
  visitId: string;
  visitDate: string;
  visitType: string | null;
  /** "Dr. Maria Santos", or null when the visit has no provider. */
  providerName: string | null;
  clinicName: string | null;
  tenantId: string | null;
}

/** The form; ratings are 1–5 and only `overallRating` is required (same as the web form). */
export interface FeedbackAnswers {
  overallRating: number;
  doctorRating?: number;
  staffRating?: number;
  facilityRating?: number;
  waitTimeRating?: number;
  comments?: string;
  wouldRecommend?: boolean;
}

export const PENDING_FEEDBACK_PATH = '/api/patients/me/feedback/pending';

/** Matches the server's cap. */
export const COMMENTS_MAX = 2000;

/** The optional ratings, in the order the form asks them. `label` is translated when read. */
export const DETAIL_RATINGS: { key: keyof Pick<FeedbackAnswers, 'doctorRating' | 'staffRating' | 'facilityRating' | 'waitTimeRating'>; readonly label: string }[] = [
  {
    key: 'doctorRating',
    get label() {
      return t('patient.feedback.doctor');
    },
  },
  {
    key: 'staffRating',
    get label() {
      return t('patient.feedback.staff');
    },
  },
  {
    key: 'facilityRating',
    get label() {
      return t('patient.feedback.clinic');
    },
  },
  {
    key: 'waitTimeRating',
    get label() {
      return t('patient.feedback.waitTime');
    },
  },
];

/** Send the answers. Sending twice is harmless: `alreadySubmitted` is true the second time. */
export function submitVisitFeedback(visitId: string, answers: FeedbackAnswers): Promise<{ alreadySubmitted: boolean }> {
  const comments = answers.comments?.trim();
  return apiRequest(`/api/patients/me/visits/${encodeURIComponent(visitId)}/feedback`, {
    method: 'POST',
    body: { ...answers, comments: comments ? comments.slice(0, COMMENTS_MAX) : undefined },
  });
}

// Prompts dismissed this app session (not stored: the card comes back next launch until answered).
const dismissed = new Set<string>();

export function dismissFeedbackPrompt(visitId: string): void {
  dismissed.add(visitId);
}

export function isFeedbackPromptDismissed(visitId: string): boolean {
  return dismissed.has(visitId);
}
