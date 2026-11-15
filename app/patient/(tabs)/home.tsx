import { ReactNode, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useProfile } from '@/lib/profile';
import { useApiData } from '@/lib/useApiData';
import { useUnread } from '@/lib/unread';
import { Appointment, EmcrAccount, InvoiceListEnvelope, LabResult, QueueEntry } from '@/lib/types';
import { EMCR_ENDPOINTS } from '@/lib/emcr';
import { clinicHour, clinicTodayYmd, clinicYmd, formatDate, formatMoney, formatTime } from '@/lib/format';
import { appointmentStart, isUpcoming } from '@/lib/appointments';
import { doseStatus, DoseStatus, formatSlot, loadSchedule, ProfileSchedule, setDoseTaken, toMinutes } from '@/lib/medicineReminders';
import { colors, radius, spacing } from '@/lib/theme';
import { IconName } from '@/components/ui';
import { OfflineBanner } from '@/components/OfflineBanner';
import { SectionError } from '@/components/StateView';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { AppointmentCard } from '@/components/AppointmentCard';
import { photos, ScrimPhoto } from '@/components/Photo';
import { ResultStatusPill } from '@/components/ResultStatusPill';
import { TourTarget } from '@/components/QuickTour';
import { VisitFeedbackPrompt } from '@/components/VisitFeedbackPrompt';
import { PlainKey, TFunction, useT } from '@/lib/i18n';

const ACTIVE_QUEUE = new Set(['waiting', 'in-progress', 'away']);

function greeting(t: TFunction): string {
  // Clinic (Manila) time, so a phone set to another timezone still says the right thing.
  const h = clinicHour();
  return h < 12 ? t('home.greeting.morning') : h < 18 ? t('home.greeting.afternoon') : t('home.greeting.evening');
}

/**
 * Records that have no tab of their own (Appointments, Queue and Results are tabs already, so
 * they aren't repeated here). One icon family, one tone: the teal of the rest of the app.
 */
const SHORTCUTS: { label: PlainKey; hint: PlainKey; icon: IconName; href: string }[] = [
  { label: 'home.shortcut.prescriptions', hint: 'home.shortcut.prescriptionsHint', icon: 'document-text-outline', href: '/patient/prescriptions' },
  { label: 'home.shortcut.medicines', hint: 'home.shortcut.medicinesHint', icon: 'alarm-outline', href: '/patient/medicines' },
  { label: 'home.shortcut.health', hint: 'home.shortcut.healthHint', icon: 'pulse-outline', href: '/patient/health-summary' },
  { label: 'home.shortcut.bills', hint: 'home.shortcut.billsHint', icon: 'wallet-outline', href: '/patient/invoices' },
];

/** Most of today's doses listed on Home; the rest are counted and live on the Medicines screen. */
const MAX_DOSES = 4;

export default function HomeScreen() {
  const t = useT();
  const { patient: me } = useAuth();
  const { viewing: patient } = useProfile();
  const { refreshUnread } = useUnread();
  // Saved copies (offline: true) so Home still shows the last summary without a connection.
  const appointments = useApiData<Appointment[]>('/api/patients/me/appointments?limit=20', {
    refreshOn: ['appointments'],
    offline: true,
  });
  const account = useApiData<EmcrAccount>(EMCR_ENDPOINTS.account, { refreshOn: ['activation'], offline: true });
  const activation = account.data?.activation ?? null;
  // The queue needs an active eMCR year once the server enforces it; don't call it (and get sent
  // to the activation screen) just for opening Home. Wait for the account so we know.
  const locked = !!activation && activation.enforced && !activation.active;
  // No saved copy for the queue: an old position on Home would read as live (the Queue tab labels its copy).
  const queue = useApiData<QueueEntry | null>(account.loading || locked ? null : '/api/patients/me/queue', {
    refreshOn: ['queue'],
  });
  const results = useApiData<LabResult[]>('/api/patients/me/lab-results?limit=1', { refreshOn: ['lab-results'], offline: true });
  const invoices = useApiData<InvoiceListEnvelope>('/api/patients/me/invoices?limit=1', {
    envelope: true,
    refreshOn: ['invoices'],
    offline: true,
  });

  const next = useMemo(() => {
    return (appointments.data ?? [])
      .filter(isUpcoming)
      .sort((a, b) => appointmentStart(a) - appointmentStart(b))[0];
  }, [appointments.data]);

  const queueEntry = queue.data && ACTIVE_QUEUE.has(queue.data.status) ? queue.data : null;
  const nextIsToday = !!next && clinicYmd(new Date(appointmentStart(next))) === clinicTodayYmd();
  // An in-person visit today with no check-in yet: offer the clinic's self check-in.
  const nextInPersonToday = nextIsToday && next?.modality !== 'teleconsult';
  const offerCheckIn =
    !account.loading &&
    !queue.loading &&
    !queue.error &&
    ((nextInPersonToday && !queueEntry) || (queueEntry?.status === 'waiting' && !queueEntry.checkedIn));
  const latestResult = results.data?.[0];
  const balance = invoices.data?.summary?.outstandingBalance ?? 0;
  const refreshing =
    appointments.refreshing || queue.refreshing || results.refreshing || invoices.refreshing || account.refreshing;
  const appointmentsFailed = !!appointments.error && !appointments.data;
  // A failed results/balance load must not look like "no results" or "nothing due".
  const resultsFailed = !!results.error && !results.data;
  const balanceFailed = !!invoices.error && !invoices.data;
  // Offline banner: any section showing a saved copy, dated by the oldest copy on screen.
  const offlineLoads = [appointments, account, results, invoices].filter((l) => l.offline);
  const offlineSince = offlineLoads.reduce<number | null>(
    (oldest, l) => (l.updatedAt !== null && (oldest === null || l.updatedAt < oldest) ? l.updatedAt : oldest),
    null
  );

  // Today's doses come from the reminders saved on this phone (no server call). Re-read whenever
  // Home comes back into view: the Medicines screen changes them.
  const [schedule, setSchedule] = useState<ProfileSchedule | null>(null);
  const profileId = patient?.id ?? null;
  useFocusEffect(
    useCallback(() => {
      if (!profileId) return;
      let live = true;
      loadSchedule(profileId).then((s) => {
        if (live) setSchedule(s);
      });
      return () => {
        live = false;
      };
    }, [profileId])
  );

  function refreshAll() {
    account.refresh();
    appointments.refresh();
    queue.refresh();
    results.refresh();
    invoices.refresh();
    refreshUnread();
    if (profileId) loadSchedule(profileId).then(setSchedule);
  }

  const fullName = patient ? `${patient.firstName} ${patient.lastName}`.trim() : '';
  const status = bandStatus(t, queueEntry, next, nextIsToday, !!appointments.data);

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshAll} tintColor={colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={['top']} style={styles.header}>
          <AppHeader />
        </SafeAreaView>

        <View style={styles.body}>
          <OfflineBanner offline={offlineLoads.length > 0} updatedAt={offlineSince} />

          {/* The day, over a photo of a routine check-up. */}
          <ScrimPhoto source={photos.checkup} style={styles.band} top={0.3} bottom={0.95}>
            <View style={styles.bandInner}>
              <Text style={styles.bandDate}>{formatDate(Date.now(), { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
              <View>
                <Text style={styles.hello}>{greeting(t)}</Text>
                {fullName ? (
                  <Text style={styles.name} numberOfLines={1} accessibilityRole="header">
                    {fullName}
                  </Text>
                ) : null}
                {status ? (
                  <View style={styles.statusLine}>
                    <Ionicons name={status.icon} size={16} color={status.live ? colors.accent : colors.onNavyMuted} />
                    <Text style={[styles.statusText, status.live && styles.statusLive]}>{status.text}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </ScrimPhoto>

          {/* eMCR activation */}
          {activation ? <ActivationCard activation={activation} /> : null}

          {/* Visit feedback the clinic asked for (closable for this session) */}
          <VisitFeedbackPrompt />

          {/* Queue: only while the patient is actually in line. First, since it's happening now. */}
          {queueEntry ? (
            <Section title={t('home.queue.title')} action={t('home.queue.view')} onAction={() => router.push('/patient/queue')}>
              <TouchableOpacity style={[styles.card, styles.queueCard]} onPress={() => router.push('/patient/queue')} accessibilityRole="button">
                <View style={styles.queueIcon}>
                  <Ionicons
                    name={queueEntry.status === 'in-progress' ? 'notifications' : 'ticket-outline'}
                    size={28}
                    color={colors.primaryOnSoft}
                  />
                </View>
                <View style={styles.flex}>
                  {queueEntry.status === 'in-progress' ? (
                    <>
                      <Text style={styles.queueTurn}>{t('home.queue.yourTurn')}</Text>
                      <Text style={styles.meta}>
                        {queueEntry.room ? t('home.queue.proceedTo', { room: queueEntry.room.name }) : t('home.queue.proceedRoom')}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.meta}>{t('home.queue.yourNumber')}</Text>
                      <Text style={styles.queueNumber}>{queueEntry.queueNumber}</Text>
                      {queueEntry.status === 'away' ? (
                        <Text style={styles.queueLine}>
                          {queueEntry.awayReason === 'missed' ? t('home.queue.missed') : t('home.queue.atLab')}
                        </Text>
                      ) : null}
                      {typeof queueEntry.position === 'number' ? (
                        <Text style={styles.queueLine}>
                          {queueEntry.position <= 1 ? t('home.queue.next') : t('home.queue.ahead', { count: queueEntry.position - 1 })}
                        </Text>
                      ) : null}
                      {queueEntry.estimatedWaitTime ? (
                        <Text style={styles.meta}>{t('home.queue.wait', { minutes: queueEntry.estimatedWaitTime })}</Text>
                      ) : null}
                    </>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </Section>
          ) : null}

          {offerCheckIn ? (
            <TouchableOpacity
              style={[styles.card, styles.rowCard, styles.checkInCard]}
              onPress={() => router.push({ pathname: '/patient/queue', params: { scan: '1' } })}
              accessibilityRole="button"
              accessibilityLabel={t('home.checkIn.a11y')}
            >
              <View style={styles.tile}>
                <Ionicons name="scan-outline" size={24} color={colors.primaryOnSoft} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{t('home.checkIn.title')}</Text>
                <Text style={styles.meta}>{t('home.checkIn.text')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}

          {/* Next appointment. With nothing booked, the booking card below is the empty state. */}
          {appointments.loading || appointmentsFailed || next ? (
            <Section title={t('home.next.title')} action={t('home.viewAll')} onAction={() => router.push('/patient/appointments')}>
              {appointments.loading ? (
                <LoadingCard />
              ) : appointmentsFailed ? (
                <SectionError message={appointments.error!} onRetry={appointments.refresh} />
              ) : (
                <AppointmentCard appointment={next!} />
              )}
            </Section>
          ) : null}

          <TourTarget id="home-book" style={styles.section}>
            <BookCard empty={!appointments.loading && !appointmentsFailed && !next} />
          </TourTarget>

          {/* Today's doses, from the reminders set on the Medicines screen. */}
          {schedule && me && profileId ? (
            <DosesCard schedule={schedule} owner={me.id} profileId={profileId} onChange={setSchedule} />
          ) : null}

          {/* Records without a tab of their own */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, styles.shortcutsTitle]} accessibilityRole="header">
              {t('home.shortcuts.title')}
            </Text>
            <TourTarget id="home-shortcuts" style={styles.shortcuts}>
              {SHORTCUTS.map((s) => (
                <TouchableOpacity
                  key={s.label}
                  style={styles.shortcut}
                  onPress={() => router.push(s.href as never)}
                  accessibilityRole="button"
                  accessibilityLabel={t(s.label)}
                  accessibilityHint={t(s.hint)}
                >
                  <View style={styles.shortcutIcon}>
                    <Ionicons name={s.icon} size={22} color={colors.primaryOnSoft} />
                  </View>
                  <Text style={styles.shortcutLabel} numberOfLines={1}>
                    {t(s.label)}
                  </Text>
                  <Text style={styles.shortcutHint} numberOfLines={1}>
                    {t(s.hint)}
                  </Text>
                </TouchableOpacity>
              ))}
            </TourTarget>
          </View>

          {/* Latest result */}
          {resultsFailed ? (
            <Section title={t('home.results.title')} action={t('home.viewAll')} onAction={() => router.push('/patient/results')}>
              <SectionError message={t('home.results.failed')} onRetry={results.refresh} />
            </Section>
          ) : latestResult ? (
            <Section title={t('home.results.title')} action={t('home.viewAll')} onAction={() => router.push('/patient/results')}>
              <TouchableOpacity
                style={[styles.card, styles.rowCard]}
                onPress={() => router.push(`/patient/results/${latestResult._id}`)}
                accessibilityRole="button"
              >
                <View style={styles.tile}>
                  <Ionicons name="flask-outline" size={24} color={colors.primaryOnSoft} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {latestResult.request?.testType ?? t('home.results.labTest')}
                  </Text>
                  <Text style={styles.meta}>{formatDate(latestResult.resultDate ?? latestResult.orderDate ?? latestResult.createdAt)}</Text>
                </View>
                <ResultStatusPill status={latestResult.status} />
                <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </Section>
          ) : null}

          {/* Balance */}
          {balanceFailed ? (
            <Section title={t('home.balance.title')} action={t('home.balance.view')} onAction={() => router.push('/patient/invoices')}>
              <SectionError message={t('home.balance.failed')} onRetry={invoices.refresh} />
            </Section>
          ) : balance > 0 ? (
            <Section title={t('home.balance.title')} action={t('home.balance.view')} onAction={() => router.push('/patient/invoices')}>
              <TouchableOpacity style={[styles.card, styles.rowCard]} onPress={() => router.push('/patient/invoices')} accessibilityRole="button">
                <View style={styles.tile}>
                  <Ionicons name="wallet-outline" size={24} color={colors.primaryOnSoft} />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.meta}>{t('home.balance.due')}</Text>
                  <Text style={styles.balance}>{formatMoney(balance)}</Text>
                </View>
                <View style={styles.payNote}>
                  <Ionicons name="business-outline" size={14} color={colors.primaryOnSoft} />
                  <Text style={styles.payNoteText}>{t('home.balance.payAtClinic')}</Text>
                </View>
              </TouchableOpacity>
            </Section>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

/** The band's status line: the one thing worth knowing right now, most urgent first. */
function bandStatus(
  t: TFunction,
  queueEntry: QueueEntry | null,
  next: Appointment | undefined,
  nextIsToday: boolean,
  loaded: boolean
): { icon: IconName; text: string; live: boolean } | null {
  if (queueEntry?.status === 'in-progress') return { icon: 'notifications', text: t('home.queue.yourTurn'), live: true };
  if (queueEntry) return { icon: 'ticket-outline', text: t('home.band.inQueue', { number: queueEntry.queueNumber }), live: true };
  if (next) {
    const start = appointmentStart(next);
    if (nextIsToday) return { icon: 'calendar', text: t('home.band.today', { time: formatTime(start) }), live: true };
    const when = `${formatDate(start, { weekday: 'short', month: 'short', day: 'numeric' })} · ${formatTime(start)}`;
    return { icon: 'calendar-outline', text: t('home.band.next', { when }), live: false };
  }
  return loaded ? { icon: 'calendar-outline', text: t('home.band.none'), live: false } : null;
}

/**
 * Booking on a photo. With an appointment coming up it's a slim row ("Book a visit"); with none it
 * is the empty state itself, taller, with its own button, so Home never shows "no appointments"
 * and a separate booking card one above the other.
 */
function BookCard({ empty }: { empty: boolean }) {
  const t = useT();
  const book = () => router.push('/patient/appointments/book');
  if (empty) {
    return (
      <ScrimPhoto source={photos.doctorWelcome} style={styles.bookEmpty} top={0.35} bottom={0.98}>
        <View style={styles.bookInner}>
          <Text style={styles.bookTitle} accessibilityRole="header">
            {t('home.book.noneTitle')}
          </Text>
          <Text style={styles.bookText}>{t('home.book.noneText')}</Text>
          <TouchableOpacity style={styles.bookButton} onPress={book} accessibilityRole="button">
            <Ionicons name="add-circle-outline" size={20} color={colors.primaryText} />
            <Text style={styles.bookButtonText}>{t('home.book.action')}</Text>
          </TouchableOpacity>
        </View>
      </ScrimPhoto>
    );
  }
  return (
    <TouchableOpacity
      onPress={book}
      accessibilityRole="button"
      accessibilityLabel={t('home.book.title')}
      accessibilityHint={t('home.book.text')}
      activeOpacity={0.85}
    >
      <ScrimPhoto source={photos.consultation} style={styles.bookRow} top={0.55} bottom={0.95}>
        <View style={styles.bookRowInner}>
          <View style={styles.bookIcon}>
            <Ionicons name="calendar-outline" size={22} color={colors.primaryText} />
          </View>
          <View style={styles.flex}>
            <Text style={styles.bookRowTitle}>{t('home.book.title')}</Text>
            <Text style={styles.bookText} numberOfLines={2}>
              {t('home.book.text')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.primaryText} />
        </View>
      </ScrimPhoto>
    </TouchableOpacity>
  );
}

/** How each dose state looks: words and an icon, never colour alone. Amber means "act on this". */
const DOSE_LOOK: Record<DoseStatus, { icon: IconName; color: string; label: PlainKey }> = {
  taken: { icon: 'checkmark-circle', color: colors.primary, label: 'medicines.status.taken' },
  due: { icon: 'alarm', color: colors.warning, label: 'medicines.status.due' },
  missed: { icon: 'alert-circle-outline', color: colors.warning, label: 'medicines.status.missed' },
  upcoming: { icon: 'time-outline', color: colors.slate, label: 'medicines.status.upcoming' },
};

/**
 * Today's doses for the medicines with reminders on this phone: a photo strip with "2 of 4 taken",
 * then one ruled row per dose (time, medicine, status), with a tick right there for a dose that is
 * due or was missed. Nothing shows until a reminder is set on the Medicines screen.
 */
function DosesCard({
  schedule,
  owner,
  profileId,
  onChange,
}: {
  schedule: ProfileSchedule;
  owner: string;
  profileId: string;
  onChange: (s: ProfileSchedule) => void;
}) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const now = new Date();
  const doses = schedule.meds
    .filter((m) => m.end === null || m.end > now.getTime())
    .flatMap((m) => m.times.map((time) => ({ key: m.key, name: m.name, time, status: doseStatus(schedule, m.key, time, now) })))
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
  if (!doses.length) return null;
  const taken = doses.filter((d) => d.status === 'taken').length;
  const shown = doses.slice(0, MAX_DOSES);

  async function mark(key: string, time: string) {
    setBusy(`${key}@${time}`);
    setFailed(false);
    try {
      onChange(await setDoseTaken(owner, profileId, key, time, true));
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={[styles.section, styles.dosesCard]}>
      <ScrimPhoto source={photos.pillOrganizer} style={styles.dosesHead} top={0.45} bottom={0.95}>
        <View style={styles.dosesHeadInner}>
          <Text style={styles.dosesTitle} accessibilityRole="header">
            {t('home.meds.title')}
          </Text>
          <Text style={styles.dosesProgress}>{t('home.meds.progress', { taken, total: doses.length })}</Text>
        </View>
      </ScrimPhoto>
      {shown.map((d) => {
        const look = DOSE_LOOK[d.status];
        const canMark = d.status === 'due' || d.status === 'missed';
        const slot = formatSlot(d.time);
        const id = `${d.key}@${d.time}`;
        return (
          <View key={id} style={styles.doseRow}>
            <Text style={styles.doseTime}>{slot}</Text>
            <View style={styles.flex}>
              <Text style={[styles.doseName, d.status === 'taken' && styles.doseDone]} numberOfLines={2}>
                {d.name}
              </Text>
              <View style={styles.doseState}>
                <Ionicons name={look.icon} size={14} color={look.color} />
                <Text style={[styles.doseStateText, { color: look.color }]}>{t(look.label)}</Text>
              </View>
            </View>
            {canMark ? (
              <TouchableOpacity
                style={styles.markButton}
                onPress={() => mark(d.key, d.time)}
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityLabel={t('medicines.markA11y', { name: d.name, time: slot })}
              >
                {busy === id ? (
                  <ActivityIndicator size="small" color={colors.primaryOnSoft} />
                ) : (
                  <Ionicons name="checkmark" size={22} color={colors.primaryOnSoft} />
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}
      {failed ? <Text style={styles.doseError}>{t('home.meds.saveFailed')}</Text> : null}
      <TouchableOpacity style={styles.dosesFoot} onPress={() => router.push('/patient/medicines')} accessibilityRole="link">
        {doses.length > MAX_DOSES ? (
          <Text style={[styles.meta, styles.flex]}>{t('home.meds.more', { count: doses.length - MAX_DOSES })}</Text>
        ) : (
          <View style={styles.flex} />
        )}
        <Text style={styles.sectionActionText}>{t('home.meds.open')}</Text>
        <Ionicons name="chevron-forward" size={16} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

/**
 * Not activated (and the server enforces it): a prominent card to the activation screen.
 * Ending within 30 days: a renewal reminder. Otherwise nothing (More shows the end date).
 */
function ActivationCard({ activation }: { activation: EmcrAccount['activation'] }) {
  const t = useT();
  const needed = !activation.active && activation.enforced;
  const renew = activation.active && activation.daysLeft <= 30;
  if (!needed && !renew) return null;

  const until = activation.expiresAt ? formatDate(activation.expiresAt, { month: 'long', day: 'numeric', year: 'numeric' }) : null;
  const title = needed ? t('home.activation.title') : t('home.activation.renewTitle');
  const left = activation.daysLeft > 0 ? t('home.activation.daysLeft', { count: activation.daysLeft }) : '';
  const text = needed
    ? t('home.activation.needed')
    : until
      ? t('home.activation.endsOn', { date: until, left })
      : t('home.activation.endsSoon', { left });
  return (
    <TouchableOpacity
      style={[styles.card, styles.rowCard, needed ? styles.activateCard : styles.renewCard]}
      onPress={() => router.push('/patient/activate')}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${text}`}
    >
      <View style={[styles.tile, needed ? styles.activateTile : styles.renewTile]}>
        <Ionicons name={needed ? 'key-outline' : 'hourglass-outline'} size={24} color={needed ? colors.primaryText : colors.warning} />
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xl },
  flex: { flex: 1 },
  header: { paddingHorizontal: spacing.md + 4 },
  body: { paddingHorizontal: spacing.md + 4 },

  band: { minHeight: 200, borderRadius: radius.lg },
  bandInner: { flex: 1, justifyContent: 'space-between', padding: spacing.md + 4, gap: spacing.lg },
  bandDate: { fontSize: 12, fontWeight: '700', color: colors.primaryText, textTransform: 'uppercase', letterSpacing: 0.8 },
  hello: { fontSize: 15, color: colors.onNavyMuted },
  name: { fontSize: 26, fontWeight: '800', color: colors.primaryText, letterSpacing: -0.4, marginTop: 2 },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, marginTop: spacing.sm },
  statusText: { flexShrink: 1, fontSize: 14, color: colors.onNavyMuted, fontVariant: ['tabular-nums'] },
  statusLive: { color: colors.primaryText, fontWeight: '600' },

  bookEmpty: { minHeight: 236, borderRadius: radius.lg },
  bookInner: { flex: 1, justifyContent: 'flex-end', padding: spacing.md + 4 },
  bookTitle: { fontSize: 20, fontWeight: '700', color: colors.primaryText },
  bookText: { fontSize: 13, lineHeight: 18, color: colors.onNavyMuted, marginTop: 2 },
  bookButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    minHeight: 48,
    paddingHorizontal: spacing.md + 4,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
  },
  bookButtonText: { fontSize: 15, fontWeight: '700', color: colors.primaryText },
  bookRow: { minHeight: 96, borderRadius: radius.lg },
  bookRowInner: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm + 4, padding: spacing.md },
  bookIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookRowTitle: { fontSize: 16, fontWeight: '700', color: colors.primaryText },

  dosesCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  dosesHead: { minHeight: 92 },
  dosesHeadInner: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4 },
  dosesTitle: { fontSize: 17, fontWeight: '700', color: colors.primaryText },
  dosesProgress: { fontSize: 13, color: colors.onNavyMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  doseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    minHeight: 60,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  doseTime: { width: 74, fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  doseName: { fontSize: 15, fontWeight: '600', color: colors.text },
  doseDone: { color: colors.textMuted },
  doseState: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  doseStateText: { fontSize: 12, fontWeight: '600' },
  markButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doseError: { fontSize: 13, color: colors.danger, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  dosesFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  shortcutsTitle: { marginBottom: spacing.sm },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm + 4 },
  shortcut: {
    flexBasis: '46%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  shortcutIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  shortcutLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  shortcutHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

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
    borderColor: colors.border,
    ...softShadow,
  },
  centerCard: { alignItems: 'center', paddingVertical: spacing.lg },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  checkInCard: { marginTop: spacing.lg, borderColor: colors.primary },
  activateCard: { marginTop: spacing.lg, borderColor: colors.primary, borderWidth: 1.5 },
  renewCard: { marginTop: spacing.lg, borderColor: colors.warningLine, backgroundColor: colors.warningTint },
  activateTile: { backgroundColor: colors.primary },
  renewTile: { backgroundColor: colors.warningSoft },
  cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  queueCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderColor: colors.primary },
  queueIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueNumber: { fontSize: 30, fontWeight: '800', color: colors.text, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
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
  balance: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 2, fontVariant: ['tabular-nums'] },
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
