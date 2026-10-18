import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { ApiError, getAccessToken, recoverFromUnauthorized } from './api';
import { API_BASE_URL } from './config';
import { PatientDocument } from './types';

/**
 * Patient documents are fetched with the Bearer header into the app's cache and
 * handed to the OS share/open sheet. The URL is never given to a browser (it
 * wouldn't send the token). Files are PHI: the folder is emptied before every
 * download and on sign-out.
 */
function cacheDir(): Directory {
  return new Directory(Paths.cache, 'patient-documents');
}

export function clearDocumentCache(): void {
  try {
    const dir = cacheDir();
    if (dir.exists) dir.delete();
  } catch {
    // Best effort.
  }
}

const MIME: Record<string, { mimeType?: string; UTI?: string }> = {
  pdf: { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' },
  image: { mimeType: 'image/*', UTI: 'public.image' },
};

function safeFileName(doc: PatientDocument): string {
  const base = (doc.filename || doc.title || 'document').replace(/[^\w.\- ]+/g, '_').slice(0, 80);
  const withExt = /\.[a-z0-9]{2,5}$/i.test(base) ? base : doc.documentType === 'pdf' ? `${base}.pdf` : base;
  return `${doc._id}-${withExt}`;
}

function statusOf(error: unknown): number | null {
  const match = /\b(401|403|404|410|429|5\d\d)\b/.exec(error instanceof Error ? error.message : String(error));
  return match ? Number(match[1]) : null;
}

async function download(url: string, target: File, token: string): Promise<File> {
  return File.downloadFileAsync(url, target, {
    headers: { Authorization: `Bearer ${token}` },
    idempotent: true,
  });
}

export async function openDocument(doc: PatientDocument): Promise<void> {
  clearDocumentCache();
  const dir = cacheDir();
  dir.create({ intermediates: true, idempotent: true });
  const target = new File(dir, safeFileName(doc));
  const url = `${API_BASE_URL}/api/patients/me/documents/${encodeURIComponent(doc._id)}?download=true`;

  let token = await getAccessToken();
  let file: File;
  try {
    file = await download(url, target, token);
  } catch (error) {
    const status = statusOf(error);
    if (status === 401) {
      token = await recoverFromUnauthorized(token);
      try {
        file = await download(url, target, token);
      } catch (retryError) {
        throw toApiError(retryError);
      }
    } else {
      throw toApiError(error);
    }
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new ApiError("Opening files isn't supported on this device.", 0);
  }
  const type = MIME[doc.documentType ?? ''] ?? {};
  await Sharing.shareAsync(file.uri, { ...type, dialogTitle: doc.title });
}

function toApiError(error: unknown): ApiError {
  const status = statusOf(error);
  if (status === 404) return new ApiError('This document is no longer available.', 404);
  if (status === 401) return new ApiError('Your session has expired. Please sign in again.', 401);
  if (status === 429) return new ApiError('Too many requests. Please wait a moment and try again.', 429);
  return new ApiError("Couldn't download the document. Check your connection and try again.", status ?? 0);
}
