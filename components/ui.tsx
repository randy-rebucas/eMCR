import { ReactNode, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';
import { useT } from '@/lib/i18n';

export type IconName = keyof typeof Ionicons.glyphMap;

// Small shared building blocks so every screen gets the same card, button,
// field and status-badge look as the original screens.

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dangerOutline';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  iconPosition = 'left',
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  iconPosition?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;
  const textColor =
    variant === 'primary' || variant === 'danger'
      ? colors.primaryText
      : variant === 'dangerOutline'
        ? colors.danger
        : colors.primary;
  return (
    <TouchableOpacity
      style={[styles.button, buttonVariants[variant], isDisabled && styles.buttonDisabled, style]}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View style={[styles.buttonInner, iconPosition === 'right' && styles.buttonInnerReverse]}>
          {icon ? <Ionicons name={icon} size={20} color={textColor} /> : null}
          <Text style={[styles.buttonText, { color: textColor }]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

type Tone = 'neutral' | 'primary' | 'danger' | 'warning';

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const palette = badgeTones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text style={styles.rowValue}>{value}</Text>
      ) : (
        value
      )}
    </View>
  );
}

/**
 * Bottom padding for scroll content on screens with no tab bar under them, so
 * the last row clears the iOS home indicator / Android gesture bar.
 */
export function useBottomPadding(base: number = spacing.xl) {
  return useSafeAreaInsets().bottom + base;
}

/**
 * KeyboardAvoidingView with the app's per-platform behaviour. Android builds are edge-to-edge
 * (SDK 58), so the window no longer shrinks for the keyboard (adjustResize has no effect there)
 * and the view must make room itself. KeyboardAvoidingView only adds the part of the keyboard
 * that overlaps it, so this can't double-pad if the OS ever does resize the window.
 * `keyboardVerticalOffset`: height of anything above this view that its layout doesn't include
 * (a native stack header).
 */
export function KeyboardAvoider({
  children,
  style,
  keyboardVerticalOffset,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  keyboardVerticalOffset?: number;
}) {
  return (
    <KeyboardAvoidingView
      style={style}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

/** Non-blocking notice that a refresh failed while the last good data stays on screen. */
export function RefreshErrorBanner({ error, show = true }: { error: string | null | undefined; show?: boolean }) {
  const t = useT();
  if (!error || !show) return null;
  return <Banner message={t('common.refreshFailed', { error })} />;
}

/**
 * Under a client-side search of a paged list while older pages haven't loaded: says the search
 * only covers what's loaded and offers to load the next page.
 */
export function SearchMoreHint({ onLoadMore }: { onLoadMore: () => void }) {
  const t = useT();
  return (
    <View style={styles.searchMore}>
      <Text style={styles.searchMoreText}>{t('common.search.olderNotSearched')}</Text>
      <Button title={t('common.search.loadOlder')} variant="secondary" icon="time-outline" onPress={onLoadMore} />
    </View>
  );
}

/** True while the on-screen keyboard is up (so a pinned footer can drop its home-indicator inset). */
export function useKeyboardVisible() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // iOS has the earlier will* events, so the footer moves with the keyboard rather than after it.
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/** Call when an error/status message appears or changes, so screen readers hear it without moving focus. */
export function useAnnounce(message: string | null | undefined) {
  useEffect(() => {
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
}

export function Banner({ message, tone = 'danger' }: { message: string; tone?: Tone }) {
  const palette = badgeTones[tone];
  useAnnounce(message);
  return (
    <View
      style={[styles.banner, { backgroundColor: palette.bg }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.bannerText, { color: palette.fg }]}>{message}</Text>
    </View>
  );
}

export function LoadingView() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

/** FlatList footer: spinner while loading more, retry link after a failure. */
export function ListFooter({
  loadingMore,
  error,
  onRetry,
}: {
  loadingMore: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const t = useT();
  if (loadingMore) return <ActivityIndicator style={styles.footer} color={colors.primary} />;
  if (error) {
    return (
      <TouchableOpacity style={styles.footer} onPress={onRetry} accessibilityRole="button" accessibilityLiveRegion="polite">
        <Text style={styles.footerError}>{t('common.tapToRetry', { error })}</Text>
      </TouchableOpacity>
    );
  }
  return null;
}

const badgeTones: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.background, fg: colors.textMuted },
  primary: { bg: colors.primarySoft, fg: colors.primaryOnSoft },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  warning: { bg: colors.warningSoft, fg: colors.warning },
};

const buttonVariants: Record<ButtonVariant, ViewStyle> = {
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: colors.danger },
  dangerOutline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.danger },
};

export const screenStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  list: { padding: spacing.md, flexGrow: 1 },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.text, flexShrink: 1 },
  cardLine: { fontSize: 14, color: colors.text, marginTop: spacing.xs },
  cardMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  buttonInnerReverse: { flexDirection: 'row-reverse' },
  buttonText: { fontSize: 16, fontWeight: '600' },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 4, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rowLabel: { fontSize: 14, color: colors.textMuted },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: '500', flexShrink: 1, textAlign: 'right' },
  banner: { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  bannerText: { fontSize: 14, fontWeight: '500' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  footer: { paddingVertical: spacing.lg, alignItems: 'center' },
  footerError: { color: colors.danger, fontSize: 14, textAlign: 'center' },
  searchMore: { paddingVertical: spacing.md, alignItems: 'stretch' },
  searchMoreText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
