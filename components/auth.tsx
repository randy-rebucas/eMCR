import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ApiError } from '@/lib/api';
import { colors, radius, spacing } from '@/lib/theme';
import { Button, IconName, useAnnounce } from './ui';

// Building blocks for the signed-out and onboarding screens, so they share
// one layout, field and full-screen-state look.

/** Safe-area + keyboard-aware scrolling page with an optional back chevron. */
export function AuthScreen({
  children,
  back = false,
  center = false,
  footer,
}: {
  children: ReactNode;
  /** true = router.back(); a function overrides it (e.g. step back inside one screen). */
  back?: boolean | (() => void);
  center?: boolean;
  footer?: ReactNode;
}) {
  const onBack = typeof back === 'function' ? back : back ? () => router.back() : null;
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        {onBack ? (
          <TouchableOpacity
            style={styles.back}
            onPress={onBack}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
        ) : null}
        <ScrollView
          contentContainerStyle={[styles.content, center && styles.contentCenter]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function AuthHeader({
  title,
  subtitle,
  align = 'left',
}: {
  title: string;
  subtitle?: ReactNode;
  align?: 'left' | 'center';
}) {
  const textAlign = align;
  return (
    <View style={styles.header}>
      <Text style={[styles.title, { textAlign }]} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={[styles.subtitle, { textAlign }]}>{subtitle}</Text> : null}
    </View>
  );
}

/** Text input with a leading icon, focus ring, and an eye toggle for passwords. */
export function IconField({
  icon,
  label,
  error,
  secureTextEntry,
  ...rest
}: TextInputProps & { icon: IconName; label: string; error?: boolean }) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(true);
  const isSecret = !!secureTextEntry;
  return (
    <View style={[styles.field, focused && styles.fieldFocused, error && styles.fieldError]}>
      <Ionicons name={icon} size={20} color={focused ? colors.primary : colors.textMuted} />
      <TextInput
        placeholder={label}
        {...rest}
        style={styles.fieldInput}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        secureTextEntry={isSecret && hidden}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
      />
      {isSecret ? (
        <TouchableOpacity
          onPress={() => setHidden((h) => !h)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
        >
          <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={colors.textMuted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/** A PH mobile number as the 10 digits after +63: "0917 123 4567" / "+63 917…" → "9171234567". */
export function toPhLocal(raw: string): string {
  let d = raw.replace(/\D/g, '');
  // PH mobiles start with 9, so a leading 63 or 0 is always the prefix, never part of the number.
  if (d.startsWith('63')) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
}

export const isPhMobile = (local: string) => /^9\d{9}$/.test(local);

export const toPhE164 = (local: string) => `+63${local}`;

/** Mobile number field fixed to the Philippines: "+63" prefix, digits grouped as 917 123 4567. */
export function PhPhoneField({
  value,
  onChange,
  error,
  ...rest
}: Omit<TextInputProps, 'value' | 'onChange' | 'onChangeText'> & { value: string; onChange: (local: string) => void; error?: boolean }) {
  const [focused, setFocused] = useState(false);
  const grouped = [value.slice(0, 3), value.slice(3, 6), value.slice(6)].filter(Boolean).join(' ');
  return (
    <View style={[styles.field, focused && styles.fieldFocused, error && styles.fieldError]}>
      <Ionicons name="call-outline" size={20} color={focused ? colors.primary : colors.textMuted} />
      <Text style={styles.phPrefix}>+63</Text>
      <View style={styles.phDivider} />
      <TextInput
        placeholder="917 123 4567"
        {...rest}
        value={grouped}
        onChangeText={(t) => onChange(toPhLocal(t))}
        maxLength={16}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        style={styles.fieldInput}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel="Mobile number, Philippines +63"
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
      />
    </View>
  );
}

/** Six digit boxes backed by one hidden input, so paste and SMS autofill work. */
export function OtpInput({
  value,
  onChange,
  error = false,
  length = 6,
  autoFocus = true,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  length?: number;
  autoFocus?: boolean;
}) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(autoFocus);
  const digits = value.split('');
  return (
    // The row is the one accessible element (the real input is a 1px hidden field), so
    // screen-reader users get a label and a double-tap that opens the keyboard.
    <Pressable
      style={styles.otpRow}
      onPress={() => input.current?.focus()}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${length}-digit code, ${digits.length} of ${length} entered${error ? ', incorrect' : ''}`}
      accessibilityHint="Double tap to type the code"
    >
      {Array.from({ length }).map((_, i) => {
        const active = focused && (i === digits.length || (i === length - 1 && digits.length === length));
        return (
          <View
            key={i}
            style={[styles.otpBox, digits[i] && styles.otpBoxFilled, active && styles.otpBoxActive, error && styles.fieldError]}
          >
            <Text style={styles.otpDigit} maxFontSizeMultiplier={1.6}>
              {digits[i] ?? ''}
            </Text>
          </View>
        );
      })}
      <TextInput
        ref={input}
        value={value}
        onChangeText={(v) => onChange(v.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={length}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.otpHidden}
        caretHidden
        accessibilityLabel={`${length}-digit code`}
      />
    </Pressable>
  );
}

/** Inline error text under a field/OTP: announced when it appears or changes. */
export function InlineError({ message, style }: { message: string; style?: StyleProp<TextStyle> }) {
  useAnnounce(message);
  return (
    <Text style={style} accessibilityRole="alert" accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}

/**
 * For the steps right after sign-in (set password, all set, notifications):
 * Android back would land on a signed-out screen that just redirects forward
 * again, skipping the step, so consume it while the screen is focused. iOS
 * swipe-back is disabled for these routes in (auth)/_layout.
 */
export function useBlockHardwareBack(onBack?: () => void) {
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        onBack?.();
        return true;
      });
      return () => sub.remove();
    }, [onBack])
  );
}

/**
 * Step-up check used when the server answers `OTP_REQUIRED` (setting a first
 * password outside a fresh code sign-in): texts a code to the patient's
 * registered number and hands the 6 digits to `onVerify`.
 */
export function OtpConfirm({
  phone,
  sendCode,
  onVerify,
  onCancel,
  verifying,
  error,
}: {
  phone: string;
  /** Sends (or re-sends) the SMS code. */
  sendCode: () => Promise<unknown>;
  onVerify: (code: string) => void;
  onCancel: () => void;
  verifying: boolean;
  error: string | null;
}) {
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(30);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  // A failed attempt clears the boxes so the next code can be typed straight in.
  useEffect(() => {
    if (error) setCode('');
  }, [error]);

  async function resend() {
    setSendError(null);
    try {
      await sendCode();
      setResendIn(30);
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "Couldn't send a new code. Please try again.");
    }
  }

  const message = error ?? sendError;
  return (
    <View>
      <Text style={styles.subtitle}>
        To confirm it's you, enter the 6-digit code we sent to{' '}
        <Text style={styles.confirmPhone}>{formatPhone(phone)}</Text>.
      </Text>
      <OtpInput
        value={code}
        error={!!message}
        onChange={(value) => {
          setCode(value);
          if (value.length === 6 && !verifying) onVerify(value);
        }}
      />
      {message ? <InlineError message={message} style={styles.confirmError} /> : null}
      <Button title="Verify and Save" onPress={() => onVerify(code)} loading={verifying} disabled={code.length !== 6} />
      <View style={styles.confirmLinks}>
        <TextLink
          title={resendIn > 0 ? `Resend code (00:${String(resendIn).padStart(2, '0')})` : 'Resend code'}
          onPress={resend}
          disabled={resendIn > 0 || verifying}
        />
        <TextLink title="Cancel" onPress={onCancel} disabled={verifying} />
      </View>
    </View>
  );
}

export const PASSWORD_RULES: { label: string; test: (pw: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One number', test: (pw) => /\d/.test(pw) },
];

export function ChecklistItem({ label, met }: { label: string; met: boolean }) {
  return (
    <View style={styles.checkRow} accessible accessibilityLabel={`${label}${met ? ', done' : ''}`}>
      <Ionicons
        name={met ? 'checkmark-circle' : 'ellipse-outline'}
        size={18}
        color={met ? colors.primary : colors.border}
      />
      <Text style={[styles.checkText, met && styles.checkTextMet]}>{label}</Text>
    </View>
  );
}

export function Divider({ label }: { label: string }) {
  return (
    <View style={styles.divider}>
      <View style={styles.dividerLine} />
      <Text style={styles.dividerText}>{label}</Text>
      <View style={styles.dividerLine} />
    </View>
  );
}

export function TextLink({
  title,
  onPress,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="link"
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.linkTarget, style]}
    >
      <Text style={[styles.link, disabled && styles.linkDisabled]}>{title}</Text>
    </TouchableOpacity>
  );
}

type Tone = 'primary' | 'danger' | 'slate';

/** Soft circular icon "illustration", optionally with a small corner badge. */
export function IconBadge({
  icon,
  tone = 'primary',
  size = 112,
  badge,
}: {
  icon: IconName;
  tone?: Tone;
  size?: number;
  badge?: { icon: IconName; tone: Tone };
}) {
  const t = TONES[tone];
  return (
    <View
      style={[styles.badgeCircle, { width: size, height: size, borderRadius: size / 2, backgroundColor: t.bg }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={icon} size={size * 0.5} color={t.fg} />
      {badge ? (
        <View style={[styles.cornerBadge, { backgroundColor: TONES[badge.tone].fg }]}>
          <Ionicons name={badge.icon} size={18} color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

/**
 * Full-screen state (error, offline, maintenance, success): illustration,
 * title, message, primary action, optional secondary link.
 */
export function StatusScreen({
  art,
  title,
  message,
  action,
  link,
  children,
  onBack,
}: {
  art: ReactNode;
  title: string;
  message: string;
  action?: { title: string; onPress: () => void; loading?: boolean };
  link?: { title: string; onPress: () => void };
  children?: ReactNode;
  onBack?: () => void;
}) {
  // These replace the screen content without a navigation, so say what happened.
  useAnnounce(`${title}. ${message}`);
  return (
    <AuthScreen back={onBack ?? false} center>
      <View style={styles.status}>
        {art}
        <Text style={styles.statusTitle} accessibilityRole="header">
          {title}
        </Text>
        <Text style={styles.statusMessage}>{message}</Text>
        {children}
      </View>
      {action ? <Button title={action.title} onPress={action.onPress} loading={action.loading} /> : null}
      {link ? <TextLink title={link.title} onPress={link.onPress} style={styles.statusLink} /> : null}
    </AuthScreen>
  );
}

export function OfflineScreen({ onRetry, onBack, retrying }: { onRetry: () => void; onBack?: () => void; retrying?: boolean }) {
  return (
    <StatusScreen
      onBack={onBack}
      art={<IconBadge icon="wifi" tone="slate" badge={{ icon: 'close', tone: 'danger' }} />}
      title="No Internet Connection"
      message="Please check your internet connection and try again."
      action={{ title: 'Try Again', onPress: onRetry, loading: retrying }}
    />
  );
}

export function MaintenanceScreen({ onRetry, onBack, retrying }: { onRetry: () => void; onBack?: () => void; retrying?: boolean }) {
  return (
    <StatusScreen
      onBack={onBack}
      art={<IconBadge icon="construct" tone="slate" />}
      title="We'll Be Right Back"
      message="eMCR is temporarily unavailable while we do some maintenance. Please try again in a little while."
      action={{ title: 'Try Again', onPress: onRetry, loading: retrying }}
    />
  );
}

/** Which full-screen state (if any) a failed sign-in request should show. */
export type AuthFailure = { kind: 'offline' } | { kind: 'maintenance' } | { kind: 'message'; message: string; status: number };

export function classifyAuthError(err: unknown): AuthFailure {
  if (err instanceof ApiError) {
    if (err.code === 'NETWORK') return { kind: 'offline' };
    if (err.status === 502 || err.status === 503 || err.status === 504) return { kind: 'maintenance' };
    return { kind: 'message', message: err.message, status: err.status };
  }
  return { kind: 'message', message: 'Something went wrong. Please try again.', status: 0 };
}

/** "09171234567" → "+63 917 123 4567"; anything else is shown as typed. */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  const local = d.startsWith('63') && d.length === 12 ? d.slice(2) : d.startsWith('0') && d.length === 11 ? d.slice(1) : null;
  if (!local) return raw.trim();
  return `+63 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

const TONES: Record<Tone, { bg: string; fg: string }> = {
  primary: { bg: colors.primarySoft, fg: colors.primary },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  slate: { bg: colors.slateSoft, fg: colors.slate },
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.surface },
  back: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, alignSelf: 'flex-start' },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xl },
  contentCenter: { justifyContent: 'center' },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  header: { marginBottom: spacing.lg },
  title: { fontSize: 26, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.textMuted, marginTop: spacing.sm },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    minHeight: 54,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    marginBottom: spacing.sm + 4,
  },
  fieldFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
  fieldError: { borderColor: colors.danger },
  fieldInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: spacing.sm + 4 },
  phPrefix: { fontSize: 16, fontWeight: '600', color: colors.text },
  phDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', marginVertical: spacing.md, backgroundColor: colors.border },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginVertical: spacing.lg },
  otpBox: {
    // Not individual tap targets (the whole row is); shrink on narrow phones, grow with text.
    minWidth: 36,
    flexBasis: 48,
    flexShrink: 1,
    minHeight: 56,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxFilled: { backgroundColor: colors.surface },
  otpBoxActive: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.surface },
  otpDigit: { fontSize: 22, fontWeight: '600', color: colors.text },
  otpHidden: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 6 },
  checkText: { fontSize: 13, color: colors.textMuted },
  checkTextMet: { color: colors.text },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginVertical: spacing.lg },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dividerText: { fontSize: 13, color: colors.textMuted },
  // 44pt tall so the link meets the minimum touch target on its own.
  linkTarget: { minHeight: 44, justifyContent: 'center' },
  link: { fontSize: 14, fontWeight: '600', color: colors.primary },
  linkDisabled: { color: colors.textMuted },
  badgeCircle: { alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  cornerBadge: {
    position: 'absolute',
    right: 10,
    bottom: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.surface,
  },
  status: { alignItems: 'center', marginBottom: spacing.xl },
  statusTitle: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: spacing.lg },
  statusMessage: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 300,
  },
  statusLink: { alignSelf: 'center', marginTop: spacing.lg },
  confirmPhone: { fontWeight: '700', color: colors.text },
  confirmError: { color: colors.danger, fontSize: 14, textAlign: 'center', marginTop: -spacing.sm, marginBottom: spacing.sm },
  confirmLinks: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
});
