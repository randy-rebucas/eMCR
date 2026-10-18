import { Alert, FlatList, Linking, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useApiData } from '@/lib/useApiData';
import { PatientClinic } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { colors, radius, spacing } from '@/lib/theme';
import { Button, LoadingView, useBottomPadding } from '@/components/ui';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { ErrorState } from '@/components/ErrorState';

function addressLine(address: PatientClinic['address']): string | null {
  if (!address) return null;
  const line = [address.street, address.city, address.state].filter(Boolean).join(', ');
  return line || null;
}

function call(phone: string) {
  Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() =>
    Alert.alert("Couldn't start the call", `Call the clinic at ${phone}.`)
  );
}

/** Every clinic the patient is registered at, most recently visited first. */
export default function ClinicsScreen() {
  const bottomPad = useBottomPadding();
  const { data, loading, refreshing, error, refresh } = useApiData<PatientClinic[]>('/api/patients/me/clinics');

  if (loading && !data) return <LoadingView />;

  const clinics = data ?? [];

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      data={clinics}
      keyExtractor={(c) => c.tenantId}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
      ListHeaderComponent={
        <SafeAreaView edges={['top']}>
          <AppHeader back />
          <Text style={styles.title} accessibilityRole="header">
            My Clinics
          </Text>
          <Text style={styles.subtitle}>
            Every clinic you're registered at. Your records from all of them show up in this app.
          </Text>
        </SafeAreaView>
      }
      ListEmptyComponent={
        error ? (
          <ErrorState message={error} onRetry={refresh} />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="business-outline" size={36} color={colors.textMuted} />
            <Text style={styles.emptyText}>No clinics yet. Clinics appear here after your first visit.</Text>
          </View>
        )
      }
      ListFooterComponent={
        clinics.length ? (
          <Text style={styles.footnote}>
            Missing a clinic? Sign in with a code sent to your phone. Clinics that registered you with the same
            phone number and birth date are added automatically.
          </Text>
        ) : null
      }
      renderItem={({ item }) => <ClinicCard clinic={item} />}
    />
  );
}

function ClinicCard({ clinic }: { clinic: PatientClinic }) {
  const address = addressLine(clinic.address);
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.icon}>
          <Ionicons name="business" size={22} color={colors.primary} />
        </View>
        <View style={styles.flex}>
          <Text style={styles.name} numberOfLines={2}>
            {clinic.name}
          </Text>
          {address ? (
            <Text style={styles.meta} numberOfLines={2}>
              {address}
            </Text>
          ) : null}
        </View>
      </View>

      <View style={styles.facts}>
        <Text style={styles.meta}>
          Last visit: <Text style={styles.fact}>{clinic.lastVisitAt ? formatDate(clinic.lastVisitAt) : 'None yet'}</Text>
        </Text>
        {clinic.patientCode ? (
          <Text style={styles.meta}>
            Patient ID: <Text style={styles.fact}>{clinic.patientCode}</Text>
          </Text>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Button
          title="Book"
          icon="calendar-outline"
          style={styles.action}
          onPress={() => router.push({ pathname: '/patient/appointments/book', params: { tenantId: clinic.tenantId } })}
        />
        {clinic.phone ? (
          <Button
            title="Call"
            icon="call-outline"
            variant="secondary"
            style={styles.action}
            onPress={() => call(clinic.phone as string)}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, flexGrow: 1 },
  flex: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.md,
    marginBottom: spacing.md,
    ...softShadow,
  },
  cardTop: { flexDirection: 'row', gap: spacing.sm + 4, alignItems: 'center' },
  icon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: '#E3F6F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  fact: { color: colors.text, fontWeight: '600' },
  facts: { marginTop: spacing.sm + 4, gap: 2 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1 },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyText: { fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  footnote: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
