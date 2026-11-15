import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/lib/theme';
import { useT } from '@/lib/i18n';
import { Button, IconName, useAnnounce } from './ui';

/**
 * The app's one look for "nothing to show here": an icon, a short line or two, and the action that
 * can fix it. Every error, unavailable and empty-with-action state goes through this, so they read
 * the same on every screen (and every retry button says the same "Try Again").
 */

type Action = { label: string; onPress: () => void; icon?: IconName; variant?: 'primary' | 'secondary' };

export function StateView({
  icon,
  tone = 'neutral',
  title,
  message,
  actions = [],
  fill = false,
  style,
}: {
  icon?: IconName;
  /** 'error' tints the icon red; neutral keeps the app's teal. */
  tone?: 'neutral' | 'error';
  title?: string;
  message: string;
  actions?: Action[];
  /** Take the whole screen (a detail screen with nothing else to show) instead of sitting in a list. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  // Errors and "not available" appear in place of content: say them without moving focus.
  useAnnounce(title ? `${title}. ${message}` : message);
  return (
    <View style={[fill ? styles.fill : styles.inline, style]}>
      {icon ? (
        <View style={[styles.icon, tone === 'error' && styles.iconError]}>
          <Ionicons name={icon} size={28} color={tone === 'error' ? colors.danger : colors.primaryOnSoft} />
        </View>
      ) : null}
      {title ? (
        <Text style={styles.title} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <Text style={styles.message} accessibilityRole={title ? undefined : 'alert'} accessibilityLiveRegion="polite">
        {message}
      </Text>
      {actions.map((a) => (
        <Button
          key={a.label}
          title={a.label}
          icon={a.icon}
          variant={a.variant ?? 'secondary'}
          onPress={a.onPress}
          style={styles.action}
        />
      ))}
    </View>
  );
}

/** A load failed and nothing is on screen yet: the server's message and "Try Again". */
export function ErrorView({
  message,
  onRetry,
  fill = false,
  style,
}: {
  message: string;
  onRetry: () => void;
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useT();
  return (
    <StateView
      icon="alert-circle-outline"
      tone="error"
      message={message}
      actions={[{ label: t('common.tryAgainTitle'), icon: 'refresh', onPress: onRetry }]}
      fill={fill}
      style={style}
    />
  );
}

/** Back to the screen that opened this one; Home when there is none (opened from a notification). */
export function goBackOrHome() {
  if (router.canGoBack()) router.back();
  else router.replace('/patient/home');
}

/**
 * The server says the record is gone (404/410) or isn't this profile's (403): common when a push
 * opens a deleted record or a family member's. "Try Again" can't help, so this offers Back instead.
 */
export function UnavailableView({ message }: { message?: string }) {
  const t = useT();
  const canGoBack = router.canGoBack();
  return (
    <StateView
      fill
      icon="document-lock-outline"
      title={t('states.unavailable.title')}
      message={message ?? t('states.unavailable.text')}
      actions={[
        canGoBack
          ? { label: t('common.goBack'), icon: 'arrow-back', onPress: goBackOrHome }
          : { label: t('states.unavailable.goHome'), icon: 'home-outline', onPress: goBackOrHome },
      ]}
    />
  );
}

/** Status codes that mean "this record isn't yours to see, or no longer exists": retrying won't help. */
export function isUnavailableStatus(status: number | null | undefined): boolean {
  return status === 403 || status === 404 || status === 410;
}

/**
 * For a useApiData result: did the last load fail because the record is unavailable? Reads the
 * hook's `errorStatus` (the failed response's HTTP status) when it provides one.
 */
export function isUnavailable(load: { error: string | null; errorStatus?: number | null }): boolean {
  return !!load.error && isUnavailableStatus(load.errorStatus);
}

/**
 * One section of a screen (Home's latest result or balance) failed to load while the rest is fine:
 * a small card saying so, with a retry, so the failure doesn't look like "nothing here".
 */
export function SectionError({ message, onRetry, style }: { message: string; onRetry: () => void; style?: StyleProp<ViewStyle> }) {
  const t = useT();
  useAnnounce(message);
  return (
    <View style={[styles.section, style]}>
      <Ionicons name="alert-circle-outline" size={20} color={colors.danger} />
      <Text style={styles.sectionText} accessibilityLiveRegion="polite">
        {message}
      </Text>
      <TouchableOpacity
        style={styles.sectionRetry}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={`${t('common.tryAgainTitle')}: ${message}`}
      >
        <Text style={styles.sectionRetryText}>{t('common.tryAgainTitle')}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** Placeholder cards while a list's first page loads (nothing saved yet). Not for pull-to-refresh. */
export function SkeletonCards({ label, count = 3 }: { label?: string; count?: number }) {
  const t = useT();
  // One announced element for screen readers; the grey shapes inside stay hidden.
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? t('states.loading')}
      accessibilityState={{ busy: true }}
    >
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.skeleton}>
          <View style={styles.skeletonDate} />
          <View style={styles.flex}>
            <View style={[styles.skeletonLine, { width: '70%' }]} />
            <View style={[styles.skeletonLine, styles.skeletonThin, { width: '50%' }]} />
            <View style={[styles.skeletonLine, styles.skeletonThin, { width: '35%' }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.background,
  },
  inline: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.md },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  iconError: { backgroundColor: colors.dangerSoft },
  title: { fontSize: typography.section, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: spacing.xs },
  message: { fontSize: typography.label, lineHeight: 20, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.sm },
  action: { alignSelf: 'stretch' },

  section: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    minHeight: 56,
  },
  sectionText: { flex: 1, fontSize: typography.caption, color: colors.textMuted },
  sectionRetry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm + 4 },
  sectionRetryText: { fontSize: typography.label, fontWeight: '600', color: colors.primary },

  skeleton: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm + 4,
  },
  skeletonDate: { width: 68, height: 72, borderRadius: radius.md, backgroundColor: colors.slateSoft },
  skeletonLine: { height: 16, borderRadius: 4, backgroundColor: colors.slateSoft, marginBottom: spacing.sm },
  skeletonThin: { height: 12 },
});
