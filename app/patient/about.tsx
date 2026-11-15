import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { appContext, openWebPage, platformLabel, PRIVACY_URL, TERMS_URL } from '@/lib/support';
import { colors, radius, spacing } from '@/lib/theme';
import { IconName, useBottomPadding } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import { BrandLogo } from '@/components/BrandLogo';
import { useT } from '@/lib/i18n';

/** App name, the installed version and build (long-press to copy), and the legal and help links. */
export default function AboutScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const ctx = appContext();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      showsVerticalScrollIndicator={false}
    >
      <SafeAreaView edges={['top']}>
        <AppHeader back />
        <Text style={styles.title} accessibilityRole="header">
          {t('support.about.title')}
        </Text>
        <Text style={styles.subtitle}>{t('support.about.subtitle')}</Text>
      </SafeAreaView>

      <View style={styles.card}>
        <BrandLogo size="sm" align="left" />
        <Text style={styles.appName}>{t('support.about.appName')}</Text>
        <Info label={t('support.about.version')} value={ctx.appVersion || '—'} />
        <Info label={t('support.about.build')} value={ctx.buildNumber || '—'} />
        <Info label={t('support.about.device')} value={platformLabel(ctx)} last />
        <Text style={styles.copyHint}>{t('support.about.copyHint')}</Text>
      </View>

      <View style={[styles.card, styles.list]}>
        <Row icon="reader-outline" label={t('support.about.terms')} external onPress={() => openWebPage(TERMS_URL)} />
        <Row icon="shield-checkmark-outline" label={t('support.about.privacy')} external onPress={() => openWebPage(PRIVACY_URL)} />
        <Row icon="trash-outline" label={t('support.about.deleteAccount')} onPress={() => router.push('/patient/delete-account')} />
        <Row icon="chatbubble-ellipses-outline" label={t('support.about.contact')} onPress={() => router.push('/patient/support')} last />
      </View>

      <Text style={styles.footnote}>{t('support.about.company')}</Text>
    </ScrollView>
  );
}

function Info({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.info, !last && styles.divider]} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.infoLabel}>{label}</Text>
      {/* Selectable: a long-press offers Copy, so the patient can paste it to support. */}
      <Text style={styles.infoValue} selectable>
        {value}
      </Text>
    </View>
  );
}

function Row({
  icon,
  label,
  onPress,
  external,
  last,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  external?: boolean;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.divider]}
      onPress={onPress}
      accessibilityRole={external ? 'link' : 'button'}
      accessibilityLabel={label}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={20} color={colors.primaryOnSoft} />
      </View>
      <Text style={styles.rowLabel}>{label}</Text>
      <Ionicons name={external ? 'open-outline' : 'chevron-forward'} size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  list: { paddingVertical: 0, paddingHorizontal: spacing.sm + 4 },
  appName: { fontSize: 15, lineHeight: 21, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.sm },
  info: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingVertical: spacing.sm + 2 },
  infoLabel: { fontSize: 14, color: colors.textMuted },
  infoValue: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'], textAlign: 'right' },
  copyHint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 6, paddingVertical: spacing.sm + 4, minHeight: 44 },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  footnote: { fontSize: 12, lineHeight: 17, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
});
