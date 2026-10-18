import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';
import { colors, spacing } from '@/lib/theme';
import { Banner, Button, ChipGroup, TextField } from '@/components/ui';
import { QrScanner } from '@/components/QrScanner';

type Method = 'password' | 'otp' | 'qr';

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Something went wrong. Please try again.';
}

export default function LoginScreen() {
  const auth = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [method, setMethod] = useState<Method>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [scanning, setScanning] = useState(false);

  if (auth.signedIn) return <Redirect href="/patient/home" />;

  function resetMessages() {
    setError(null);
    setInfo(null);
    auth.clearNotice();
  }

  async function run(action: () => Promise<void>) {
    resetMessages();
    setSubmitting(true);
    try {
      await action();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  function switchMethod(next: Method) {
    setMethod(next);
    resetMessages();
    if (next === 'qr') setScanning(true);
  }

  function submitPassword() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    run(() => auth.loginWithPassword(email.trim(), password));
  }

  function submitOtpRequest() {
    if (!phone.trim()) {
      setError('Enter the mobile number registered with your clinic.');
      return;
    }
    run(async () => {
      const message = await auth.requestOtp(phone.trim());
      setOtpSent(true);
      setInfo(message);
    });
  }

  function submitOtp() {
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Enter the 6-digit code from the SMS.');
      return;
    }
    run(() => auth.loginWithOtp(phone.trim(), otp.trim()));
  }

  function handleQrScanned(data: string) {
    setScanning(false);
    run(() => auth.loginWithQr(data));
  }

  const notice = auth.notice;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>eMCR</Text>
          <Text style={styles.brandSub}>Electronic MyClinic Record</Text>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to view your appointments, results, and more.</Text>

          {notice ? <Banner message={notice} tone="warning" /> : null}
          {info ? <Banner message={info} tone="primary" /> : null}
          {error ? <Banner message={error} /> : null}

          <ChipGroup<Method>
            options={[
              { label: 'Email', value: 'password' },
              { label: 'Phone code', value: 'otp' },
              { label: 'QR code', value: 'qr' },
            ]}
            value={method}
            onChange={switchMethod}
          />
          <View style={styles.spacer} />

          {method === 'password' ? (
            <>
              <TextField
                label="Email"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="you@example.com"
              />
              <TextField
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
                placeholder="••••••••"
              />
              <Button title="Sign in" onPress={submitPassword} loading={submitting} />
            </>
          ) : null}

          {method === 'otp' ? (
            <>
              <TextField
                label="Mobile number"
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  if (otpSent) setOtpSent(false);
                }}
                keyboardType="phone-pad"
                autoComplete="tel"
                placeholder="09XX XXX XXXX"
              />
              {otpSent ? (
                <>
                  <TextField
                    label="6-digit code"
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    placeholder="123456"
                    hint="The code is valid for 5 minutes."
                  />
                  <Button title="Sign in" onPress={submitOtp} loading={submitting} />
                  <Button title="Send a new code" variant="secondary" onPress={submitOtpRequest} disabled={submitting} />
                </>
              ) : (
                <Button title="Send code" onPress={submitOtpRequest} loading={submitting} />
              )}
            </>
          ) : null}

          {method === 'qr' ? (
            <>
              <Text style={styles.help}>
                Scan the login QR code your clinic gave you at registration, or one generated from your account.
              </Text>
              <Button title="Scan QR code" onPress={() => setScanning(true)} loading={submitting} />
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={scanning} animationType="slide" onRequestClose={() => setScanning(false)}>
        <QrScanner onScanned={handleQrScanned} onCancel={() => setScanning(false)} />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  brand: { fontSize: 22, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 },
  brandSub: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.lg },
  title: { fontSize: 28, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  subtitle: { fontSize: 15, color: colors.textMuted, marginBottom: spacing.lg },
  spacer: { height: spacing.md },
  help: { fontSize: 14, color: colors.textMuted, marginVertical: spacing.md },
});
