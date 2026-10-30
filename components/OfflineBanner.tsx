import { formatDate, formatTime } from '@/lib/format';
import { useT } from '@/lib/i18n';
import { Banner } from './ui';

/** "Oct 30, 9:41 AM" for when a saved copy was made. */
export function savedAtLabel(updatedAt: number): string {
  return `${formatDate(updatedAt, { month: 'short', day: 'numeric' })}, ${formatTime(updatedAt)}`;
}

/**
 * Shown above records that come from the device's saved copy because the server couldn't be
 * reached. Pass the hook's `offline` and `updatedAt`; renders nothing when online.
 */
export function OfflineBanner({
  offline,
  updatedAt,
  subject,
}: {
  offline: boolean;
  updatedAt: number | null;
  /**
   * What is on screen, translated, e.g. t('queue.offlineSubject') → "your last queue position" /
   * "huling puwesto mo sa pila" (Filipino without a leading "ang"). Default: "your records".
   */
  subject?: string;
}) {
  const t = useT();
  if (!offline) return null;
  const what = subject ?? t('common.offline.yourRecords');
  const message = updatedAt
    ? t('common.offline.bannerWhen', { subject: what, when: savedAtLabel(updatedAt) })
    : t('common.offline.banner', { subject: what });
  return <Banner tone="warning" message={message} />;
}
