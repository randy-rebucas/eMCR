import { StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Medication, Prescription } from '@/lib/types';
import { courseDay, courseRange, frequencyLabel } from '@/lib/prescriptions';
import { clinicTodayYmd } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { useT } from '@/lib/i18n';

type McIcon = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * The medicine's form as an icon. One tile colour for all of them: the shape tells the form, and
 * red stays reserved for destructive actions (injections and capsules used to be red).
 */
function formIcon(form: string | undefined): McIcon {
  const f = (form ?? '').toLowerCase();
  if (/syrup|suspension|solution|liquid/.test(f)) return 'bottle-tonic-outline';
  if (/inject|vial|ampul/.test(f)) return 'needle';
  if (/drop/.test(f)) return 'eyedropper';
  if (/cream|ointment|gel|lotion|topical/.test(f)) return 'lotion-outline';
  if (/inhal|nebul/.test(f)) return 'weather-windy';
  return 'pill';
}

/**
 * One medicine: name + strength, how to take it, and its course. While a course runs it shows
 * "Day 3 of 7" with a meter, which is what a patient checks mid-course. `compact` is the row
 * inside a ruled card on the prescriptions list; otherwise a full card (prescription detail).
 */
export function MedicationCard({
  prescription,
  med,
  compact = false,
  first = true,
}: {
  prescription: Prescription;
  med: Medication;
  compact?: boolean;
  /** Compact rows draw a hairline above all but the first. */
  first?: boolean;
}) {
  const t = useT();
  const title = [med.name, med.strength].filter(Boolean).join(' ');
  const dosage = [med.dose, frequencyLabel(med.frequency)].filter(Boolean).join(' · ');
  const range = courseRange(prescription, med);
  const progress = courseDay(prescription, med, clinicTodayYmd());
  const sub = [med.genericName && med.genericName !== med.name ? med.genericName : null, med.form, med.route]
    .filter(Boolean)
    .join(' · ');
  const length = med.durationDays
    ? t('prescriptions.days', { count: med.durationDays })
    : med.quantity
      ? t('prescriptions.qty', { quantity: String(med.quantity) })
      : null;

  return (
    <View
      style={compact ? [styles.row, !first && styles.dividerTop] : styles.card}
      accessible
      accessibilityLabel={[
        title,
        sub,
        dosage,
        progress ? t('prescriptions.courseDay', { day: progress.day, total: progress.total }) : length,
        range,
        med.instructions,
      ]
        .filter(Boolean)
        .join('. ')}
    >
      <View style={styles.top}>
        <View style={[styles.tile, compact && styles.tileCompact]}>
          <MaterialCommunityIcons name={formIcon(med.form)} size={compact ? 22 : 28} color={colors.primaryOnSoft} />
        </View>
        <View style={styles.flex}>
          <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
          {sub ? <Text style={styles.sub}>{sub}</Text> : null}
          {dosage ? <Text style={styles.dosage}>{dosage}</Text> : null}
        </View>
      </View>

      {progress ? (
        <View style={styles.course}>
          <View style={styles.courseTop}>
            <Text style={styles.courseDay}>{t('prescriptions.courseDay', { day: progress.day, total: progress.total })}</Text>
            {range ? <Text style={styles.courseRange}>{range}</Text> : null}
          </View>
          <View style={styles.meter}>
            <View style={[styles.meterFill, { width: `${(progress.day / progress.total) * 100}%` }]} />
          </View>
        </View>
      ) : length || range ? (
        <Text style={styles.courseRange}>{[length, range].filter(Boolean).join(' · ')}</Text>
      ) : null}

      {med.instructions ? (
        <View style={styles.instructions}>
          <Ionicons name="information-circle-outline" size={16} color={colors.slate} />
          <Text style={styles.instructionsText}>{med.instructions}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm + 2,
    gap: spacing.sm + 2,
  },
  row: { paddingVertical: spacing.sm + 4, gap: spacing.sm },
  dividerTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 4 },
  tile: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileCompact: { width: 40, height: 40 },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  titleCompact: { fontSize: 15 },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  dosage: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: spacing.xs },
  course: { gap: spacing.xs + 2 },
  courseTop: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  courseDay: { fontSize: 13, fontWeight: '700', color: colors.primaryOnSoft, fontVariant: ['tabular-nums'] },
  courseRange: { fontSize: 12, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  meter: { height: 6, borderRadius: 3, backgroundColor: colors.slateSoft, overflow: 'hidden' },
  meterFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  instructions: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  instructionsText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.slate },
});
