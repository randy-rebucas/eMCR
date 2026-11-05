// Health-summary share links: a link the patient sends to another doctor so they can open the
// health summary PDF without the app. Backend: lib/health-summary-share.ts and
// `/api/patients/me/share-links` (create, list) and `/share-links/[id]` (revoke).

import { apiRequest } from './api';
import { t } from './i18n';

export type ShareLinkDuration = '24h' | '7d' | '30d';
export type ShareLinkStatus = 'active' | 'expired' | 'revoked';

/** One link as `GET /api/patients/me/share-links` lists it. The URL itself is never listed. */
export interface ShareLink {
  id: string;
  label: string | null;
  status: ShareLinkStatus;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  accessCount: number;
  lastAccessedAt: string | null;
  /** Made by a family manager for this profile. */
  sharedByFamily: boolean;
}

export interface ShareLinkList {
  links: ShareLink[];
  /** Most links that can be active at once. */
  maxActive: number;
}

export const SHARE_LINKS_PATH = '/api/patients/me/share-links';

// Labels are getters so they read in the current language.
export const DURATIONS: { value: ShareLinkDuration; readonly label: string }[] = [
  {
    value: '24h',
    get label() {
      return t('share.duration.24h');
    },
  },
  {
    value: '7d',
    get label() {
      return t('share.duration.7d');
    },
  },
  {
    value: '30d',
    get label() {
      return t('share.duration.30d');
    },
  },
];

export const LABEL_MAX = 80;

/** Make a link for the profile being viewed. The URL is only ever returned here. */
export function createShareLink(duration: ShareLinkDuration, label: string): Promise<{ url: string; link: ShareLink }> {
  const trimmed = label.trim();
  return apiRequest(SHARE_LINKS_PATH, { method: 'POST', body: { duration, ...(trimmed ? { label: trimmed } : {}) } });
}

/** Stop the link working at once. */
export function revokeShareLink(id: string): Promise<{ link: ShareLink }> {
  return apiRequest(`${SHARE_LINKS_PATH}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export const STATUS_LABEL: Readonly<Record<ShareLinkStatus, string>> = {
  get active() {
    return t('share.status.active');
  },
  get expired() {
    return t('share.status.expired');
  },
  get revoked() {
    return t('share.status.revoked');
  },
};
