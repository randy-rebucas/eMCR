import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest, ApiError, errorMessage } from '@/lib/api';
import { emitRefresh } from '@/lib/events';
import { useApiData } from '@/lib/useApiData';
import { Appointment, BookingDoctor, BookingOptions } from '@/lib/types';
import { clinicEpoch, clinicTodayYmd, doctorName, formatTime, toYmd } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, IconName } from './ui';
import { softShadow } from './AppHeader';

/** Matches the server's booking horizon; older servers without `bookableDates` get 30 days. */
const HORIZON_DAYS = 60;
const LEGACY_HORIZON_DAYS = 30;
const ALL = '__all__';

function specialtyIcon(name: string): IconName {
  const n = name.toLowerCase();
  if (n === ALL) return 'apps-outline';
  if (/pedia|child/.test(n)) return 'happy-outline';
  if (/dent|oral/.test(n)) return 'medical-outline';
  if (/derma|skin/.test(n)) return 'color-palette-outline';
  if (/lab|patho/.test(n)) return 'flask-outline';
  if (/cardio|heart/.test(n)) return 'heart-outline';
  if (/ob|gyn|matern/.test(n)) return 'female-outline';
  if (/eye|ophth/.test(n)) return 'eye-outline';
  if (/ortho|bone/.test(n)) return 'body-outline';
  if (/surg/.test(n)) return 'cut-outline';
  return 'medkit-outline';
}

function startOfWeek(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function fromYmd(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function longDate(key: string): string {
  return fromYmd(key).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

/** Minutes since midnight right now on the clinic's clock (not the phone's). */
function clinicMinutesNow(): number {
  return Math.floor((Date.now() - clinicEpoch(clinicTodayYmd())) / 60_000);
}

/**
 * The clinic's current date as YYYY-MM-DD, kept fresh across midnight while the
 * form stays mounted (checked each minute and whenever the app returns to the foreground).
 */
function useClinicToday(): string {
  const [today, setToday] = useState(clinicTodayYmd);
  useEffect(() => {
    const check = () => setToday((prev) => {
      const now = clinicTodayYmd();
      return now === prev ? prev : now;
    });
    const timer = setInterval(check, 60_000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return today;
}

const PERIODS: { label: string; icon: IconName; test: (minutes: number) => boolean }[] = [
  { label: 'Morning', icon: 'partly-sunny-outline', test: (m) => m < 12 * 60 },
  { label: 'Afternoon', icon: 'sunny-outline', test: (m) => m >= 12 * 60 && m < 17 * 60 },
  { label: 'Evening', icon: 'moon-outline', test: (m) => m >= 17 * 60 },
];

/**
 * Specialty → doctor → date → time → reason → review. The clinic confirms
 * requests; `onBooked` receives the created appointment.
 */
export interface BookedSummary {
  appointment: Appointment | null;
  doctor: string | null;
  /** "yyyy-MM-dd" as chosen (the stored date is clinic-midnight UTC, so it isn't re-read). */
  date: string;
  time: string;
  /** Booked as a video visit. */
  video?: boolean;
}

export function BookingForm({
  onBooked,
  tenantId,
}: {
  onBooked: (booked: BookedSummary) => void;
  /** Clinic to book at (a `tenantId` from `/me/clinics`); the patient's first clinic when omitted. */
  tenantId?: string;
}) {
  const clinicParam = tenantId ? `tenantId=${encodeURIComponent(tenantId)}` : '';
  const doctorsQuery = useApiData<BookingOptions>(`/api/patients/appointments${clinicParam ? `?${clinicParam}` : ''}`);
  // Calendar days are plain y/m/d values; "today" is the clinic's date, not the phone's.
  const todayKey = useClinicToday();
  const today = useMemo(() => fromYmd(todayKey), [todayKey]);

  const [specialty, setSpecialty] = useState(ALL);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[] | null>(null);
  const [dayOff, setDayOff] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotsVersion, setSlotsVersion] = useState(0);
  const [time, setTime] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [video, setVideo] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards a second tap before `submitting` re-renders.
  const inFlight = useRef(false);

  useEffect(() => {
    setTime(null);
    setSlots(null);
    setDayOff(false);
    setSlotsError(null);
    if (!doctorId || !date) return;
    let cancelled = false;
    setSlotsLoading(true);
    apiRequest<BookingOptions>(
      `/api/patients/appointments?date=${encodeURIComponent(date)}&doctorId=${encodeURIComponent(doctorId)}${clinicParam ? `&${clinicParam}` : ''}`
    )
      .then((result) => {
        if (cancelled) return;
        let available = result.availableSlots ?? [];
        // Newer servers drop today's past slots in clinic time; this covers older ones.
        if (date === clinicTodayYmd()) {
          const minutesNow = clinicMinutesNow();
          available = available.filter((slot) => {
            const [h, m] = slot.split(':').map(Number);
            return h * 60 + m > minutesNow;
          });
        }
        setDayOff(!!result.dayOff);
        setSlots(available);
      })
      .catch((err) => {
        if (!cancelled) setSlotsError(errorMessage(err, "Couldn't load available times."));
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doctorId, date, slotsVersion, clinicParam]);

  const doctors: BookingDoctor[] = doctorsQuery.data?.doctors ?? [];
  const videoOffered = doctorsQuery.data?.teleconsultAvailable === true;
  const wantsVideo = videoOffered && video;
  const specialties = useMemo(
    () => [...new Set(doctors.map((d) => d.specialization).filter((s): s is string => !!s))].sort(),
    [doctors]
  );
  const visibleDoctors = specialty === ALL ? doctors : doctors.filter((d) => d.specialization === specialty);
  const doctor = doctors.find((d) => d._id === doctorId) ?? null;
  const bookable = useMemo(() => (doctor?.bookableDates ? new Set(doctor.bookableDates) : null), [doctor]);
  const lastDay = addDays(today, (doctor?.bookableDates ? HORIZON_DAYS : LEGACY_HORIZON_DAYS) - 1);

  const grouped = useMemo(
    () =>
      PERIODS.map((p) => ({
        ...p,
        slots: (slots ?? []).filter((s) => {
          const [h, m] = s.split(':').map(Number);
          return p.test(h * 60 + m);
        }),
      })).filter((g) => g.slots.length > 0),
    [slots]
  );

  if (doctorsQuery.loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (doctorsQuery.error && !doctorsQuery.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{doctorsQuery.error}</Text>
        <TouchableOpacity onPress={doctorsQuery.refresh} style={styles.retry} accessibilityRole="button">
          <Text style={styles.link}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (doctors.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>No doctors are taking online bookings at your clinic right now. Please call the clinic.</Text>
      </View>
    );
  }

  const showSpecialties = specialties.length > 1;
  let step = 0;
  const nextStep = () => ++step;

  function isBookable(d: Date): boolean {
    if (d < today || d > lastDay) return false;
    return bookable ? bookable.has(toYmd(d)) : true;
  }

  function chooseSpecialty(value: string) {
    setSpecialty(value);
    const stillVisible = value === ALL || doctors.some((d) => d._id === doctorId && d.specialization === value);
    if (!stillVisible) {
      setDoctorId(null);
      setDate(null);
    }
  }

  function chooseDoctor(next: BookingDoctor) {
    const id = next._id ?? null;
    setDoctorId(id);
    setError(null);
    // Keep the chosen day if the new doctor works it; otherwise jump to their next working day.
    const dates = next.bookableDates;
    if (!dates) return;
    if (date && dates.includes(date)) return;
    const first = dates[0] ?? null;
    setDate(first);
    if (first) setWeekStart(startOfWeek(fromYmd(first)));
  }

  async function submit() {
    if (inFlight.current) return;
    if (!doctorId || !date || !time) {
      setError('Choose a doctor, a date and a time.');
      return;
    }
    inFlight.current = true;
    setError(null);
    setSubmitting(true);
    try {
      const created = await apiRequest<Appointment>('/api/patients/appointments', {
        method: 'POST',
        body: {
          doctorId,
          appointmentDate: date,
          appointmentTime: time,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(wantsVideo ? { modality: 'teleconsult' } : {}),
        },
      });
      emitRefresh('appointments', 'notifications');
      onBooked({ appointment: created ?? null, doctor: doctorName(doctor), date, time, video: wantsVideo });
    } catch (err) {
      setError(errorMessage(err, "Couldn't book the appointment. Please try again."));
      if (err instanceof ApiError && (err.status === 409 || err.status === 400)) setSlotsVersion((v) => v + 1);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const canPrev = weekStart > startOfWeek(today);
  const canNext = addDays(weekStart, 7) <= lastDay;
  const monthLabel = week[3].toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const noDates = !!doctor && bookable !== null && bookable.size === 0;

  return (
    <View style={styles.panel}>
      {showSpecialties ? (
        <Step n={nextStep()} title="Select a Specialty" done={specialty !== ALL}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
            {[ALL, ...specialties].map((s) => {
              const selected = s === specialty;
              return (
                <TouchableOpacity
                  key={s}
                  style={[styles.specialty, selected && styles.selected]}
                  onPress={() => chooseSpecialty(s)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Ionicons name={specialtyIcon(s)} size={26} color={colors.primary} />
                  <Text style={styles.specialtyText} numberOfLines={2}>
                    {s === ALL ? 'All Doctors' : s}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Step>
      ) : null}

      <Step n={nextStep()} title="Choose a Doctor" done={!!doctor}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hList}>
          {visibleDoctors.map((d) => {
            const id = d._id ?? '';
            const selected = id === doctorId;
            const unavailable = d.bookableDates !== undefined && d.bookableDates.length === 0;
            return (
              <TouchableOpacity
                key={id}
                style={[styles.doctor, selected && styles.selected, unavailable && styles.doctorUnavailable]}
                onPress={() => chooseDoctor(d)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${doctorName(d)}${d.specialization ? `, ${d.specialization}` : ''}${d.hoursSummary ? `, ${d.hoursSummary}` : ''}`}
              >
                <View style={styles.doctorTop}>
                  <View style={styles.doctorAvatar}>
                    <Text style={styles.doctorInitials}>
                      {`${d.firstName?.[0] ?? ''}${d.lastName?.[0] ?? ''}`.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.doctorName} numberOfLines={2}>
                      {doctorName(d)}
                    </Text>
                    {d.specialization ? (
                      <Text style={styles.doctorSpec} numberOfLines={1}>
                        {d.specialization}
                      </Text>
                    ) : null}
                  </View>
                </View>
                {d.hoursSummary || unavailable ? (
                  <View style={styles.doctorHours}>
                    <Ionicons name="time-outline" size={13} color={colors.textMuted} />
                    <Text style={styles.doctorHoursText} numberOfLines={2}>
                      {unavailable ? 'No openings in the next 2 months' : d.hoursSummary}
                    </Text>
                  </View>
                ) : null}
                <Ionicons
                  name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={selected ? colors.primary : colors.border}
                  style={styles.radio}
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Step>

      <Step n={nextStep()} title="Select Date" done={!!date} locked={!doctor} lockedHint="Choose a doctor first.">
        {noDates ? (
          <Text style={styles.muted}>
            {doctorName(doctor)} has no openings in the next two months. Choose another doctor or call the clinic.
          </Text>
        ) : (
          <View style={styles.calendar}>
            <View style={styles.calHeader}>
              <TouchableOpacity
                onPress={() => setWeekStart(addDays(weekStart, -7))}
                disabled={!canPrev}
                style={styles.calNav}
                accessibilityRole="button"
                accessibilityLabel="Previous week"
              >
                <Ionicons name="chevron-back" size={20} color={canPrev ? colors.text : colors.border} />
              </TouchableOpacity>
              <Text style={styles.calMonth}>{monthLabel}</Text>
              <TouchableOpacity
                onPress={() => setWeekStart(addDays(weekStart, 7))}
                disabled={!canNext}
                style={styles.calNav}
                accessibilityRole="button"
                accessibilityLabel="Next week"
              >
                <Ionicons name="chevron-forward" size={20} color={canNext ? colors.text : colors.border} />
              </TouchableOpacity>
            </View>
            <View style={styles.week}>
              {week.map((d) => {
                const value = toYmd(d);
                const disabled = !isBookable(d);
                const selected = value === date;
                const isToday = value === toYmd(today);
                return (
                  <TouchableOpacity
                    key={value}
                    style={styles.dayCol}
                    onPress={() => setDate(value)}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityState={{ selected, disabled }}
                    accessibilityLabel={`${longDate(value)}${disabled ? ', unavailable' : ''}`}
                  >
                    <Text style={[styles.weekday, isToday && styles.weekdayToday]} maxFontSizeMultiplier={1.4}>
                      {isToday ? 'Today' : d.toLocaleDateString(undefined, { weekday: 'short' })}
                    </Text>
                    <View style={[styles.dayCell, selected && styles.dayCellSelected, disabled && styles.dayCellDisabled]}>
                      <Text
                        style={[styles.dayNum, selected && styles.dayNumSelected, disabled && styles.dayNumDisabled]}
                        maxFontSizeMultiplier={1.5}
                      >
                        {d.getDate()}
                      </Text>
                    </View>
                    <View style={[styles.availDot, (disabled || selected) && styles.availDotHidden]} />
                  </TouchableOpacity>
                );
              })}
            </View>
            {bookable ? (
              <Text style={styles.legend}>Greyed-out days: the doctor isn't seeing patients.</Text>
            ) : null}
          </View>
        )}
      </Step>

      <Step
        n={nextStep()}
        title="Select Time"
        done={!!time}
        locked={!doctor || !date}
        lockedHint="Choose a doctor and a date to see open times."
        aside={slots && slots.length > 0 ? `${slots.length} open` : undefined}
      >
        {slotsLoading ? (
          <ActivityIndicator color={colors.primary} style={styles.slotsLoading} />
        ) : slotsError ? (
          <TouchableOpacity onPress={() => setSlotsVersion((v) => v + 1)} accessibilityRole="button">
            <Text style={styles.error}>{slotsError} Tap to retry.</Text>
          </TouchableOpacity>
        ) : grouped.length > 0 ? (
          grouped.map((g) => (
            <View key={g.label} style={styles.period}>
              <View style={styles.periodHeader}>
                <Ionicons name={g.icon} size={15} color={colors.textMuted} />
                <Text style={styles.periodLabel}>{g.label}</Text>
              </View>
              <View style={styles.slots}>
                {g.slots.map((slot) => {
                  const selected = slot === time;
                  return (
                    <TouchableOpacity
                      key={slot}
                      style={[styles.slot, selected && styles.slotSelected]}
                      onPress={() => setTime(slot)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.slotText, selected && styles.slotTextSelected]}>{formatTime(slot)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))
        ) : slots ? (
          <Text style={styles.muted}>
            {dayOff
              ? `${doctorName(doctor) ?? 'The doctor'} isn't seeing patients this day. Try another date.`
              : 'This day is fully booked. Try another date.'}
          </Text>
        ) : null}
      </Step>

      {videoOffered ? (
        <Step n={nextStep()} title="Visit Type" done>
          <View style={styles.modes}>
            {[
              { value: false, icon: 'business-outline' as IconName, title: 'At the clinic', hint: 'See the doctor in person' },
              { value: true, icon: 'videocam-outline' as IconName, title: 'Video call', hint: 'From your phone, with camera and mic' },
            ].map((m) => {
              const selected = video === m.value;
              return (
                <TouchableOpacity
                  key={m.title}
                  style={[styles.mode, selected && styles.selected]}
                  onPress={() => setVideo(m.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${m.title}. ${m.hint}`}
                >
                  <Ionicons name={m.icon} size={24} color={colors.primary} />
                  <Text style={styles.modeTitle}>{m.title}</Text>
                  <Text style={styles.modeHint}>{m.hint}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Step>
      ) : null}

      <Step n={nextStep()} title="Reason for Visit" optional>
        <TextInput
          style={styles.reason}
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={500}
          placeholder="e.g. Follow-up check-up, cough for 3 days"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Reason for visit"
        />
        <Text style={styles.counter}>{reason.length}/500</Text>
      </Step>

      {doctor && date && time ? (
        <View style={styles.review} accessible accessibilityLabel={`Review: ${doctorName(doctor)}, ${longDate(date)} at ${formatTime(time)}`}>
          <Text style={styles.reviewTitle}>Review your request</Text>
          <ReviewRow icon="person-outline" text={`${doctorName(doctor)}${doctor.specialization ? ` · ${doctor.specialization}` : ''}`} />
          <ReviewRow icon="calendar-outline" text={longDate(date)} />
          <ReviewRow icon="time-outline" text={formatTime(time)} />
          {wantsVideo ? <ReviewRow icon="videocam-outline" text="Video call — join from this app" /> : null}
          {reason.trim() ? <ReviewRow icon="chatbox-ellipses-outline" text={reason.trim()} /> : null}
        </View>
      ) : null}

      {error ? <Banner message={error} /> : null}

      <Button
        title="Confirm Appointment"
        icon="calendar-outline"
        onPress={submit}
        loading={submitting}
        disabled={!doctorId || !date || !time}
      />
      <Text style={styles.note}>The clinic confirms each request. You'll get a notification once it's confirmed.</Text>
    </View>
  );
}

/** Shown in place of the form once a request is sent. */
export function BookingSuccess({
  booked,
  onView,
  onBookAnother,
}: {
  booked: BookedSummary;
  onView: () => void;
  onBookAnother: () => void;
}) {
  const { appointment } = booked;
  return (
    <View style={[styles.panel, styles.success]}>
      <View style={styles.successIcon}>
        <Ionicons name="checkmark" size={40} color={colors.primaryText} />
      </View>
      <Text style={styles.successTitle}>Request Sent!</Text>
      <Text style={styles.successText}>
        The clinic will review your request and confirm it. We'll notify you as soon as it's confirmed.
      </Text>
      <View style={[styles.review, styles.successReview]}>
        {booked.doctor ? <ReviewRow icon="person-outline" text={booked.doctor} /> : null}
        <ReviewRow icon="calendar-outline" text={longDate(booked.date)} />
        <ReviewRow icon="time-outline" text={formatTime(booked.time)} />
        {booked.video ? <ReviewRow icon="videocam-outline" text="Video call — the Join button appears 15 minutes before" /> : null}
        {appointment?.appointmentCode ? <ReviewRow icon="pricetag-outline" text={`Ref ${appointment.appointmentCode}`} /> : null}
      </View>
      {appointment?._id ? <Button title="View Appointment" onPress={onView} style={styles.stretch} /> : null}
      <Button title="Book Another" variant="secondary" onPress={onBookAnother} style={styles.stretch} />
    </View>
  );
}

function ReviewRow({ icon, text }: { icon: IconName; text: string }) {
  return (
    <View style={styles.reviewRow}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.reviewText}>{text}</Text>
    </View>
  );
}

function Step({
  n,
  title,
  optional,
  done,
  locked,
  lockedHint,
  aside,
  children,
}: {
  n: number;
  title: string;
  optional?: boolean;
  done?: boolean;
  locked?: boolean;
  lockedHint?: string;
  aside?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.step}>
      <View style={styles.stepHeader}>
        <View style={[styles.stepNum, locked && styles.stepNumLocked]}>
          {done && !locked ? (
            <Ionicons name="checkmark" size={15} color={colors.primaryText} />
          ) : (
            <Text style={styles.stepNumText} maxFontSizeMultiplier={1.5}>
              {n}
            </Text>
          )}
        </View>
        <Text style={[styles.stepTitle, locked && styles.stepTitleLocked]} accessibilityRole="header">
          {title}
        </Text>
        {optional ? <Text style={styles.aside}>Optional</Text> : aside ? <Text style={styles.asideStrong}>{aside}</Text> : null}
      </View>
      {locked ? <Text style={styles.lockedHint}>{lockedHint}</Text> : children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stretch: { alignSelf: 'stretch' },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    ...softShadow,
  },
  center: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  retry: { marginTop: spacing.xs, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  link: { color: colors.primary, fontWeight: '600', fontSize: 14 },
  muted: { fontSize: 14, lineHeight: 20, color: colors.textMuted },
  error: { color: colors.danger, fontSize: 14 },
  step: { marginBottom: spacing.lg },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, marginBottom: spacing.sm + 4 },
  // min (not fixed) sizes so the number isn't clipped at large text sizes.
  stepNum: {
    minWidth: 26,
    minHeight: 26,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumLocked: { backgroundColor: '#B8C3CC' },
  stepNumText: { color: colors.primaryText, fontSize: 13, fontWeight: '700' },
  stepTitle: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  stepTitleLocked: { color: colors.textMuted },
  aside: { fontSize: 12, color: colors.textMuted },
  asideStrong: { fontSize: 12, fontWeight: '700', color: colors.primary },
  lockedHint: { fontSize: 14, color: colors.textMuted, marginLeft: 36 },
  hList: { gap: spacing.sm + 2, paddingRight: spacing.xs },
  selected: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.primarySoft },
  specialty: {
    width: 96,
    minHeight: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E3ECEE',
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    gap: spacing.sm,
  },
  specialtyText: { fontSize: 12, fontWeight: '500', color: colors.text, textAlign: 'center' },
  doctor: {
    width: 220,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E3ECEE',
    backgroundColor: colors.surface,
    padding: spacing.sm + 4,
  },
  doctorUnavailable: { opacity: 0.6 },
  doctorTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, paddingRight: spacing.lg },
  doctorAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  doctorInitials: { fontSize: 16, fontWeight: '700', color: colors.primaryOnSoft },
  doctorName: { fontSize: 14, fontWeight: '600', color: colors.text },
  doctorSpec: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  doctorHours: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: spacing.sm },
  doctorHoursText: { flex: 1, fontSize: 12, color: colors.textMuted },
  radio: { position: 'absolute', top: 8, right: 8 },
  calendar: { borderWidth: 1, borderColor: '#E3ECEE', borderRadius: radius.md, padding: spacing.sm + 4 },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  calNav: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  calMonth: { fontSize: 15, fontWeight: '600', color: colors.text },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', flex: 1 },
  weekday: { fontSize: 11, color: colors.textMuted, marginBottom: 6 },
  weekdayToday: { color: colors.primary, fontWeight: '700' },
  dayCell: {
    minWidth: 40,
    minHeight: 42,
    paddingHorizontal: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#E3ECEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayCellDisabled: { borderColor: 'transparent', backgroundColor: '#F2F5F7' },
  dayNum: { fontSize: 15, fontWeight: '600', color: colors.text },
  dayNumSelected: { color: colors.primaryText },
  dayNumDisabled: { color: '#B8C3CC', fontWeight: '400' },
  availDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent, marginTop: 5 },
  availDotHidden: { backgroundColor: 'transparent' },
  legend: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  slotsLoading: { marginVertical: spacing.md },
  period: { marginBottom: spacing.sm + 2 },
  periodHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  periodLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    width: '31.5%',
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: '#E3ECEE',
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotText: { fontSize: 14, color: colors.text, fontWeight: '500' },
  slotTextSelected: { color: colors.primaryText, fontWeight: '600' },
  reason: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: '#E3ECEE',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm + 4,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
  counter: { fontSize: 11, color: colors.textMuted, textAlign: 'right', marginTop: 4 },
  modes: { flexDirection: 'row', gap: spacing.sm + 2 },
  mode: {
    flex: 1,
    minHeight: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E3ECEE',
    backgroundColor: colors.surfaceMuted,
    padding: spacing.sm + 4,
    gap: 4,
  },
  modeTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  modeHint: { fontSize: 12, color: colors.textMuted },
  review: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.sm + 6,
    gap: 8,
    marginBottom: spacing.md,
  },
  reviewTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 2 },
  reviewRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  reviewText: { flex: 1, fontSize: 14, color: colors.text },
  note: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm + 4 },
  success: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  successText: { fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.sm },
  successReview: { alignSelf: 'stretch', marginBottom: spacing.sm },
});
