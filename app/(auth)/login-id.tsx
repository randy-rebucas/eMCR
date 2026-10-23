import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { takeIssuedLoginId } from '@/lib/emcr';
import { colors, radius, spacing } from '@/lib/theme';
import { Button } from '@/components/ui';
import { AuthHeader, AuthScreen, IconBadge, useBlockHardwareBack } from '@/components/auth';

/**
 * Shown once after the first password is saved: the structured login ID the account was given.
 * It signs in with the password like the mobile number. It is not an email inbox.
 */
export default function LoginIdScreen() {
  const { signedIn } = useAuth();
  const [loginId] = useState(takeIssuedLoginId);
  useBlockHardwareBack();

  if (!signedIn) return <Redirect href="/login" />;
  if (!loginId) return <Redirect href="/enable-notifications" />;

  return (
    <AuthScreen>
      <View style={styles.art}>
        <IconBadge icon="key-outline" badge={{ icon: 'checkmark', tone: 'primary' }} />
      </View>
      <AuthHeader
        title="Your eMCR Login ID"
        subtitle="Sign in with this or your mobile number, plus your new password. You can also find it under More."
        align="center"
      />
      <View style={styles.box}>
        <Text style={styles.id} selectable accessibilityLabel={`Login ID ${loginId}`}>
          {loginId}
        </Text>
      </View>
      <Text style={styles.note}>This is a sign-in name only. No email is sent to it.</Text>
      <Button title="Continue" onPress={() => router.replace('/enable-notifications')} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  art: { marginVertical: spacing.md, alignItems: 'center' },
  box: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  id: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
  note: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.lg },
});
