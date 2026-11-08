import { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { Appointment } from './types';
import { formatDate, formatTime } from './format';
import { t as translate } from './i18n';

/** Video visits. The server sends a join link only while the call can be joined. */

export const isVideoVisit = (a: Pick<Appointment, 'modality'>) => a.modality === 'teleconsult';

/**
 * Open the video call. Jitsi opens in its app when installed, otherwise in the browser,
 * where it asks for camera and microphone access.
 */
export async function openVideoCall(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(translate('appointments.call.failedTitle'), translate('appointments.call.failedBody'));
  }
}

/**
 * The video call's join link while it can be joined, else null. Re-renders when `closesAt`
 * passes so a Join button disappears without a refresh. `cached`: the appointment is a saved
 * offline copy (or not yet confirmed by the server), whose link may already be dead.
 */
export function useJoinUrl(a: Pick<Appointment, 'teleconsult'> | null | undefined, cached = false): string | null {
  const tc = a?.teleconsult;
  const closesAt = tc?.closesAt ? new Date(tc.closesAt).getTime() : NaN;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!isFinite(closesAt)) return;
    const wait = closesAt - Date.now();
    if (wait <= 0 || wait > 24 * 60 * 60 * 1000) return;
    const timer = setTimeout(() => setTick((n) => n + 1), wait + 500);
    return () => clearTimeout(timer);
  }, [closesAt]);
  if (cached || !tc?.joinable || !tc.joinUrl) return null;
  if (isFinite(closesAt) && closesAt <= Date.now()) return null;
  return tc.joinUrl;
}

/** "Opens Tue, Oct 20 at 9:45 AM" while the call isn't open yet; null otherwise. */
export function opensLabel(a: Appointment, now = Date.now()): string | null {
  const t = a.teleconsult;
  if (!t || t.joinable || !t.opensAt) return null;
  const opens = new Date(t.opensAt);
  if (isNaN(opens.getTime()) || opens.getTime() <= now) return null;
  return translate('appointments.call.opens', {
    date: formatDate(opens, { weekday: 'short', month: 'short', day: 'numeric' }),
    time: formatTime(opens),
  });
}
