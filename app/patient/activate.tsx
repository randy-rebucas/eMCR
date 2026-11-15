import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError, errorMessage } from '@/lib/api';
import { emitRefresh } from '@/lib/events';
import { EMCR_ENDPOINTS, formatVoucherCode, normalizeVoucherCode, redeemActivationCode, VOUCHER_LENGTH, voucherCodeFromQr } from '@/lib/emcr';
import { formatDate } from '@/lib/format';
import { useApiData } from '@/lib/useApiData';
import { EmcrAccount, EmcrActivation } from '@/lib/types';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, useBottomPadding } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import { IconField } from '@/components/auth';
import { QrScanner } from '@/components/QrScanner';
import { useT } from '@/lib/i18n';

/** A code buys a year: the meter is measured against that. */
const TERM_DAYS = 365;
/** Inside this many days the hero turns amber and says it ends soon. */
const SOON_DAYS = 30;

const longDate = (iso: string) => formatDate(iso, { month: 'long', day: 'numeric', year: 'numeric' });

/**
 * "Enter your activation code": redeem the code printed on an eMCR voucher from a clinic.
 * Opened from Home, More, a renewal push, or any call the server refused with 402.
 * Never shows prices: vouchers are handled at the clinic counter.
 */
export default function ActivateScreen() {
  const bottomPad = useBottomPadding();
  const t = useT();
  const account = useApiData<EmcrAccount>(EMCR_ENDPOINTS.account, { refreshOn: ['activation'], offline: true });
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ activation: EmcrActivation; soldBy: string | null } | null>(null);
  const inFlight = useRef(false);

  const complete = normalizeVoucherCode(code).length === VOUCHER_LENGTH;

  async function redeem(value = code) {
    if (inFlight.current) return;
    if (normalizeVoucherCode(value).length !== VOUCHER_LENGTH) {
      setError(t('activate.enterFullCode'));
      return;
    }
    inFlight.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const result = await redeemActivationCode(value);
      setSuccess({ activation: result.activation, soldBy: result.soldBy ?? null });
      account.setData((prev) => (prev ? { ...prev, activation: result.activation } : prev));
      emitRefresh('activation');
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'NETWORK'
          ? t('common.network')
          : errorMessage(err, t('activate.failed'))
      );
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  function handleScanned(data: string) {
    setScanning(false);
    const scanned = voucherCodeFromQr(data);
    if (!scanned) {
      setError(t('activate.notVoucher'));
      return;
    }
    const formatted = formatVoucherCode(scanned);
    setCode(formatted);
    redeem(formatted);
  }

  function close() {
    if (router.canGoBack()) router.back();
    else router.replace('/patient/home');
  }

  const activation = success?.activation ?? account.data?.activation ?? null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <SafeAreaView edges={['top']}>
        <AppHeader back />
        <Text style={styles.title} accessibilityRole="header">
          {t('activate.title')}
        </Text>
        <Text style={styles.subtitle}>{t('activate.subtitle')}</Text>
      </SafeAreaView>

      {activation ? (
        <StatusHero activation={activation} justActivated={!!success} />
      ) : account.loading ? (
        <View style={[styles.hero, styles.heroLoading]}>
          <ActivityIndicator color={colors.primaryText} />
        </View>
      ) : account.error ? (
        <View style={styles.statusError}>
          <Text style={styles.statusErrorText}>{account.error}</Text>
          <TouchableOpacity onPress={account.refresh} style={styles.retry} accessibilityRole="button">
            <Text style={styles.retryText}>{t('common.tryAgain')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {success ? (
        <View style={styles.card} accessibilityLiveRegion="polite">
          <View style={styles.successHead}>
            <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            <Text style={styles.successTitle} accessibilityRole="header">
              {t('activate.successTitle')}
            </Text>
          </View>
          <Text style={styles.body}>
            {success.activation.expiresAt
              ? t('activate.activeUntil', { date: longDate(success.activation.expiresAt) })
              : t('activate.accepted')}
          </Text>
          {success.soldBy ? <Text style={styles.meta}>{t('activate.voucherFrom', { seller: success.soldBy })}</Text> : null}
          <Button title={t('common.done')} onPress={close} />
        </View>
      ) : (
        <>
          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('activate.enterCode')}
          </Text>
          <View style={styles.card}>
            <IconField
              icon="key-outline"
              // Read out as "Activation code", not "X X X X"; the X's are only the placeholder.
              label={t('activate.codeA11y')}
              placeholder="XXXX-XXXX-XXXX"
              value={code}
              onChangeText={(text) => {
                setCode(formatVoucherCode(text));
                if (error) setError(null);
              }}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              spellCheck={false}
              maxLength={VOUCHER_LENGTH + 2}
              returnKeyType="done"
              onSubmitEditing={() => redeem()}
              error={!!error}
            />
            {/* Next to the button that failed, not at the top of the screen. */}
            {error ? <Banner message={error} /> : null}
            <Button title={t('activate.activate')} onPress={() => redeem()} loading={submitting} disabled={!complete} />
            <Button
              title={t('activate.scanQr')}
              icon="qr-code-outline"
              variant="secondary"
              onPress={() => {
                setError(null);
                setScanning(true);
              }}
              disabled={submitting}
            />
          </View>

          <Text style={styles.sectionTitle} accessibilityRole="header">
            {t('activate.howTitle')}
          </Text>
          <View style={[styles.card, styles.ruled]}>
            <HowRow icon="storefront-outline" text={t('activate.howGet')} />
            <HowRow icon="calendar-outline" text={t('activate.yearNote')} />
            <HowRow icon="people-outline" text={t('activate.howFamily')} last />
          </View>
        </>
      )}

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <QrScanner
          onScanned={handleScanned}
          onCancel={() => setScanning(false)}
          prompt={t('activate.scanPrompt')}
          purpose={t('activate.scanPurpose')}
        />
      </Modal>
    </ScrollView>
  );
}

/**
 * Whether eMCR works now, and for how long: solid navy, a meter of the year's days left (amber in
 * the last month, so a renewal isn't a surprise).
 */
function StatusHero({ activation: a, justActivated }: { activation: EmcrActivation; justActivated: boolean }) {
  const t = useT();
  const active = a.active;
  const until = a.expiresAt ? longDate(a.expiresAt) : null;
  const soon = active && !!a.expiresAt && a.daysLeft <= SOON_DAYS;
  const share = active && a.expiresAt ? Math.max(0.02, Math.min(1, a.daysLeft / TERM_DAYS)) : 0;
  return (
    <View style={styles.hero} accessibilityLiveRegion={justActivated ? 'polite' : undefined}>
      <View style={styles.heroTop}>
        <Text style={styles.heroEyebrow}>eMCR</Text>
        <View style={[styles.chip, active ? (soon ? styles.chipSoon : styles.chipOn) : styles.chipOff]}>
          <Ionicons
            name={active ? (soon ? 'alert-circle' : 'checkmark-circle') : 'key-outline'}
            size={14}
            color={active ? (soon ? colors.warning : colors.accent) : colors.warning}
          />
          <Text style={[styles.chipText, (soon || !active) && styles.chipTextWarn]}>
            {active ? (soon ? t('activate.endsSoon') : t('activate.chipActive')) : t('activate.chipInactive')}
          </Text>
        </View>
      </View>
      <Text style={styles.heroTitle}>{active ? t('activate.isActive') : t('activate.notActivated')}</Text>
      <Text style={styles.heroLine}>
        {active
          ? until
            ? t('activate.until', { date: until })
            : t('activate.noEndDate')
          : until
            ? t('activate.endedOn', { date: until })
            : t('activate.enterToUse')}
      </Text>
      {active && a.expiresAt ? (
        <>
          <View
            style={styles.meter}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('activate.daysLeftA11y', { count: a.daysLeft })}
            accessibilityValue={{ min: 0, max: TERM_DAYS, now: Math.min(a.daysLeft, TERM_DAYS) }}
          >
            <View style={[styles.meterFill, soon && styles.meterFillSoon, { width: `${share * 100}%` }]} />
          </View>
          <Text style={styles.heroFoot}>{t('activate.daysLeftLine', { count: a.daysLeft })}</Text>
        </>
      ) : null}
    </View>
  );
}

function HowRow({ icon, text, last }: { icon: keyof typeof Ionicons.glyphMap; text: string; last?: boolean }) {
  return (
    <View style={[styles.howRow, !last && styles.divider]}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={styles.howText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },

  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4 },
  heroLoading: { alignItems: 'center', paddingVertical: spacing.xl },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  heroEyebrow: { fontSize: 12, fontWeight: '700', color: colors.onNavyMuted, letterSpacing: 0.6 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: colors.primaryText, marginTop: spacing.sm + 4 },
  heroLine: { fontSize: 15, lineHeight: 21, color: colors.onNavyMuted, marginTop: spacing.xs, fontVariant: ['tabular-nums'] },
  heroFoot: { fontSize: 13, color: colors.onNavyMuted, marginTop: spacing.xs + 2, fontVariant: ['tabular-nums'] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
  },
  chipOn: { borderWidth: 1, borderColor: colors.navyLine },
  chipSoon: { backgroundColor: colors.warningSoft },
  chipOff: { backgroundColor: colors.warningSoft },
  chipText: { fontSize: 12, fontWeight: '600', color: colors.primaryText },
  chipTextWarn: { color: colors.warning },
  meter: { height: 8, borderRadius: 4, backgroundColor: colors.navyLine, overflow: 'hidden', marginTop: spacing.md },
  meterFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  meterFillSoon: { backgroundColor: colors.warningSoft },

  statusError: { alignItems: 'flex-start', gap: spacing.xs },
  statusErrorText: { fontSize: 14, color: colors.textMuted },
  retry: { minHeight: 44, justifyContent: 'center' },
  retryText: { fontSize: 14, fontWeight: '600', color: colors.primary },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  ruled: { paddingVertical: 0, gap: 0 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4, paddingVertical: spacing.sm + 4 },
  howText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.text },

  successHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  successTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, lineHeight: 21, color: colors.text, fontVariant: ['tabular-nums'] },
  meta: { fontSize: 13, color: colors.textMuted },
});
