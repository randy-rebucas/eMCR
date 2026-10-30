import { ReactNode, useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useProfile } from '@/lib/profile';
import { useApiData } from '@/lib/useApiData';
import { useUnread } from '@/lib/unread';
import { Appointment, EmcrAccount, InvoiceListEnvelope, LabResult, QueueEntry } from '@/lib/types';
import { EMCR_ENDPOINTS } from '@/lib/emcr';
import { clinicTodayYmd, clinicYmd, formatDate, formatMoney } from '@/lib/format';
import { appointmentStart, isUpcoming } from '@/lib/appointments';
import { colors, radius, spacing } from '@/lib/theme';
import { IconName } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { AppointmentCard } from '@/components/AppointmentCard';
import { ResultStatusPill } from '@/components/ResultStatusPill';
import { TourTarget } from '@/components/QuickTour';
import { VisitFeedbackPrompt } from '@/components/VisitFeedbackPrompt';

const ACTIVE_QUEUE = new Set(['waiting', 'in-progress']);

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning,' : h < 18 ? 'Good afternoon,' : 'Good evening,';
}

const SHORTCUTS: { label: string; icon: IconName; href: string; bg: string; fg: string }[] = [
  { label: 'Appointments', icon: 'calendar-outline', href: '/patient/appointments', bg: '#E3F6F5', fg: '#0A7F7E' },
  { label: 'My Queue', icon: 'qr-code-outline', href: '/patient/queue', bg: '#E6EEFB', fg: '#2F5FB3' },
  { label: 'View Results', icon: 'document-text-outline', href: '/patient/results', bg: '#EEEAFB', fg: '#5B47B0' },
  { label: 'Prescriptions', icon: 'bandage-outline', href: '/patient/prescriptions', bg: '#FDEFE4', fg: '#B5541B' },
];

export default function HomeScreen() {
  const { viewing: patient } = useProfile();
  const { refreshUnread } = useUnread();
  const appointments = useApiData<Appointment[]>('/api/patients/me/appointments?limit=20', {
    refreshOn: ['appointments'],
  });
  const account = useApiData<EmcrAccount>(EMCR_ENDPOINTS.account, { refreshOn: ['activation'] });
  const activation = account.data?.activation ?? null;
  // The queue needs an active eMCR year once the server enforces it; don't call it (and get sent
  // to the activation screen) just for opening Home. Wait for the account so we know.
  const locked = !!activation && activation.enforced && !activation.active;
  const queue = useApiData<QueueEntry | null>(account.loading || locked ? null : '/api/patients/me/queue', {
    refreshOn: ['queue'],
  });
  const results = useApiData<LabResult[]>('/api/patients/me/lab-results?limit=1', { refreshOn: ['lab-results'] });
  const invoices = useApiData<InvoiceListEnvelope>('/api/patients/me/invoices?limit=1', {
    envelope: true,
    refreshOn: ['invoices'],
  });

  const next = useMemo(() => {
    return (appointments.data ?? [])
      .filter(isUpcoming)
      .sort((a, b) => appointmentStart(a) - appointmentStart(b))[0];
  }, [appointments.data]);

  const queueEntry = queue.data && ACTIVE_QUEUE.has(queue.data.status) ? queue.data : null;
  // An in-person visit today with no check-in yet: offer the clinic's self check-in.
  const nextIsToday = !!next && next.modality !== 'teleconsult' && clinicYmd(new Date(appointmentStart(next))) === clinicTodayYmd();
  const offerCheckIn = !account.loading && !queue.loading && !queue.error && ((nextIsToday && !queueEntry) || (queueEntry?.status === 'waiting' && !queueEntry.checkedIn));
  const latestResult = results.data?.[0];
  const balance = invoices.data?.summary?.outstandingBalance ?? 0;
  const refreshing =
    appointments.refreshing || queue.refreshing || results.refreshing || invoices.refreshing || account.refreshing;

  function refreshAll() {
    account.refresh();
    appointments.refresh();
    queue.refresh();
    results.refresh();
    invoices.refresh();
    refreshUnread();
  }

  const fullName = patient ? `${patient.firstName} ${patient.lastName}`.trim() : '';

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="hero" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#D5F0EE" />
                <Stop offset="1" stopColor={colors.background} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#hero)" />
            <Circle cx="105%" cy="38%" r="150" fill={colors.accent} opacity={0.1} />
            <Circle cx="92%" cy="62%" r="70" fill={colors.accent} opacity={0.08} />
          </Svg>
          <SafeAreaView edges={['top']}>
            <AppHeader />

            <Text style={styles.hello}>{greeting()}</Text>
            {fullName ? (
              <Text style={styles.name} numberOfLines={1}>
                {fullName} 👋
              </Text>
            ) : null}
            <Text style={styles.tagline}>Your health. Our priority.</Text>
          </SafeAreaView>
        </View>

        <View style={styles.body}>
          {/* eMCR activation */}
          {activation ? <ActivationCard activation={activation} /> : null}

          {/* Visit feedback the clinic asked for (closable for this session) */}
          <VisitFeedbackPrompt />

          {/* Booking CTA */}
          <TourTarget id="home-book">
            <TouchableOpacity
              style={styles.cta}
              onPress={() => router.push('/patient/appointments/book')}
              accessibilityRole="button"
              accessibilityLabel="Book an appointment"
            >
              <View style={styles.ctaIcon}>
                <Ionicons name="medkit-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.ctaTitle}>Need to book an appointment?</Text>
                <Text style={styles.ctaText}>Choose a doctor and a schedule that works for you.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </TouchableOpacity>
          </TourTarget>

          {/* Shortcuts */}
          <TourTarget id="home-shortcuts" style={styles.shortcuts}>
            {SHORTCUTS.map((s) => (
              <TouchableOpacity
                key={s.label}
                style={styles.shortcut}
                onPress={() => router.push(s.href as never)}
                accessibilityRole="button"
                accessibilityLabel={s.label}
              >
                <View style={[styles.shortcutIcon, { backgroundColor: s.bg }]}>
                  <Ionicons name={s.icon} size={26} color={s.fg} />
                </View>
                <Text style={styles.shortcutLabel} numberOfLines={2}>
                  {s.label}
                </Text>
              </TouchableOpacity>
            ))}
          </TourTarget>

          {/* Next appointment */}
          <Section title="Next Appointment" action="View All" onAction={() => router.push('/patient/appointments')}>
            {appointments.loading ? (
              <LoadingCard />
            ) : appointments.error && !appointments.data ? (
              <MessageCard text={appointments.error} />
            ) : next ? (
              <AppointmentCard appointment={next} />
            ) : (
              <MessageCard
                text="No upcoming appointments."
                action={{ title: 'Book one', onPress: () => router.push('/patient/appointments/book') }}
              />
            )}
          </Section>

          {offerCheckIn ? (
            <TouchableOpacity
              style={[styles.card, styles.rowCard, styles.checkInCard]}
              onPress={() => router.push({ pathname: '/patient/queue', params: { scan: '1' } })}
              accessibilityRole="button"
              accessibilityLabel="At the clinic? Scan the check-in QR code"
            >
              <View style={styles.tile}>
                <Ionicons name="scan-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>At the clinic?</Text>
                <Text style={styles.meta}>Scan the check-in QR at the front desk to join the queue.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}

          {/* Queue — only while the patient is actually in line */}
          {queueEntry ? (
            <Section title="Queue Status" action="View Queue" onAction={() => router.push('/patient/queue')}>
              <TouchableOpacity
                style={[styles.card, styles.queueCard]}
                onPress={() => router.push('/patient/queue')}
                accessibilityRole="button"
              >
                <View style={styles.queueIcon}>
                  <Ionicons name="people" size={28} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  {queueEntry.status === 'in-progress' ? (
                    <>
                      <Text style={styles.queueTurn}>It's your turn!</Text>
                      <Text style={styles.meta}>
                        {queueEntry.room ? `Please proceed to ${queueEntry.room.name}.` : 'Please proceed to your room.'}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.meta}>Your Queue Number</Text>
                      <Text style={styles.queueNumber}>{queueEntry.queueNumber}</Text>
                      {queueEntry.position !== null ? (
                        <Text style={styles.queueLine}>
                          {queueEntry.position <= 1
                            ? "You're next"
                            : `${queueEntry.position - 1} patient${queueEntry.position - 1 === 1 ? '' : 's'} ahead of you`}
                        </Text>
                      ) : null}
                      {queueEntry.estimatedWaitTime ? (
                        <Text style={styles.meta}>Estimated wait: ~{queueEntry.estimatedWaitTime} min</Text>
                      ) : null}
                    </>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </Section>
          ) : null}

          {/* Latest result */}
          {latestResult ? (
            <Section title="Recent Results" action="View All" onAction={() => router.push('/patient/results')}>
              <TouchableOpacity
                style={[styles.card, styles.rowCard]}
                onPress={() => router.push(`/patient/results/${latestResult._id}`)}
                accessibilityRole="button"
              >
                <View style={styles.tile}>
                  <Ionicons name="flask-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {latestResult.request?.testType ?? 'Lab test'}
                  </Text>
                  <Text style={styles.meta}>
                    {formatDate(latestResult.resultDate ?? latestResult.orderDate ?? latestResult.createdAt)}
                  </Text>
                </View>
                <ResultStatusPill status={latestResult.status} />
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </Section>
          ) : null}

          {/* Health summary */}
          <Section title="Health Summary" action="Open" onAction={() => router.push('/patient/health-summary')}>
            <TouchableOpacity
              style={[styles.card, styles.rowCard]}
              onPress={() => router.push('/patient/health-summary')}
              accessibilityRole="button"
            >
              <View style={styles.tile}>
                <Ionicons name="heart-outline" size={24} color={colors.primary} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>Allergies, medicines and vaccines</Text>
                <Text style={styles.meta}>From every clinic, in one place. Download it as a PDF for a new doctor.</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </Section>

          {/* Balance */}
          {balance > 0 ? (
            <Section title="Outstanding Balance" action="View Bills" onAction={() => router.push('/patient/invoices')}>
              <TouchableOpacity
                style={[styles.card, styles.rowCard]}
                onPress={() => router.push('/patient/invoices')}
                accessibilityRole="button"
              >
                <View style={styles.tile}>
                  <Ionicons name="receipt-outline" size={24} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.meta}>Total Amount Due</Text>
                  <Text style={styles.balance}>{formatMoney(balance)}</Text>
                </View>
                <View style={styles.payNote}>
                  <Ionicons name="business-outline" size={14} color={colors.primaryOnSoft} />
                  <Text style={styles.payNoteText}>Pay at the clinic</Text>
                </View>
              </TouchableOpacity>
            </Section>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Not activated (and the server enforces it): a prominent card to the activation screen.
 * Ending within 30 days: a renewal reminder. Otherwise nothing (More shows the end date).
 */
function ActivationCard({ activation }: { activation: EmcrAccount['activation'] }) {
  const needed = !activation.active && activation.enforced;
  const renew = activation.active && activation.daysLeft <= 30;
  if (!needed && !renew) return null;

  const until = activation.expiresAt ? formatDate(activation.expiresAt, { month: 'long', day: 'numeric', year: 'numeric' }) : null;
  const title = needed ? 'Activate eMCR' : 'Renew your eMCR';
  const text = needed
    ? 'Get an activation voucher at your clinic, then enter the code to book, check in and see your results.'
    : `Your eMCR ends ${until ? `on ${until}` : 'soon'}${
        activation.daysLeft > 0 ? ` (${activation.daysLeft} day${activation.daysLeft === 1 ? '' : 's'} left)` : ''
      }. Enter a new code to add a year.`;
  return (
    <TouchableOpacity
      style={[styles.card, styles.rowCard, needed ? styles.activateCard : styles.renewCard]}
      onPress={() => router.push('/patient/activate')}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${text}`}
    >
      <View style={[styles.tile, needed ? styles.activateTile : styles.renewTile]}>
        <Ionicons name={needed ? 'key-outline' : 'time-outline'} size={24} color={needed ? colors.primaryText : colors.warning} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.meta}>{text}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={needed ? colors.primary : colors.textMuted} />
    </TouchableOpacity>
  );
}

function Section({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action: string;
  onAction: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
        <TouchableOpacity
          style={styles.sectionAction}
          onPress={onAction}
          accessibilityRole="link"
          accessibilityLabel={`${action}: ${title}`}
        >
          <Text style={styles.sectionActionText}>{action}</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>
      {children}
    </View>
  );
}

function LoadingCard() {
  return (
    <View style={[styles.card, styles.centerCard]}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

function MessageCard({ text, action }: { text: string; action?: { title: string; onPress: () => void } }) {
  return (
    <View style={[styles.card, styles.centerCard]}>
      <Text style={styles.meta}>{text}</Text>
      {action ? (
        <TouchableOpacity onPress={action.onPress} accessibilityRole="button" style={styles.messageAction}>
          <Text style={styles.sectionActionText}>{action.title}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const shadow = softShadow;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xl },
  flex: { flex: 1 },
  hero: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl + spacing.md, overflow: 'hidden' },
  hello: { fontSize: 17, color: colors.text },
  name: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4, marginTop: 2 },
  tagline: { fontSize: 15, color: colors.textMuted, marginTop: spacing.xs },
  body: { paddingHorizontal: spacing.md + 4, marginTop: -spacing.lg },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: '#DDF3F1',
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#C6EAE7',
  },
  ctaIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  ctaText: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  shortcuts: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
  shortcut: { width: '23%', alignItems: 'center' },
  shortcutIcon: {
    width: '100%',
    aspectRatio: 1.2,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutLabel: { fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center', marginTop: spacing.sm },
  section: { marginTop: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  // minHeight keeps the "View All" link a 44pt target without changing the header layout.
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 44, paddingLeft: spacing.sm },
  sectionActionText: { fontSize: 14, fontWeight: '600', color: colors.primary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    ...shadow,
  },
  centerCard: { alignItems: 'center', paddingVertical: spacing.lg },
  messageAction: { marginTop: spacing.xs, minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  checkInCard: { marginTop: spacing.lg, borderColor: '#BFE3E0' },
  activateCard: { marginBottom: spacing.lg, borderColor: colors.primary, borderWidth: 1.5 },
  renewCard: { marginBottom: spacing.lg, borderColor: '#F1D9A6', backgroundColor: '#FFFBF2' },
  activateTile: { backgroundColor: colors.primary },
  renewTile: { backgroundColor: colors.warningSoft },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  queueCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: '#F1F8FD' },
  queueIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueNumber: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  queueLine: { fontSize: 14, color: colors.text, marginTop: 2 },
  queueTurn: { fontSize: 20, fontWeight: '800', color: colors.primary },
  tile: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balance: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 2 },
  payNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primarySoft,
    borderRadius: 999,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
  },
  payNoteText: { fontSize: 12, fontWeight: '600', color: colors.primaryOnSoft },
});
