import Constants from 'expo-constants';

/**
 * Backend base URL (the apex domain, never a clinic subdomain). Set
 * EXPO_PUBLIC_API_URL in .env (or eas.json per environment); app.json's
 * extra.apiUrl is the fallback, then localhost for the dev-server case.
 */
export const API_BASE_URL: string = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ||
  'http://localhost:3000'
).replace(/\/+$/, '');
