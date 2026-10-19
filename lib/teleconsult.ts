import { Alert, Linking } from 'react-native';
import { Appointment } from './types';
import { formatDate } from './format';

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
    Alert.alert("Couldn't open the call", 'Check that a web browser is installed, then try again.');
  }
}

/** "Opens Tue, Oct 20 at 9:45 AM" while the call isn't open yet; null otherwise. */
export function opensLabel(a: Appointment, now = Date.now()): string | null {
  const t = a.teleconsult;
  if (!t || t.joinable || !t.opensAt) return null;
  const opens = new Date(t.opensAt);
  if (isNaN(opens.getTime()) || opens.getTime() <= now) return null;
  const time = opens.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `The call opens ${formatDate(opens, { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}`;
}
