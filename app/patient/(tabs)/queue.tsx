import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useApiData } from '@/lib/useApiData';
import { ApiError, apiRequest, errorMessage } from '@/lib/api';
import { emitRefresh } from '@/lib/events';
import { CheckInResult, QueueEntry } from '@/lib/types';
import { QrScanner } from '@/components/QrScanner';
import { clinicTodayYmd, clinicYmd, doctorName, formatTime } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, IconName } from '@/components/ui';
import { OfflineBanner, savedAtLabel } from '@/components/OfflineBanner';
import { ErrorView } from '@/components/StateView';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { photos, ScrimPhoto } from '@/components/Photo';
import { PlainKey, useT } from '@/lib/i18n';

/**
 * The backend has no realtime channel, so the queue position is polled while
 * this screen is focused and the app is in the foreground. A queue push
 * (`data.tag` = `queue-…`, e.g. "You're 3rd in line") also triggers an immediate refetch.
 *
 * Self check-in: at clinics that allow it, the patient scans the clinic's check-in QR on arrival
 * (`POST /api/patients/me/check-in`). Opened directly with `?scan=1` from Home.
 */
const POLL_INTERVAL_MS = 30000;

/** Most people drawn in the line; anyone further back is counted ("+4"). */
const MAX_DOTS = 8;

const QUEUE_TYPE_LABEL: Record<string, PlainKey> = {
  appointment: 'queue.type.appointment',
  'walk-in': 'queue.type.walk-in',
  'follow-up': 'queue.type.follow-up',
};

type StepState = 'done' | 'current' | 'todo';

export default function QueueScreen() {
  const t = useT();
  const { data: entry, loading, refreshing, error, updatedAt, offline, stale, refresh, poll } = useApiData<QueueEntry | null>(
    '/api/patients/me/queue',
    { refreshOn: ['queue'], offline: true }
  );
  const focusedBefore = useRef(false);
  const [showQr, setShowQr] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const { scan } = useLocalSearchParams<{ scan?: string }>();

  // Home's "At the clinic?" card opens the scanner straight away.
  useEffect(() => {
    if (scan === '1') {
      setScanning(true);
      router.setParams({ scan: undefined });
    }
  }, [scan]);

  async function checkIn(qrCode: string) {
    setScanning(false);
    setCheckingIn(true);
    try {
      const result = await apiRequest<CheckInResult>('/api/patients/me/check-in', { method: 'POST', body: { qrCode } });
      emitRefresh('queue', 'appointments');
      const q = result.queue;
      const where = q.clinic?.name ? t('queue.checkIn.atClinic', { clinic: q.clinic.name }) : '';
      const line =
        q.status === 'in-progress'
          ? t('queue.checkIn.turnNow')
          : q.status === 'away'
            ? q.awayReason === 'missed'
              ? t('queue.status.missedText')
              : t('queue.status.atLabText')
            : q.position && q.position > 1
              ? t('queue.checkIn.ahead', { count: q.position - 1 })
              : t('queue.checkIn.next');
      Alert.alert(
        result.status === 'already-checked-in' ? t('queue.checkIn.already') : t('queue.checkIn.done'),
        t('queue.checkIn.body', { number: q.queueNumber, where, line })
      );
    } catch (err) {
      const retryable = err instanceof ApiError && (err.code === 'QR_EXPIRED' || err.code === 'INVALID_QR');
      Alert.alert(t('queue.checkIn.failed'), errorMessage(err, t('queue.checkIn.failedFallback')), [
        ...(retryable ? [{ text: t('queue.checkIn.scanAgain'), onPress: () => setScanning(true) }] : []),
        { text: t('common.ok'), style: 'cancel' as const },
      ]);
    } finally {
      setCheckingIn(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      // The first focus coincides with the initial load; refetch on later returns to the tab.
      if (focusedBefore.current) poll();
      focusedBefore.current = true;

      const interval = setInterval(() => {
        if (AppState.currentState === 'active') poll();
      }, POLL_INTERVAL_MS);
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') poll();
      });
      return () => {
        clearInterval(interval);
        subscription.remove();
      };
    }, [poll])
  );

  // A saved copy from an earlier clinic day (shown before / instead of the server's answer) is
  // over: that queue has closed, so don't present it as today's position.
  const fromEarlierDay =
    !!entry &&
    (stale || offline) &&
    (() => {
      const at = entry.queuedAt ? new Date(entry.queuedAt) : updatedAt ? new Date(updatedAt) : null;
      return !!at && !isNaN(at.getTime()) && clinicYmd(at) !== clinicTodayYmd();
    })();
  const active =
    entry && !fromEarlierDay && (entry.status === 'waiting' || entry.status === 'in-progress' || entry.status === 'away')
      ? entry
      : null;
  const serving = active?.status === 'in-progress';
  const away = active?.status === 'away';
  const missed = away && active?.awayReason === 'missed';
  const atLab = away && !missed;
  const checkedIn = !!active && (active.checkedIn || serving || away);
  const canShowQr = !!active?.qrCode && !checkedIn;
  const canSelfCheckIn = !checkedIn;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={['top']}>
          <AppHeader />
          {/* No QR button up here: the status card below has it, next to what to do with it. */}
          <Text style={styles.title} accessibilityRole="header">
            {t('queue.title')}
          </Text>
          <Text style={styles.subtitle}>{t('queue.subtitle')}</Text>
        </SafeAreaView>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error && !entry ? (
          <ErrorView message={error} onRetry={refresh} />
        ) : !active ? (
          <>
            <OfflineBanner offline={offline} updatedAt={updatedAt} />
            <NotInQueue onScan={() => setScanning(true)} checkingIn={checkingIn} />
          </>
        ) : (
          <>
            {/* A saved copy from an earlier visit: the position has almost certainly moved on. */}
            {stale && !offline ? (
              <Banner tone="warning" message={updatedAt ? t('queue.staleWhen', { when: savedAtLabel(updatedAt) }) : t('queue.stale')} />
            ) : null}
            <OfflineBanner offline={offline} updatedAt={updatedAt} subject={t('queue.offlineSubject')} />
            {/* A failed poll keeps the last position on screen; say it may be out of date. */}
            {error && !offline ? (
              <Banner
                tone="warning"
                message={updatedAt ? t('queue.updateFailedAt', { time: formatTime(updatedAt) }) : t('queue.updateFailed')}
              />
            ) : null}

            {/* The number, and where the patient stands. Navy while waiting; teal when it's their turn. */}
            <View style={[styles.hero, serving && styles.heroServing]}>
              <View style={styles.pill}>
                <Ionicons
                  name={
                    serving
                      ? 'notifications'
                      : missed
                        ? 'alert-circle'
                        : atLab
                          ? 'flask-outline'
                          : checkedIn
                            ? 'checkmark-circle'
                            : 'scan-outline'
                  }
                  size={14}
                  color={serving ? colors.primaryText : checkedIn && !away ? colors.accent : colors.onNavyMuted}
                />
                <Text style={styles.pillText}>
                  {serving
                    ? t('queue.pill.serving')
                    : missed
                      ? t('queue.pill.missed')
                      : atLab
                        ? t('queue.pill.atLab')
                        : checkedIn
                          ? t('common.status.waiting')
                          : t('queue.pill.notCheckedIn')}
                </Text>
              </View>

              <Text
                style={styles.number}
                adjustsFontSizeToFit
                numberOfLines={1}
                accessibilityLabel={t('queue.numberA11y', { number: active.queueNumber })}
              >
                {active.queueNumber}
              </Text>
              <Text style={[styles.heroType, serving && styles.onTeal]}>
                {t(QUEUE_TYPE_LABEL[active.queueType ?? ''] ?? 'queue.type.consultation')}
                {active.doctor ? ` · ${doctorName(active.doctor)}` : ''}
              </Text>

              <View style={styles.heroRule} />
              {serving ? (
                <View style={styles.goTo}>
                  <Ionicons name="walk-outline" size={24} color={colors.primaryText} />
                  <Text style={styles.goToText}>
                    {active.room?.name ? t('queue.hero.goTo', { room: active.room.name }) : t('queue.hero.goToRoom')}
                  </Text>
                </View>
              ) : !away && typeof active.position === 'number' && isFinite(active.position) ? (
                <QueueLine ahead={Math.max(0, active.position - 1)} minutes={active.estimatedWaitTime} />
              ) : null}

              {updatedAt ? <Text style={[styles.updated, serving && styles.onTeal]}>{t('queue.updated', { time: formatTime(updatedAt) })}</Text> : null}
            </View>

            {/* What to do now */}
            <View style={[styles.card, styles.statusCard]}>
              <View style={styles.statusIcon}>
                <Ionicons
                  name={
                    serving
                      ? 'walk-outline'
                      : missed
                        ? 'alert-circle-outline'
                        : atLab
                          ? 'flask-outline'
                          : checkedIn
                            ? 'hourglass-outline'
                            : 'qr-code-outline'
                  }
                  size={28}
                  color={colors.primaryOnSoft}
                />
              </View>
              <View style={styles.flex}>
                <Text style={styles.statusTitle}>
                  {serving
                    ? t('queue.status.turn')
                    : missed
                      ? t('queue.status.missed')
                      : atLab
                        ? t('queue.status.atLab')
                        : checkedIn
                          ? t('queue.status.inQueue')
                          : t('queue.status.checkIn')}
                </Text>
                <Text style={styles.statusText}>
                  {serving
                    ? t('queue.status.proceed', { room: active.room?.name ?? t('queue.status.assignedRoom') })
                    : missed
                      ? t('queue.status.missedText')
                      : atLab
                        ? t('queue.status.atLabText')
                        : checkedIn
                          ? t('queue.status.waitText')
                          : t('queue.status.checkInText')}
                </Text>
                {canSelfCheckIn ? (
                  <TouchableOpacity
                    style={styles.inlineAction}
                    onPress={() => setScanning(true)}
                    disabled={checkingIn}
                    accessibilityRole="button"
                    accessibilityState={{ busy: checkingIn }}
                  >
                    <Ionicons name="scan-outline" size={16} color={colors.primaryOnSoft} />
                    <Text style={styles.inlineActionText}>{checkingIn ? t('queue.checkingIn') : t('queue.imHere')}</Text>
                  </TouchableOpacity>
                ) : null}
                {canShowQr ? (
                  <TouchableOpacity style={styles.inlineAction} onPress={() => setShowQr(true)} accessibilityRole="button">
                    <Ionicons name="qr-code-outline" size={16} color={colors.primaryOnSoft} />
                    <Text style={styles.inlineActionText}>{t('queue.qr.show')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {/* Progress */}
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {t('queue.progress')}
            </Text>
            <View style={[styles.card, styles.progress]}>
              <Step n={1} label={t('queue.step.checkIn')} state={checkedIn ? 'done' : 'current'} />
              <Connector done={checkedIn} />
              <Step n={2} label={t('queue.step.waiting')} state={serving ? 'done' : checkedIn ? 'current' : 'todo'} />
              <Connector done={serving} />
              <Step n={3} label={t('queue.step.consultation')} state={serving ? 'current' : 'todo'} />
            </View>

            <View style={styles.note}>
              <Ionicons name="information-circle-outline" size={18} color={colors.slate} />
              <Text style={styles.noteText}>{t('queue.note')}</Text>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <QrScanner
          onScanned={checkIn}
          onCancel={() => setScanning(false)}
          prompt={t('queue.scanner.prompt')}
          purpose={t('queue.scanner.purpose')}
        />
      </Modal>

      <Modal visible={showQr && canShowQr} transparent animationType="fade" onRequestClose={() => setShowQr(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle} accessibilityRole="header">
              {t('queue.qr.title')}
            </Text>
            <Text style={styles.sheetText}>{t('queue.qr.sheetText')}</Text>
            <View style={styles.qrFrame}>
              {active?.qrCode ? <QRCode value={active.qrCode} size={220} color={colors.text} /> : null}
            </View>
            <Text style={styles.sheetNumber}>{active?.queueNumber}</Text>
            <Button title={t('common.done')} onPress={() => setShowQr(false)} style={styles.stretch} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

/**
 * The line ahead of the patient, drawn: one dot per patient ahead (up to MAX_DOTS, then "+n"),
 * then the patient as a ringed "You". The words under it carry the numbers, so the dots are
 * decoration for screen readers; the whole line reads as one sentence.
 */
function QueueLine({ ahead, minutes }: { ahead: number; minutes?: number | null }) {
  const t = useT();
  const shown = Math.min(ahead, MAX_DOTS);
  const words = ahead === 0 ? t('queue.line.next') : t('queue.line.ahead', { count: ahead });
  const wait = ahead > 0 && minutes ? t('queue.line.wait', { minutes }) : null;
  return (
    <View accessible accessibilityLabel={wait ? `${words}, ${wait}` : words}>
      <View style={styles.line}>
        {Array.from({ length: shown }).map((_, i) => (
          <View key={i} style={styles.dot}>
            <Ionicons name="person" size={14} color={colors.onNavyMuted} />
          </View>
        ))}
        {ahead > shown ? <Text style={styles.more}>{t('queue.line.more', { count: ahead - shown })}</Text> : null}
        <View style={styles.you}>
          <Text style={styles.youText}>{t('queue.line.you')}</Text>
        </View>
      </View>
      <Text style={styles.lineWords}>
        {words}
        {wait ? <Text style={styles.lineWait}>{` · ${wait}`}</Text> : null}
      </Text>
    </View>
  );
}

/** Not in line: a waiting-room photo with how check-in works, and the two ways in. */
function NotInQueue({ onScan, checkingIn }: { onScan: () => void; checkingIn: boolean }) {
  const t = useT();
  return (
    <ScrimPhoto source={photos.waitingRoom} style={styles.notIn} top={0.3} bottom={0.97}>
      <View style={styles.notInInner}>
        <Text style={styles.notInTitle} accessibilityRole="header">
          {t('queue.notIn.title')}
        </Text>
        <Text style={styles.notInText}>{t('queue.notIn.text')}</Text>
        <Button title={t('queue.notIn.scan')} icon="scan-outline" onPress={onScan} loading={checkingIn} style={styles.notInButton} />
        <TouchableOpacity
          style={styles.notInLink}
          onPress={() => router.push('/patient/appointments')}
          accessibilityRole="link"
        >
          <Ionicons name="calendar-outline" size={18} color={colors.primaryText} />
          <Text style={styles.notInLinkText}>{t('queue.notIn.viewAppointments')}</Text>
        </TouchableOpacity>
      </View>
    </ScrimPhoto>
  );
}

function Step({ n, label, state }: { n: number; label: string; state: StepState }) {
  const t = useT();
  const caption = state === 'done' ? t('queue.step.done') : state === 'current' ? t('queue.step.now') : t('queue.step.next');
  return (
    <View style={styles.step} accessible accessibilityLabel={t('queue.step.a11y', { n, label, caption })}>
      <View style={[styles.stepCircle, state !== 'todo' && styles.stepCircleOn]}>
        {state === 'done' ? (
          <Ionicons name="checkmark" size={18} color={colors.primaryText} />
        ) : (
          <Text style={[styles.stepNum, state === 'current' && styles.stepNumOn]}>{n}</Text>
        )}
      </View>
      <Text style={[styles.stepLabel, state === 'todo' && styles.stepLabelTodo]}>{label}</Text>
      <Text style={[styles.stepCaption, state !== 'todo' && styles.stepCaptionOn]}>{caption}</Text>
    </View>
  );
}

function Connector({ done }: { done: boolean }) {
  return <View style={[styles.connector, done && styles.connectorDone]} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch' },
  loading: { paddingVertical: spacing.xl * 2 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...softShadow,
  },

  // Solid fill, no gradient or watermark: the number is the picture.
  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4 },
  heroServing: { backgroundColor: colors.primary },
  // Muted navy text is too faint on teal (about 2:1): white there.
  onTeal: { color: colors.primaryText },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.navyLine,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 5,
  },
  pillText: { fontSize: 12, fontWeight: '700', color: colors.primaryText },
  number: {
    fontSize: 56,
    fontWeight: '800',
    color: colors.primaryText,
    letterSpacing: -1,
    marginTop: spacing.sm,
    fontVariant: ['tabular-nums'],
  },
  heroType: { fontSize: 15, fontWeight: '600', color: colors.onNavyMuted },
  heroRule: { height: StyleSheet.hairlineWidth, backgroundColor: colors.navyLine, marginVertical: spacing.md },
  goTo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  goToText: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.primaryText },
  line: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.navyLine,
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: { fontSize: 13, fontWeight: '700', color: colors.onNavyMuted, fontVariant: ['tabular-nums'] },
  you: {
    height: 30,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: 15,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  youText: { fontSize: 13, fontWeight: '800', color: colors.navy },
  lineWords: { fontSize: 17, fontWeight: '700', color: colors.primaryText, marginTop: spacing.sm + 2, fontVariant: ['tabular-nums'] },
  lineWait: { fontWeight: '500', color: colors.onNavyMuted },
  updated: { fontSize: 12, color: colors.onNavyMuted, marginTop: spacing.md, fontVariant: ['tabular-nums'] },

  statusCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  statusIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  statusText: { fontSize: 13, lineHeight: 19, color: colors.textMuted, marginTop: 4 },
  inlineAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    minHeight: 44,
    marginTop: spacing.sm,
  },
  inlineActionText: { fontSize: 13, fontWeight: '700', color: colors.primaryOnSoft },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm + 4 },
  progress: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.md + 4 },
  step: { alignItems: 'center', width: 80 },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepNum: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
  stepNumOn: { color: colors.primaryText },
  stepLabel: { fontSize: 13, fontWeight: '600', color: colors.text, marginTop: spacing.sm },
  stepLabelTodo: { color: colors.textMuted },
  stepCaption: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  stepCaptionOn: { color: colors.primary, fontWeight: '600' },
  connector: { flex: 1, height: 2, backgroundColor: colors.border, marginTop: 19 },
  connectorDone: { backgroundColor: colors.primary },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.slateSoft,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginTop: spacing.lg,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.slate },

  notIn: { minHeight: 420, borderRadius: radius.lg },
  notInInner: { flex: 1, justifyContent: 'flex-end', padding: spacing.md + 4 },
  notInTitle: { fontSize: 20, fontWeight: '700', color: colors.primaryText },
  notInText: { fontSize: 14, lineHeight: 20, color: colors.onNavyMuted, marginTop: spacing.xs },
  notInButton: { marginTop: spacing.md },
  notInLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    marginTop: spacing.xs,
  },
  notInLinkText: { fontSize: 15, fontWeight: '600', color: colors.primaryText },

  backdrop: {
    flex: 1,
    backgroundColor: colors.backdrop,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.lg + 4,
    padding: spacing.lg,
    alignItems: 'center',
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  sheetText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },
  qrFrame: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.lg,
  },
  sheetNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    fontVariant: ['tabular-nums'],
  },
});
