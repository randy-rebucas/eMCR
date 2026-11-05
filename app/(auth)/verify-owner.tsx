import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { getClaimContext, setClaimContext } from '@/lib/emcr';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, IconName } from '@/components/ui';
import { AuthHeader, AuthScreen, IconBadge, TextLink } from '@/components/auth';
import { ClaimExpiredScreen } from '@/components/emcr';
import { useT } from '@/lib/i18n';

/**
 * "Is this your record?" after the phone code, when the account has no profile yet (or the
 * patient chose to add another person). The clinics' records on this number are never named:
 * the patient proves which one is theirs with a first name and birth date on the next step.
 */
export default function VerifyOwnerScreen() {
  const { signedIn } = useAuth();
  const t = useT();
  // Read once: the context only changes on the steps after this one.
  const [context] = useState(getClaimContext);

  if (!context) return <ClaimExpiredScreen signedIn={signedIn} />;

  const people = context.peopleOnNumber;
  const subtitle = people > 0 ? t('auth.owner.found', { count: people }) : t('auth.owner.foundNone');

  function finish() {
    setClaimContext(null);
    if (context?.mode === 'add') router.dismissTo('/patient/family');
    else router.replace('/enable-notifications');
  }

  return (
    <AuthScreen back={signedIn ? false : () => router.dismissTo('/login')}>
      <AuthHeader title={t('auth.owner.title')} subtitle={subtitle} />
      <View style={styles.art}>
        <IconBadge icon="people-outline" size={96} />
      </View>

      {context.hasOwnRecord ? (
        <Banner message={t('auth.owner.ownLinked')} tone="primary" />
      ) : (
        <Choice
          icon="person-outline"
          title={t('auth.owner.me')}
          detail={t('auth.owner.meDetail')}
          onPress={() => router.push('/claim-details?relation=self')}
        />
      )}
      <Choice
        icon="people-outline"
        title={t('auth.owner.other')}
        detail={t('auth.owner.otherDetail')}
        onPress={() => router.push('/claim-details?relation=other')}
      />

      {signedIn ? <TextLink title={t('auth.continue')} onPress={finish} style={styles.continue} /> : null}

      <View style={styles.footer}>
        <Text style={styles.footerText}>{t('auth.owner.notOnNumber')}</Text>
        <TextLink title={t('auth.requestAccess')} onPress={() => router.push('/request-access')} />
      </View>
    </AuthScreen>
  );
}

function Choice({ icon, title, detail, onPress }: { icon: IconName; title: string; detail: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.choice} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${detail}`}>
      <View style={styles.choiceIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.choiceTitle}>{title}</Text>
        <Text style={styles.choiceDetail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  art: { marginBottom: spacing.lg },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    minHeight: 72,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm + 4,
  },
  choiceIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  choiceDetail: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  continue: { alignSelf: 'center', marginTop: spacing.md },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 'auto',
    paddingTop: spacing.xl,
  },
  footerText: { fontSize: 14, color: colors.textMuted },
});
