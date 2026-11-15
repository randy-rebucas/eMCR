import * as SplashScreen from 'expo-splash-screen';

/**
 * Keeps the native splash up until the first real screen can show, so launch goes splash → screen
 * instead of splash → blank → spinner. Two things must be true: the root is ready (language and
 * App Lock setting read) and the launch routing has picked a screen (the route left "/").
 */

// At import (app/_layout.tsx imports this first), before the splash could auto-hide.
SplashScreen.preventAutoHideAsync().catch(() => {});

/** Never keep the splash longer than this, whatever is still loading (a slow network on launch). */
const SAFETY_TIMEOUT_MS = 8000;

let rootReady = false;
let routeReady = false;
let hidden = false;
const waiters: (() => void)[] = [];

const safety = setTimeout(hideLaunchSplash, SAFETY_TIMEOUT_MS);

/** Hide the splash now (also the error fallback, which must never sit behind it). */
export function hideLaunchSplash(): void {
  if (hidden) return;
  hidden = true;
  clearTimeout(safety);
  // One frame later, so the screen that was just committed has been drawn under it.
  requestAnimationFrame(() => {
    try {
      SplashScreen.hide();
    } catch {
      // Already hidden (e.g. after a fast refresh): nothing to do.
    }
    waiters.splice(0).forEach((resolve) => resolve());
  });
}

export function markLaunchRootReady(): void {
  rootReady = true;
  if (routeReady) hideLaunchSplash();
}

export function markLaunchRouteReady(): void {
  routeReady = true;
  if (rootReady) hideLaunchSplash();
}

/** Resolves once the splash is gone, for prompts that shouldn't appear behind it. */
export function whenLaunchSplashHidden(): Promise<void> {
  if (hidden) return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  return new Promise((resolve) => waiters.push(resolve));
}
