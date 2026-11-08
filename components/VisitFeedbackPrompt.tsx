import { useRef, useState } from 'react';
import {
  Alert,
  Modal,
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
import { Banner, Button, KeyboardAvoider } from '@/components/ui';
import { softShadow } from '@/components/AppHeader';
import { t as translate, useT } from '@/lib/i18n';

function visitLine(visit: PendingFeedback): string {
  const parts = [
    visit.providerName ? translate('patient.feedback.with', { name: visit.providerName }) : null,
    visit.clinicName ? translate('patient.feedback.at', { clinic: visit.clinicName }) : null,
    translate('patient.feedback.on', { date: formatDate(visit.visitDate, { month: 'long', day: 'numeric' }) }),
  ];
  return parts.filter(Boolean).join(' ');
}

/**
 * Home card for the newest visit the clinic asked for feedback on. Closing it hides it for this
 * app session; tapping it opens a short form (the same questions as the SMS/email link).
 */
export function VisitFeedbackPrompt() {
  const t = useT();
  const pending = useApiData<PendingFeedback[]>(PENDING_FEEDBACK_PATH);
  const [, setHiddenCount] = useState(0);
  const [open, setOpen] = useState<PendingFeedback | null>(null);
  // The form's own close logic (busy / sent / unsaved checks), so Android Back goes through it too.
  const requestClose = useRef<(() => void) | null>(null);

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
            accessibilityLabel={t('patient.feedback.cardA11y', { visit: visitLine(visit) })}
          >
            <View style={styles.tile}>
              <Ionicons name="star-outline" size={24} color={colors.primary} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.title}>{t('patient.feedback.title')}</Text>
              <Text style={styles.meta}>{t('patient.feedback.tapToRate', { visit: visitLine(visit) })}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.close}
            onPress={() => hide(visit.visitId)}
            accessibilityRole="button"
            accessibilityLabel={t('patient.feedback.notNow')}
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
        onRequestClose={() => (requestClose.current ? requestClose.current() : setOpen(null))}
      >
        {open ? (
          <FeedbackForm
            visit={open}
            requestCloseRef={requestClose}
            // Hide the card the moment the server accepts it, however the sheet is closed after.
            onSent={() => hide(open.visitId)}
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

function FeedbackForm({
  visit,
  onClose,
  onSent,
  requestCloseRef,
}: {
  visit: PendingFeedback;
  onClose: (answered: boolean) => void;
  onSent: () => void;
  requestCloseRef: { current: (() => void) | null };
}) {
  const t = useT();
  const [answers, setAnswers] = useState<Partial<FeedbackAnswers>>({});
  const [comments, setComments] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const sendingRef = useRef(false);

  const dirty = Object.values(answers).some((v) => v !== undefined) || comments.trim() !== '';

  /** Close button and Android Back: ignored while sending; asks before dropping a filled-in form. */
  function requestClose() {
    if (sendingRef.current) return;
    if (done) return onClose(true);
    if (!dirty) return onClose(false);
    Alert.alert(t('common.discard.title'), t('common.discard.body'), [
      { text: t('common.discard.keep'), style: 'cancel' },
      { text: t('common.discard.confirm'), style: 'destructive', onPress: () => onClose(false) },
    ]);
  }
  requestCloseRef.current = requestClose;

  async function send() {
    if (sendingRef.current) return;
    if (!answers.overallRating) {
      setError(t('patient.feedback.chooseStars'));
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setError(null);
    try {
      await submitVisitFeedback(visit.visitId, { ...answers, overallRating: answers.overallRating, comments });
      onSent();
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, t('patient.feedback.sendFailed')));
    } finally {
      sendingRef.current = false;
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
          {t('patient.feedback.thanks')}
        </Text>
        <Text style={[styles.meta, styles.center]}>
          {visit.clinicName
            ? t('patient.feedback.clinicReads', { clinic: visit.clinicName })
            : t('patient.feedback.yourClinicReads')}
        </Text>
        <Button title={t('common.done')} onPress={() => onClose(true)} style={styles.stretch} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.sheet} edges={['top', 'bottom']}>
      <KeyboardAvoider style={styles.flex}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle} accessibilityRole="header">
            {t('patient.feedback.title')}
          </Text>
          <TouchableOpacity
            onPress={requestClose}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel={t('patient.feedback.close')}
            hitSlop={12}
          >
            <Ionicons name="close" size={26} color={colors.text} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.meta}>{visitLine(visit)}</Text>

          <Text style={styles.label}>{t('patient.feedback.overall')}</Text>
          <Stars
            label={t('patient.feedback.overall')}
            size={36}
            value={answers.overallRating}
            onChange={(v) => setAnswers((a) => ({ ...a, overallRating: v }))}
          />

          <Text style={[styles.label, styles.gapTop]}>{t('patient.feedback.tellMore')}</Text>
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

          <Text style={[styles.label, styles.gapTop]}>{t('patient.feedback.recommend')}</Text>
          <View style={styles.choices}>
            {[
              { label: t('patient.feedback.yes'), value: true },
              { label: t('patient.feedback.no'), value: false },
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

          <Text style={[styles.label, styles.gapTop]}>{t('patient.feedback.comments')}</Text>
          <TextInput
            style={styles.input}
            value={comments}
            onChangeText={setComments}
            placeholder={t('patient.feedback.commentsPlaceholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={COMMENTS_MAX}
            textAlignVertical="top"
            accessibilityLabel={t('patient.feedback.commentsA11y')}
          />

          {error ? <Banner message={error} /> : null}
          <Button title={t('patient.feedback.send')} onPress={send} loading={sending} style={styles.gapTop} />
          <Text style={[styles.meta, styles.center, styles.gapTop]}>{t('patient.feedback.private')}</Text>
        </ScrollView>
      </KeyboardAvoider>
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
  const t = useT();
  return (
    <View style={styles.stars} accessibilityRole="radiogroup" accessibilityLabel={t('patient.feedback.ratingA11y', { label })}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = !!value && n <= value;
        return (
          <TouchableOpacity
            key={n}
            onPress={() => onChange(n)}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === n }}
            accessibilityLabel={t('patient.feedback.stars', { count: n })}
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
