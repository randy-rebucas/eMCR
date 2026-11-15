import { Badge } from './ui';
import { humanize } from '@/lib/format';
import { MessageKey, TFunction, useT } from '@/lib/i18n';
import { catalogs } from '@/lib/i18n/registry';

const DANGER = new Set(['cancelled', 'no-show', 'unpaid', 'abnormal', 'critical', 'discontinued', 'closed']);
const WARNING = new Set(['pending', 'partial', 'in-progress', 'away', 'ordered', 'open', 'inactive', 'rescheduled']);
const PRIMARY = new Set([
  'confirmed',
  'scheduled',
  'completed',
  'paid',
  'active',
  'reviewed',
  'available',
  'resolved',
  'dispensed',
  'waiting',
]);

/** A status as words: known statuses are translated; anything new is shown as the server's word. */
export function statusLabel(t: TFunction, status: string): string {
  const key = `status.${status}`;
  return key in catalogs.common.en ? t(`common.${key}` as MessageKey & `common.status.${string}`) : humanize(status);
}

/** Status pill with a tone derived from the status string. */
export function StatusBadge({ status }: { status: string | null | undefined }) {
  const t = useT();
  if (!status) return null;
  const tone = DANGER.has(status) ? 'danger' : WARNING.has(status) ? 'warning' : PRIMARY.has(status) ? 'primary' : 'neutral';
  return <Badge label={statusLabel(t, status)} tone={tone} />;
}
