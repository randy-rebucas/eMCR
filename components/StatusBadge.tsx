import { Badge } from './ui';
import { humanize } from '@/lib/format';
import { MessageKey, useT } from '@/lib/i18n';
import { catalogs } from '@/lib/i18n/registry';

const DANGER = new Set(['cancelled', 'no-show', 'unpaid', 'abnormal', 'critical', 'discontinued', 'closed']);
const WARNING = new Set(['pending', 'partial', 'in-progress', 'ordered', 'open', 'inactive', 'rescheduled']);
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

/** Status pill with a tone derived from the status string. */
export function StatusBadge({ status }: { status: string | null | undefined }) {
  const t = useT();
  if (!status) return null;
  const tone = DANGER.has(status) ? 'danger' : WARNING.has(status) ? 'warning' : PRIMARY.has(status) ? 'primary' : 'neutral';
  // Known statuses are translated; anything new from the server is shown as the server's word.
  const key = `status.${status}`;
  const label = key in catalogs.common.en ? t(`common.${key}` as MessageKey & `common.status.${string}`) : humanize(status);
  return <Badge label={label} tone={tone} />;
}
