import { Badge } from './ui';
import { humanize } from '@/lib/format';

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
  if (!status) return null;
  const tone = DANGER.has(status) ? 'danger' : WARNING.has(status) ? 'warning' : PRIMARY.has(status) ? 'primary' : 'neutral';
  return <Badge label={humanize(status)} tone={tone} />;
}
