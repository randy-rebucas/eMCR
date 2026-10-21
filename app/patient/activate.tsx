import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
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
import { AppHeader, softShadow } from '@/components/AppHeader';
import { IconField } from '@/components/auth';
import { QrScanner } from '@/components/QrScanner';

/**
 * "Enter your activation code": redeem the code printed on an eMCR voucher from a clinic.
 * Opened from Home, More, a renewal push, or any call the server refused with 402.
 * Never shows prices: vouchers are handled at the clinic counter.
 */
export default function ActivateScreen() {
  const bottomPad = useBottomPadding();
  const account = useApiData<EmcrAccount>(EMCR_ENDPOINTS.account, { refreshOn: ['activation'] });
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
      setError('Enter the 12-character code on your voucher, like ABCD-EFGH-JKMN.');
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
          ? "Can't reach the server. Check your connection and try again."
          : errorMessage(err, "Couldn't activate. Please try again.")
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
      setError("That QR code isn't an eMCR voucher. Scan the QR printed on your voucher, or type the code.");
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
          Activate eMCR
        </Text>
        <Text style={styles.subtitle}>Get an activation voucher at your clinic, then enter the code printed on it.</Text>
      </SafeAreaView>

      {success ? (
        <View style={[styles.card, styles.successCard]} accessibilityLiveRegion="polite">
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={40} color={colors.primaryText} />
          </View>
          <Text style={styles.successTitle} accessibilityRole="header">
            eMCR Is Active
          </Text>
          <Text style={styles.successText}>
            {success.activation.expiresAt
              ? `Active until ${formatDate(success.activation.expiresAt, { month: 'long', day: 'numeric', year: 'numeric' })}.`
              : 'Your activation code was accepted.'}
          </Text>
          {success.soldBy ? <Text style={styles.meta}>Voucher from {success.soldBy}</Text> : null}
          <Button title="Done" onPress={close} style={styles.fullWidth} />
        </View>
      ) : (
        <>
          <StatusCard loading={account.loading} error={account.error} account={account.data} />

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Enter your activation code</Text>
            {error ? (
              <View style={styles.banner}>
                <Banner message={error} />
              </View>
            ) : null}
            <IconField
              icon="key-outline"
              label="XXXX-XXXX-XXXX"
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
            <Button title="Activate" onPress={() => redeem()} loading={submitting} disabled={!complete} />
            <Button
              title="Scan the voucher QR"
              icon="qr-code-outline"
              variant="secondary"
              onPress={() => {
                setError(null);
                setScanning(true);
              }}
              disabled={submitting}
            />
          </View>

          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={18} color={colors.slate} />
            <Text style={styles.noteText}>
              Each code activates eMCR for a year, for you and the family members you manage. A new code adds a year
              to the date your current one ends.
            </Text>
          </View>
        </>
      )}

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <QrScanner
          onScanned={handleScanned}
          onCancel={() => setScanning(false)}
          prompt="Point the camera at the QR code on your activation voucher."
          purpose="To scan your activation voucher"
        />
      </Modal>
    </ScrollView>
  );
}

function StatusCard({ loading, error, account }: { loading: boolean; error: string | null; account: EmcrAccount | null }) {
  if (loading && !account) {
    return (
      <View style={[styles.card, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!account) return error ? <Text style={styles.statusError}>{error}</Text> : null;

  const a = account.activation;
  const until = a.expiresAt ? formatDate(a.expiresAt, { month: 'long', day: 'numeric', year: 'numeric' }) : null;
  const active = a.active;
  return (
    <View style={[styles.card, styles.statusRow]}>
      <View style={[styles.statusIcon, { backgroundColor: active ? colors.primarySoft : colors.warningSoft }]}>
        <Ionicons name={active ? 'shield-checkmark-outline' : 'key-outline'} size={24} color={active ? colors.primaryOnSoft : colors.warning} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>{active ? 'eMCR is active' : "eMCR isn't activated"}</Text>
        <Text style={styles.meta}>
          {active
            ? `Until ${until}${a.daysLeft ? ` · ${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} left` : ''}`
            : until
              ? `Your activation ended on ${until}.`
              : 'Enter a code to use booking, check-in, results and documents.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4 },
  flex: { flex: 1 },
  fullWidth: { alignSelf: 'stretch', marginTop: spacing.lg },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.md,
    marginBottom: spacing.md,
    ...softShadow,
  },
  center: { alignItems: 'center', paddingVertical: spacing.lg },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: -spacing.xs },
  banner: { marginBottom: -spacing.xs },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  statusIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  statusError: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.md },
  successCard: { alignItems: 'center', paddingVertical: spacing.xl },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: colors.text, marginTop: spacing.md },
  successText: { fontSize: 15, color: colors.text, marginTop: spacing.xs, marginBottom: spacing.sm, textAlign: 'center' },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.slateSoft,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.slate },
});
