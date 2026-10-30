/**
 * English + Filipino for the app.
 *
 * In components:   const t = useT();  <Text>{t('common.tryAgain')}</Text>
 * Outside React:   import { t } from '@/lib/i18n';  Alert.alert(t('more.signOut.title'))
 * Params / plurals: t('more.unread', { count: 3 }), t('auth.otp.sentTo', { phone })
 *
 * `useT()` re-renders its component when the language changes. Plain `t()` reads the current
 * language at call time, so call it while rendering or handling an event, never at module load
 * (a module-level constant would stay in the language the app started in).
 *
 * Server-supplied text (API error messages, push notifications written on the server) is shown as
 * the server sends it; only text written in the app is translated.
 */
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { getLocales } from 'expo-localization';
import { getLanguagePreference, setLanguagePreference as storeLanguagePreference } from '../storage';
import { checkCatalogs, lookup, MessageKey, TParams } from './registry';
import type { ParamValue } from './types';

export type { MessageKey, PlainKey } from './registry';
export { defineStrings } from './types';

export type Language = 'en' | 'fil';
/** What the patient picked: a language, or 'system' to follow the phone. */
export type LanguagePreference = Language | 'system';

export const LANGUAGE_PREFERENCES: readonly LanguagePreference[] = ['system', 'en', 'fil'];

/** The phone's language, mapped to one the app has: Tagalog/Filipino → Filipino, anything else → English. */
export function systemLanguage(): Language {
  try {
    const code = getLocales()[0]?.languageCode?.toLowerCase();
    return code === 'fil' || code === 'tl' ? 'fil' : 'en';
  } catch {
    return 'en';
  }
}

let preference: LanguagePreference = 'system';
let language: Language = systemLanguage();
const listeners = new Set<() => void>();

function apply(next: Language) {
  if (next === language) return;
  language = next;
  listeners.forEach((l) => l());
}

let initPromise: Promise<void> | null = null;

/**
 * Load the saved choice. The root layout waits for this before rendering, so a patient who picked
 * Filipino never sees an English flash. Safe to call more than once.
 */
export function initI18n(): Promise<void> {
  if (!initPromise) {
    if (__DEV__) checkCatalogs();
    // A patient can change the phone's language while the app is in the background.
    AppState.addEventListener('change', (state) => {
      if (state === 'active' && preference === 'system') apply(systemLanguage());
    });
    initPromise = getLanguagePreference()
      .then((saved) => {
        preference = saved === 'en' || saved === 'fil' ? saved : 'system';
        apply(preference === 'system' ? systemLanguage() : preference);
      })
      .catch(() => {});
  }
  return initPromise;
}

/** The language text is shown in right now. */
export function getLanguage(): Language {
  return language;
}

export function getLanguagePreferenceSync(): LanguagePreference {
  return preference;
}

/** Switch language; every component using `useT()` / `useLanguage()` re-renders. */
export async function setLanguagePreference(next: LanguagePreference): Promise<void> {
  preference = next;
  apply(next === 'system' ? systemLanguage() : next);
  listeners.forEach((l) => l());
  await storeLanguagePreference(next === 'system' ? null : next).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function interpolate(text: string, params: Record<string, ParamValue> | undefined): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] !== undefined && params[name] !== null ? String(params[name]) : match
  );
}

function translate(lang: Language, key: string, params?: Record<string, ParamValue>): string {
  const message = lookup(lang, key);
  if (message === undefined) {
    if (__DEV__) console.warn(`[i18n] Missing string: ${key}`);
    return key;
  }
  const text = typeof message === 'string' ? message : params?.count === 1 ? message.one : message.other;
  return interpolate(text, params);
}

export type TFunction = <K extends MessageKey>(key: K, ...params: TParams<K>) => string;

function makeT(lang: Language | null): TFunction {
  return ((key: string, params?: Record<string, ParamValue>) => translate(lang ?? language, key, params)) as TFunction;
}

/** Translate in the current language. Works anywhere: lib modules, Alert text, local notifications. */
export const t: TFunction = makeT(null);

const boundT: Record<Language, TFunction> = { en: makeT('en'), fil: makeT('fil') };

/** `t` for components: re-renders the component when the language changes. Stable per language. */
export function useT(): TFunction {
  const lang = useSyncExternalStore(subscribe, getLanguage, getLanguage);
  return boundT[lang];
}

/** The current language and the patient's choice, for the language picker. */
export function useLanguage(): {
  language: Language;
  preference: LanguagePreference;
  setPreference: (next: LanguagePreference) => Promise<void>;
} {
  const lang = useSyncExternalStore(subscribe, getLanguage, getLanguage);
  const pref = useSyncExternalStore(subscribe, getLanguagePreferenceSync, getLanguagePreferenceSync);
  return { language: lang, preference: pref, setPreference: setLanguagePreference };
}

/**
 * Whose records, for "{whose} records": English "Maria's" / "James'", Filipino "ni Maria"
 * (so the Filipino string puts it after the noun: "records {whose}").
 */
export function possessiveName(name: string): string {
  if (language === 'fil') return `ni ${name}`;
  return name.endsWith('s') ? `${name}'` : `${name}'s`;
}

/** Name of a language choice, in the current language ("Same as phone" / "Filipino" / …). */
export function languageChoiceLabel(choice: LanguagePreference): string {
  if (choice === 'system') return t('common.language.system');
  return choice === 'fil' ? t('common.language.fil') : t('common.language.en');
}
