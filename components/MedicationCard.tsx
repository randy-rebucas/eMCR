import { StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Medication, Prescription } from '@/lib/types';
import { courseRange, frequencyLabel } from '@/lib/prescriptions';
import { colors, radius, spacing } from '@/lib/theme';
import { StatusBadge } from './StatusBadge';

type McIcon = keyof typeof MaterialCommunityIcons.glyphMap;

function formIcon(form: string | undefined): { icon: McIcon; bg: string; fg: string } {
  const f = (form ?? '').toLowerCase();
  if (/syrup|suspension|solution|liquid/.test(f)) return { icon: 'bottle-tonic-outline', bg: '#FDF1DC', fg: '#A15C00' };
  if (/inject|vial|ampul/.test(f)) return { icon: 'needle', bg: '#FDE8E8', fg: '#B3261E' };
  if (/drop/.test(f)) return { icon: 'eyedropper', bg: '#E6EEFB', fg: '#2F5FB3' };
  if (/cream|ointment|gel|lotion|topical/.test(f)) return { icon: 'lotion-outline', bg: '#EEEAFB', fg: '#5B47B0' };
  if (/inhal|nebul/.test(f)) return { icon: 'weather-windy', bg: '#E6EEFB', fg: '#2F5FB3' };
  if (/capsule/.test(f)) return { icon: 'pill', bg: '#FDE8E8', fg: '#B3261E' };
  return { icon: 'pill', bg: colors.primarySoft, fg: colors.primary };
}

/** One medication: name + strength, dosage and course boxes, and instructions. */
export function MedicationCard({
  prescription,
  med,
  showStatus = true,
}: {
  prescription: Prescription;
  med: Medication;
  showStatus?: boolean;
}) {
  const look = formIcon(med.form);
  const title = [med.name, med.strength].filter(Boolean).join(' ');
  const dosage = [med.dose, frequencyLabel(med.frequency)].filter(Boolean).join(' · ');
  const range = courseRange(prescription, med);
  const sub = [med.genericName && med.genericName !== med.name ? med.genericName : null, med.form, med.route]
    .filter(Boolean)
    .join(' · ');

  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <View style={[styles.tile, { backgroundColor: look.bg }]}>
          <MaterialCommunityIcons name={look.icon} size={30} color={look.fg} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.title}>{title}</Text>
          {sub ? <Text style={styles.sub}>{sub}</Text> : null}
        </View>
        {showStatus ? <StatusBadge status={prescription.status} /> : null}
      </View>

      {dosage || med.durationDays || med.quantity ? (
        <View style={styles.facts}>
          <View style={styles.fact}>
            <Ionicons name="medical-outline" size={18} color={colors.primary} />
            <View style={styles.flex}>
              <Text style={styles.factLabel}>Dosage</Text>
              <Text style={styles.factValue}>{dosage || '—'}</Text>
            </View>
          </View>
          <View style={styles.fact}>
            <Ionicons name="calendar-outline" size={18} color={colors.primary} />
            <View style={styles.flex}>
              <Text style={styles.factLabel}>{med.durationDays ? 'Duration' : 'Quantity'}</Text>
              <Text style={styles.factValue}>
                {med.durationDays ? `${med.durationDays} day${med.durationDays === 1 ? '' : 's'}` : med.quantity ?? '—'}
              </Text>
              {range ? <Text style={styles.factSub}>{range}</Text> : null}
            </View>
          </View>
        </View>
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
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.sm + 6,
    marginBottom: spacing.sm + 2,
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  tile: { width: 56, height: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  facts: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginTop: spacing.sm + 4,
  },
  fact: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  factLabel: { fontSize: 12, color: colors.textMuted },
  factValue: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 2 },
  factSub: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  instructions: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: spacing.sm + 2 },
  instructionsText: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.slate },
});
