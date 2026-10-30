import * as WebBrowser from 'expo-web-browser';
import { apiRequest } from './api';
import { deferLock } from './appLock';
import { colors } from './theme';

/** Why a bill can't be paid in the app (server: lib/payments/pay-link.ts). */
export type PayOnlineCode = 'REFUNDED' | 'NOTHING_OWED' | 'UNSUPPORTED_CURRENCY' | 'NO_PAYMENT_OPTION' | 'BELOW_MINIMUM';

/** GET /api/patients/me/invoices/[id]/pay-link: whether the app can offer to pay this invoice. */
export interface PayOnlineOffer {
  offered: boolean;
  code: PayOnlineCode | null;
  amount: number;
  /** Smallest online (GCash, Maya, card) charge, in pesos. */
  minimum: number;
  /** 'online' = a gateway checkout; 'manual' = QR / bank transfer the clinic confirms. */
  methods: Array<'online' | 'manual'>;
  /** The patient sent an "I've paid" reference the clinic hasn't confirmed yet. */
  pendingClaim: boolean;
  /** An online checkout started in the last couple of hours (ISO); its payment may still be on its way. */
  recentCheckoutAt: string | null;
}

export const payLinkPath = (invoiceId: string) => `/api/patients/me/invoices/${encodeURIComponent(invoiceId)}/pay-link`;

/**
 * Get a fresh pay-page link for the invoice and open it in an in-app browser. Resolves when the
 * browser closes on iOS, and right after it opens on Android ('opened'), so callers also watch
 * for the app coming back to the foreground.
 */
export async function openInvoicePayPage(invoiceId: string): Promise<WebBrowser.WebBrowserResult> {
  const { url } = await apiRequest<{ url: string; amount: number; expiresAt: string }>(payLinkPath(invoiceId), { method: 'POST' });
  // Paying can take a while (e-wallet app, OTP); coming back shouldn't ask to unlock.
  deferLock();
  return WebBrowser.openBrowserAsync(url, {
    controlsColor: colors.primary,
    toolbarColor: colors.surface,
    dismissButtonStyle: 'done',
    enableBarCollapsing: true,
  });
}
