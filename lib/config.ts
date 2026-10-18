import Constants from 'expo-constants';

/**
 * Backend base URL (the apex domain, never a clinic subdomain). Set
 * EXPO_PUBLIC_API_URL in .env (or eas.json per build profile); app.json's
 * extra.apiUrl is the fallback, then localhost for the dev-server case.
 */
const configuredUrl = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  'http://localhost:3000'
).replace(/\/+$/, '');

/**
 * Release builds must talk to the real backend over HTTPS. Fail loudly at
 * startup instead of silently shipping an app pointed at a dev machine.
 */
function assertReleaseUrl(url: string): void {
  if (__DEV__) return;
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    // Unparseable: falls through to the checks below on the raw string.
  }
  const insecure = !/^https:\/\//i.test(url);
  const local =
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /localhost|REPLACE_ME/i.test(url);
  if (insecure || local) {
    throw new Error(
      `[config] Release build has an invalid API URL "${url}". ` +
        'Set EXPO_PUBLIC_API_URL to the production https:// origin (see eas.json build profiles).'
    );
  }
}

assertReleaseUrl(configuredUrl);

export const API_BASE_URL: string = configuredUrl;
