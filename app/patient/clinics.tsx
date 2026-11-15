import { Alert, FlatList, Image, Linking, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApiData } from '@/lib/useApiData';
import { PatientClinic } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { IconName, LoadingView, RefreshErrorBanner, useBottomPadding } from '@/components/ui';
import { AppHeader } from '@/components/AppHeader';
import { ErrorState } from '@/components/ErrorState';
import { OfflineBanner } from '@/components/OfflineBanner';
import { t as translate, useT } from '@/lib/i18n';

function addressLine(address: PatientClinic['address']): string | null {
  if (!address) return null;
  const line = [address.street, address.city, address.state].filter(Boolean).join(', ');
  return line || null;
}

function call(phone: string) {
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() =>
    Alert.alert(translate('clinics.callFailedTitle'), translate('clinics.callFailedBody', { phone }))
  );
}

/** The maps app (or the browser) on the clinic; the name helps when the address is vague. */
function directions(clinic: PatientClinic, address: string) {
  const q = encodeURIComponent(`${clinic.name}, ${address}`);
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`).catch(() => {});
}

function book(clinic: PatientClinic) {
  router.push({ pathname: '/patient/appointments/book', params: { tenantId: clinic.tenantId } });
}

/**
 * Every clinic the patient is registered at, most recently visited first. The first one leads on
 * navy (where they go most), the rest sit in one ruled card. Cached for offline use: the address
 * and phone are what a patient needs on the way there.
 */
export default function ClinicsScreen() {
  const t = useT();
  const bottomPad = useBottomPadding();
  const { data, loading, refreshing, error, refresh, offline, updatedAt } = useApiData<PatientClinic[]>(
    '/api/patients/me/clinics',
    { offline: true }
  );

  if (loading && !data) return <LoadingView />;

  const clinics = data ?? [];
  const [first, ...rest] = clinics;

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      data={rest}
      keyExtractor={(c) => c.tenantId}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <>
          <SafeAreaView edges={['top']}>
            <AppHeader back />
            <Text style={styles.title} accessibilityRole="header">
              {t('clinics.title')}
            </Text>
            <Text style={styles.subtitle}>{t('clinics.subtitle')}</Text>
          </SafeAreaView>
          {offline ? (
            <View style={styles.banner}>
              <OfflineBanner offline={offline} updatedAt={updatedAt} subject={t('clinics.offlineSubject')} />
            </View>
          ) : (
            <RefreshErrorBanner error={error} show={clinics.length > 0} />
          )}
          {first ? <ClinicHero clinic={first} several={clinics.length > 1} /> : null}
          {rest.length ? (
            <Text style={styles.sectionTitle} accessibilityRole="header">
              {t('clinics.others', { count: rest.length })}
            </Text>
          ) : null}
        </>
      }
      ListEmptyComponent={
        first ? undefined : error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="business-outline" size={36} color={colors.textMuted} />
            <Text style={styles.emptyText}>{t('clinics.empty')}</Text>
          </View>
        )
      }
      renderItem={({ item, index }) => (
        <ClinicRow clinic={item} first={index === 0} last={index === rest.length - 1} />
      )}
      ListFooterComponent={clinics.length ? <Text style={styles.footnote}>{t('clinics.footnote')}</Text> : undefined}
    />
  );
}

/** "Last visit Nov 8 · Patient ID QC-0012", or what's known of it. */
function factsLine(t: ReturnType<typeof useT>, clinic: PatientClinic): string {
  return [
    clinic.lastVisitAt
      ? t('clinics.lastVisitShort', { date: formatDate(clinic.lastVisitAt, { month: 'short', day: 'numeric', year: 'numeric' }) })
      : t('clinics.noVisitYet'),
    clinic.patientCode ? t('clinics.idShort', { id: clinic.patientCode }) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function Logo({ clinic, size, onNavy }: { clinic: PatientClinic; size: number; onNavy?: boolean }) {
  return (
    <View
      style={[
        styles.logo,
        { width: size, height: size, borderRadius: radius.md },
        onNavy ? styles.logoOnNavy : styles.logoOnLight,
      ]}
    >
      {clinic.logo ? (
        <Image
          source={{ uri: clinic.logo }}
          style={{ width: size, height: size }}
          resizeMode="cover"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : (
        <Ionicons name="business" size={Math.round(size * 0.48)} color={onNavy ? colors.primaryText : colors.primaryOnSoft} />
      )}
    </View>
  );
}

function ClinicHero({ clinic, several }: { clinic: PatientClinic; several: boolean }) {
  const t = useT();
  const address = addressLine(clinic.address);
  return (
    <View style={styles.hero}>
      <Text style={styles.heroEyebrow}>{several ? t('clinics.mostRecent') : t('clinics.yourClinic')}</Text>
      <View style={styles.heroTop}>
        <Logo clinic={clinic} size={52} onNavy />
        <View style={styles.flex}>
          <Text style={styles.heroName}>{clinic.name}</Text>
          {address ? <Text style={styles.heroMeta}>{address}</Text> : null}
        </View>
      </View>
      <Text style={[styles.heroMeta, styles.heroFacts]} selectable>
        {factsLine(t, clinic)}
      </Text>
      <View style={styles.heroActions}>
        <HeroButton icon="calendar-outline" label={t('clinics.book')} primary onPress={() => book(clinic)} />
        {address ? <HeroButton icon="navigate-outline" label={t('clinics.directions')} onPress={() => directions(clinic, address)} /> : null}
        {clinic.phone ? <HeroButton icon="call-outline" label={t('clinics.call')} onPress={() => call(clinic.phone as string)} /> : null}
      </View>
    </View>
  );
}

function HeroButton({ icon, label, primary, onPress }: { icon: IconName; label: string; primary?: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.heroButton, primary ? styles.heroButtonPrimary : styles.heroButtonGhost]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={18} color={colors.primaryText} />
      <Text style={styles.heroButtonText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** One more clinic, as a row of the ruled card: name, place, last visit; Book, and Call when known. */
function ClinicRow({ clinic, first, last }: { clinic: PatientClinic; first: boolean; last: boolean }) {
  const t = useT();
  const address = addressLine(clinic.address);
  return (
    <View style={[styles.row, first && styles.rowFirst, last && styles.rowLast, !first && styles.rowDivider]}>
      <View style={styles.rowTop}>
        <Logo clinic={clinic} size={40} />
        <View style={styles.flex}>
          <Text style={styles.rowName}>{clinic.name}</Text>
          {address ? <Text style={styles.rowMeta}>{address}</Text> : null}
          <Text style={[styles.rowMeta, styles.figures]} selectable>
            {factsLine(t, clinic)}
          </Text>
        </View>
      </View>
      <View style={styles.rowActions}>
        <RowAction icon="calendar-outline" label={t('clinics.book')} onPress={() => book(clinic)} />
        {address ? <RowAction icon="navigate-outline" label={t('clinics.directions')} onPress={() => directions(clinic, address)} /> : null}
        {clinic.phone ? <RowAction icon="call-outline" label={t('clinics.call')} onPress={() => call(clinic.phone as string)} /> : null}
      </View>
    </View>
  );
}

function RowAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.rowAction} onPress={onPress} accessibilityRole="button">
      <Ionicons name={icon} size={17} color={colors.primary} />
      <Text style={styles.rowActionText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, flexGrow: 1 },
  flex: { flex: 1 },
  figures: { fontVariant: ['tabular-nums'] },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  banner: { marginBottom: spacing.md },

  hero: { backgroundColor: colors.navy, borderRadius: radius.lg, padding: spacing.md + 4 },
  heroEyebrow: { fontSize: 12, fontWeight: '700', color: colors.onNavyMuted, textTransform: 'uppercase', letterSpacing: 0.6 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm + 4 },
  heroName: { fontSize: 20, fontWeight: '700', color: colors.primaryText },
  heroMeta: { fontSize: 14, lineHeight: 19, color: colors.onNavyMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  heroFacts: {
    marginTop: spacing.md,
    paddingTop: spacing.sm + 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.navyLine,
  },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  heroButton: {
    flexGrow: 1,
    flexBasis: 96,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    minHeight: 48,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm + 4,
  },
  heroButtonPrimary: { backgroundColor: colors.primary },
  heroButtonGhost: { borderWidth: 1, borderColor: colors.navyLine },
  heroButtonText: { fontSize: 15, fontWeight: '600', color: colors.primaryText },

  logo: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  logoOnNavy: { backgroundColor: colors.primary },
  logoOnLight: { backgroundColor: colors.primarySoft },

  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  // Rows of one ruled card across the list: the first and last round its corners.
  row: {
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm + 4,
    paddingBottom: spacing.xs,
  },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  rowLast: { borderBottomWidth: 1, borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowTop: { flexDirection: 'row', gap: spacing.sm + 4 },
  rowName: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  rowActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginLeft: 40 + spacing.sm + 4 },
  rowAction: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  rowActionText: { fontSize: 14, fontWeight: '600', color: colors.primary },

  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  footnote: { fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: 'center', marginTop: spacing.lg },
});
