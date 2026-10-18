import type { IconName } from '@/components/ui';
import { Invoice } from './types';

export interface InvoiceLook {
  icon: IconName;
  label: string;
  bg: string;
  fg: string;
}

/** Icon + label from the first line item's category (or description as a fallback). */
export function invoiceLook(invoice: Invoice): InvoiceLook {
  const first = invoice.items?.[0];
  const hint = `${first?.category ?? ''} ${first?.description ?? ''}`.toLowerCase();
  if (/lab|cbc|blood|urin|test/.test(hint)) return { icon: 'flask-outline', label: 'Laboratory', bg: '#FDE8E8', fg: '#B3261E' };
  if (/x-?ray|imaging|ultra|radio|ct|mri/.test(hint)) return { icon: 'scan-outline', label: 'Imaging', bg: '#EEEAFB', fg: '#5B47B0' };
  if (/med|drug|pharm|rx/.test(hint)) return { icon: 'medical-outline', label: 'Medicines', bg: '#E3F5EC', fg: '#1F7A4A' };
  if (/procedure|surg/.test(hint)) return { icon: 'bandage-outline', label: 'Procedure', bg: '#FDF1DC', fg: '#A15C00' };
  if (/consult|check|visit|follow/.test(hint)) return { icon: 'calendar-outline', label: 'Consultation', bg: '#E6EEFB', fg: '#2F5FB3' };
  return { icon: 'receipt-outline', label: 'Clinic Services', bg: '#E3F6F5', fg: '#0A7F7E' };
}

export function amountPaid(invoice: Invoice): number {
  return (invoice.payments ?? []).reduce((sum, p) => sum + (p.amount || 0), 0);
}

/** Same rule as the server's outstanding-balance summary: total minus recorded payments. */
export function balanceOf(invoice: Invoice): number {
  if (invoice.status === 'paid' || invoice.status === 'refunded') return 0;
  return Math.max(0, (invoice.total ?? 0) - amountPaid(invoice));
}

export function lastPaymentDate(invoice: Invoice): string | null {
  const dates = (invoice.payments ?? []).map((p) => p.date).filter(Boolean);
  if (!dates.length) return null;
  return dates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

/** "Complete blood count, Urinalysis +1" */
export function itemsSummary(invoice: Invoice): string | null {
  const names = (invoice.items ?? []).map((i) => i.description || i.code).filter(Boolean) as string[];
  if (!names.length) return null;
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
}
