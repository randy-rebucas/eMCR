import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '@/lib/api';
import { useApiData } from '@/lib/useApiData';
import { formatDate } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import {
  COMMENTS_MAX,
  DETAIL_RATINGS,
  dismissFeedbackPrompt,
  FeedbackAnswers,
  isFeedbackPromptDismissed,
  PENDING_FEEDBACK_PATH,
  PendingFeedback,
  submitVisitFeedback,
} from '@/lib/visitFeedback';
import { Banner, Button } from '@/components/ui';
import { softShadow } from '@/components/AppHeader';

function visitLine(visit: PendingFeedback): string {
  const parts = [
    visit.providerName ? `with ${visit.providerName}` : null,
    visit.clinicName ? `at ${visit.clinicName}` : null,
    `on ${formatDate(visit.visitDate, { month: 'long', day: 'numeric' })}`,
  ];
  return parts.filter(Boolean).join(' ');
}

/**
 * Home card for the newest visit the clinic asked for feedback on. Closing it hides it for this
 * app session; tapping it opens a short form (the same questions as the SMS/email link).
 */
export function VisitFeedbackPrompt() {
  const pending = useApiData<PendingFeedback[]>(PENDING_FEEDBACK_PATH);
  const [, setHiddenCount] = useState(0);
  const [open, setOpen] = useState<PendingFeedback | null>(null);

  const visit = (pending.data ?? []).find((v) => !isFeedbackPromptDismissed(v.visitId));
  if (!visit && !open) return null;

  function hide(visitId: string) {
    dismissFeedbackPrompt(visitId);
    setHiddenCount((n) => n + 1);
  }

  return (
    <>
      {visit ? (
        <View style={[styles.card, styles.row]}>
          <TouchableOpacity
            style={[styles.row, styles.flex]}
            onPress={() => setOpen(visit)}
            accessibilityRole="button"
            accessibilityLabel={`How was your visit ${visitLine(visit)}? Rate it`}
          >
            <View style={styles.tile}>
              <Ionicons name="star-outline" size={24} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.title}>How was your visit?</Text>
              <Text style={styles.meta}>{visitLine(visit)}. Tap to rate it.</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.close}
            onPress={() => hide(visit.visitId)}
            accessibilityRole="button"
            accessibilityLabel="Not now"
            hitSlop={8}
          >
            <Ionicons name="close" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal
        visible={!!open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(null)}
      >
        {open ? (
          <FeedbackForm
            visit={open}
            onClose={(answered) => {
              if (answered) {
                hide(open.visitId);
                pending.refresh();
              }
              setOpen(null);
            }}
          />
        ) : null}
      </Modal>
    </>
  );
}

function FeedbackForm({ visit, onClose }: { visit: PendingFeedback; onClose: (answered: boolean) => void }) {
  const [answers, setAnswers] = useState<Partial<FeedbackAnswers>>({});
  const [comments, setComments] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function send() {
    if (!answers.overallRating) {
      setError('Choose how many stars to give your visit.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await submitVisitFeedback(visit.visitId, { ...answers, overallRating: answers.overallRating, comments });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, "Your feedback couldn't be sent. Please try again."));
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <SafeAreaView style={[styles.sheet, styles.thanks]}>
        <View style={styles.thanksIcon}>
          <Ionicons name="heart" size={36} color={colors.primary} />
        </View>
        <Text style={styles.sheetTitle} accessibilityRole="header">
          Thank you!
        </Text>
        <Text style={[styles.meta, styles.center]}>
          {visit.clinicName ? `${visit.clinicName} reads` : 'Your clinic reads'} every answer to make visits better.
        </Text>
        <Button title="Done" onPress={() => onClose(true)} style={styles.stretch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            How was your visit?
          </Text>
          <TouchableOpacity onPress={() => onClose(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8}>
            <Ionicons name="close" size={26} color={colors.text} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.meta}>{visitLine(visit)}</Text>

          <Text style={styles.label}>Overall</Text>
          <Stars
            label="Overall"
            size={36}
            value={answers.overallRating}
            onChange={(v) => setAnswers((a) => ({ ...a, overallRating: v }))}
          />

          <Text style={[styles.label, styles.gapTop]}>Tell us more (optional)</Text>
          {DETAIL_RATINGS.map((r) => (
            <View key={r.key} style={styles.detailRow}>
              <Text style={styles.detailLabel}>{r.label}</Text>
              <Stars
                label={r.label}
                size={24}
                value={answers[r.key]}
                onChange={(v) => setAnswers((a) => ({ ...a, [r.key]: a[r.key] === v ? undefined : v }))}
              />
            </View>
          ))}

          <Text style={[styles.label, styles.gapTop]}>Would you recommend this clinic?</Text>
          <View style={styles.choices}>
            {[
              { label: 'Yes', value: true },
              { label: 'No', value: false },
            ].map((c) => {
              const selected = answers.wouldRecommend === c.value;
              return (
                <TouchableOpacity
                  key={c.label}
                  style={[styles.choice, selected && styles.choiceSelected]}
                  onPress={() => setAnswers((a) => ({ ...a, wouldRecommend: selected ? undefined : c.value }))}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, styles.gapTop]}>Comments (optional)</Text>
          <TextInput
            style={styles.input}
            value={comments}
            onChangeText={setComments}
            placeholder="What went well, or what could be better?"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={COMMENTS_MAX}
            textAlignVertical="top"
            accessibilityLabel="Comments"
          />

          {error ? <Banner message={error} /> : null}
          <Button title="Send feedback" onPress={send} loading={sending} style={styles.gapTop} />
          <Text style={[styles.meta, styles.center, styles.gapTop]}>Your answers go to the clinic only.</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Stars({
  label,
  value,
  onChange,
  size,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
  size: number;
}) {
  return (
    <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel={`${label} rating`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = !!value && n <= value;
        return (
          <TouchableOpacity
            key={n}
            onPress={() => onChange(n)}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === n }}
            accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
            style={styles.star}
          >
            <Ionicons name={on ? 'star' : 'star-outline'} size={size} color={on ? '#E0A400' : colors.border} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: '#F1D9A6',
    marginBottom: spacing.lg,
    ...softShadow,
  },
  tile: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', marginRight: -spacing.sm },
  sheet: { flex: 1, backgroundColor: colors.background },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md + 4,
    paddingTop: spacing.md,
  },
  sheetTitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  sheetBody: { padding: spacing.md + 4, paddingBottom: spacing.xl },
  label: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: spacing.md, marginBottom: spacing.xs },
  gapTop: { marginTop: spacing.lg },
  stars: { flexDirection: 'row', gap: 2 },
  star: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  detailLabel: { fontSize: 14, color: colors.text },
  choices: { flexDirection: 'row', gap: spacing.sm },
  choice: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceText: { fontSize: 15, color: colors.text, fontWeight: '600' },
  choiceTextSelected: { color: colors.primaryOnSoft },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.sm + 4,
    fontSize: 15,
    color: colors.text,
    marginBottom: spacing.md,
  },
  thanks: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.sm },
  thanksIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch', marginTop: spacing.lg },
});
