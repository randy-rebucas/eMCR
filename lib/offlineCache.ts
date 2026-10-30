import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';

/**
 * Encrypted offline copies of GET responses, so patients can read their last-loaded records
 * when the network is down. Records are PHI:
 *
 * - each entry is sealed with XChaCha20-Poly1305 (authenticated) under a random 256-bit key
 *   kept only in SecureStore (this device only, never in backups)
 * - the cache key (request path + active family profile) is the cipher's associated data, so a
 *   file can only ever decrypt as the entry it was written for; file names are a keyed hash
 *   of it, so the folder doesn't reveal which records are cached
 * - entries expire after `MAX_AGE_MS`; the folder is capped at `MAX_TOTAL_BYTES`
 * - `clearOfflineCache` (every sign-out path, via `clearSession`) deletes the files and the key
 *
 * File layout: [1 byte format version][24-byte nonce][ciphertext + 16-byte Poly1305 tag].
 * Plaintext: UTF-8 JSON `{ "savedAt": <epoch ms>, "data": <response> }`.
 */

export const FORMAT_VERSION = 1;
export const NONCE_BYTES = 24;
export const KEY_BYTES = 32;
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
export const MAX_ENTRY_BYTES = 1024 * 1024;

const KEY_STORE_NAME = 'offline_cache_key';
const DIR_NAME = 'offline-records';
const FILE_EXT = '.bin';

export interface CachedEntry<T> {
  data: T;
  /** When the copy was saved (epoch ms). */
  savedAt: number;
}

// ── Pure helpers (no I/O) ────────────────────────────────────────────────────

/** One entry per request path per person: `self` is the signed-in person, else the family member's id. */
export function offlineCacheKey(path: string, profileId: string | null, variant?: string): string {
  return `${variant ? `${variant}:` : ''}${profileId ?? 'self'}|${path}`;
}

/** UTF-8 encode without relying on TextEncoder. */
export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd; // lone surrogate
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
  }
  return Uint8Array.from(out);
}

/** UTF-8 decode (input is our own authenticated output, so only well-formed input is expected). */
export function utf8Decode(bytes: Uint8Array): string {
  let out = '';
  const chunk: number[] = [];
  const flush = () => {
    out += String.fromCharCode(...chunk);
    chunk.length = 0;
  };
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let code: number;
    if (b < 0x80) {
      code = b;
      i += 1;
    } else if (b >= 0xf0) {
      code = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      i += 4;
    } else if (b >= 0xe0) {
      code = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      i += 3;
    } else {
      code = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      i += 2;
    }
    if (code >= 0x10000) {
      code -= 0x10000;
      chunk.push(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      chunk.push(code);
    }
    if (chunk.length >= 4096) flush();
  }
  flush();
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return hex;
}

export function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Encrypt one entry. `nonce` must be 24 fresh random bytes. */
export function sealEntry<T>(key: Uint8Array, nonce: Uint8Array, cacheKey: string, entry: CachedEntry<T>): Uint8Array {
  const plaintext = utf8Encode(JSON.stringify(entry));
  const ciphertext = xchacha20poly1305(key, nonce, utf8Encode(cacheKey)).encrypt(plaintext);
  const out = new Uint8Array(1 + NONCE_BYTES + ciphertext.length);
  out[0] = FORMAT_VERSION;
  out.set(nonce, 1);
  out.set(ciphertext, 1 + NONCE_BYTES);
  return out;
}

/** Decrypt one entry; null when the format, key, cache key or contents don't check out. */
export function openEntry<T>(key: Uint8Array, cacheKey: string, sealed: Uint8Array): CachedEntry<T> | null {
  if (sealed.length < 1 + NONCE_BYTES + 16 || sealed[0] !== FORMAT_VERSION) return null;
  try {
    const nonce = sealed.subarray(1, 1 + NONCE_BYTES);
    const plaintext = xchacha20poly1305(key, nonce, utf8Encode(cacheKey)).decrypt(sealed.subarray(1 + NONCE_BYTES));
    const parsed = JSON.parse(utf8Decode(plaintext)) as Partial<CachedEntry<T>> | null;
    if (!parsed || typeof parsed.savedAt !== 'number' || !('data' in parsed)) return null;
    return { data: parsed.data as T, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}

export function isExpired(savedAt: number, now: number, maxAgeMs = MAX_AGE_MS): boolean {
  // A clock that jumped backwards makes "future" entries; treat them as expired too.
  return now - savedAt > maxAgeMs || savedAt - now > 60_000;
}

export interface FileStat {
  name: string;
  size: number;
  /** Epoch ms. */
  modifiedAt: number;
}

/** Which files to delete: everything too old, then the oldest until the total fits. */
export function selectEvictions(
  files: FileStat[],
  now: number,
  limits: { maxBytes?: number; maxAgeMs?: number } = {}
): string[] {
  const { maxBytes = MAX_TOTAL_BYTES, maxAgeMs = MAX_AGE_MS } = limits;
  const evict: string[] = [];
  const kept: FileStat[] = [];
  for (const f of files) {
    if (isExpired(f.modifiedAt, now, maxAgeMs)) evict.push(f.name);
    else kept.push(f);
  }
  kept.sort((a, b) => a.modifiedAt - b.modifiedAt);
  let total = kept.reduce((sum, f) => sum + f.size, 0);
  for (const f of kept) {
    if (total <= maxBytes) break;
    evict.push(f.name);
    total -= f.size;
  }
  return evict;
}

/** Errors that mean the copy must not be shown (signed out, no access, record gone). */
export function shouldDropCacheOnStatus(status: number | undefined): boolean {
  return status === 401 || status === 402 || status === 403 || status === 404 || status === 410;
}

// ── Storage ──────────────────────────────────────────────────────────────────

const KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/**
 * Bumped by every clear. Writes capture it before their request and are dropped when it changed,
 * so a response that lands after sign-out is never written back.
 */
let epoch = 0;
let keyPromise: Promise<Uint8Array> | null = null;
let pruned = false;

export function offlineCacheEpoch(): number {
  return epoch;
}

function cacheDir(): Directory {
  return new Directory(Paths.cache, DIR_NAME);
}

async function loadKey(create: boolean): Promise<Uint8Array | null> {
  const startEpoch = epoch;
  const stored = await SecureStore.getItemAsync(KEY_STORE_NAME, KEY_OPTIONS);
  const existing = stored ? hexToBytes(stored) : null;
  if (existing && existing.length === KEY_BYTES) return existing;
  if (!create) return null;
  // No key (first use, or wiped): any files left belong to a lost key and are unreadable.
  removeDir();
  const key = Crypto.getRandomBytes(KEY_BYTES);
  await SecureStore.setItemAsync(KEY_STORE_NAME, bytesToHex(key), KEY_OPTIONS);
  if (startEpoch !== epoch) {
    // Signed out while the key was being made: don't leave it behind.
    await SecureStore.deleteItemAsync(KEY_STORE_NAME, KEY_OPTIONS).catch(() => {});
    throw new Error('offline cache cleared');
  }
  return key;
}

async function getKey(): Promise<Uint8Array> {
  if (!keyPromise) {
    const p = loadKey(true).then((k) => k as Uint8Array);
    keyPromise = p;
    p.catch(() => {
      if (keyPromise === p) keyPromise = null;
    });
  }
  return keyPromise;
}

async function fileFor(key: Uint8Array, cacheKey: string): Promise<File> {
  // Keyed hash: the name reveals nothing about the path or the person.
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${bytesToHex(key)}:${cacheKey}`
  );
  return new File(cacheDir(), `${digest}${FILE_EXT}`);
}

function removeDir(): void {
  try {
    const dir = cacheDir();
    if (dir.exists) dir.delete();
  } catch {
    // Best effort.
  }
}

/** The saved copy for this cache key, or null (none, expired, unreadable). Never throws. */
export async function readOffline<T>(cacheKey: string): Promise<CachedEntry<T> | null> {
  try {
    const startEpoch = epoch;
    // Reading never creates a key: no key means nothing was cached.
    const key = keyPromise ? await keyPromise : await loadKey(false);
    if (!key || startEpoch !== epoch) return null;
    const file = await fileFor(key, cacheKey);
    if (!file.exists) return null;
    const entry = openEntry<T>(key, cacheKey, await file.bytes());
    if (startEpoch !== epoch) return null;
    if (!entry || isExpired(entry.savedAt, Date.now())) {
      file.delete();
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

/**
 * Save a GET response. Pass the `offlineCacheEpoch()` read before the request started: if the
 * cache was cleared since (sign-out), nothing is written. Never throws.
 */
export async function writeOffline<T>(cacheKey: string, data: T, ifEpoch: number): Promise<void> {
  try {
    if (ifEpoch !== epoch) return;
    const key = await getKey();
    const sealed = sealEntry(key, Crypto.getRandomBytes(NONCE_BYTES), cacheKey, { data, savedAt: Date.now() });
    const file = await fileFor(key, cacheKey);
    if (ifEpoch !== epoch) return;
    if (sealed.length > MAX_ENTRY_BYTES) {
      if (file.exists) file.delete();
      return;
    }
    cacheDir().create({ intermediates: true, idempotent: true });
    file.write(sealed);
    if (!pruned) {
      pruned = true;
      pruneOffline();
    } else if (Math.random() < 0.1) {
      pruneOffline();
    }
  } catch {
    // Best effort: the screen already has its data.
  }
}

/** Forget one entry (e.g. the server said the record is gone or no longer ours). Never throws. */
export async function removeOffline(cacheKey: string): Promise<void> {
  try {
    const key = keyPromise ? await keyPromise : await loadKey(false);
    if (!key) return;
    const file = await fileFor(key, cacheKey);
    if (file.exists) file.delete();
  } catch {
    // Best effort.
  }
}

/** Apply the age and size caps. Never throws. */
export function pruneOffline(now = Date.now()): void {
  try {
    const dir = cacheDir();
    if (!dir.exists) return;
    const files = dir.list().filter((f): f is File => f instanceof File);
    const stats: FileStat[] = files.map((f) => ({
      name: f.name,
      size: f.size ?? 0,
      modifiedAt: f.lastModified ?? 0,
    }));
    const evict = new Set(selectEvictions(stats, now));
    for (const f of files) if (evict.has(f.name)) f.delete();
  } catch {
    // Best effort.
  }
}

/** Delete every cached record and the key. Called on every sign-out path. Never throws. */
export async function clearOfflineCache(): Promise<void> {
  epoch++;
  keyPromise = null;
  pruned = false;
  removeDir();
  await SecureStore.deleteItemAsync(KEY_STORE_NAME, KEY_OPTIONS).catch(() => {});
}
