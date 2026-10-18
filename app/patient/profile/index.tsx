import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useApiData } from '@/lib/useApiData';
import { PatientProfile } from '@/lib/types';
import { formatDate, humanize } from '@/lib/format';
import { colors, spacing } from '@/lib/theme';
import { Card, DetailRow, ListRow, LoadingView, SectionTitle, screenStyles } from '@/components/ui';
import { ErrorState } from '@/components/ErrorState';
import { SignOutSection } from '@/components/SignOutSection';

function joinAddress(a: PatientProfile['address']): string | null {
  if (!a) return null;
  const text = [a.street, a.city, a.state, a.zipCode].filter(Boolean).join(', ');
  return text || null;
}

export default function ProfileScreen() {
  const { data, loading, refreshing, error, refresh } = useApiData<PatientProfile>('/api/patients/me', {
    refreshOn: ['profile'],
  });

  if (loading) return <LoadingView />;

  return (
    <ScrollView
      style={screenStyles.container}
      contentContainerStyle={screenStyles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
    >
      {error && !data ? (
        <View style={{ height: 200 }}>
          <ErrorState message={error} onRetry={refresh} />
        </View>
      ) : data ? (
        <>
          <Card>
            <Text style={screenStyles.title}>
              {[data.firstName, data.middleName, data.lastName, data.suffix].filter(Boolean).join(' ')}
            </Text>
            <View style={{ height: spacing.sm }} />
            <DetailRow label="Patient ID" value={data.patientCode} />
            <DetailRow label="Date of birth" value={data.dateOfBirth ? formatDate(data.dateOfBirth) : null} />
            <DetailRow label="Sex" value={humanize(data.sex)} />
            <DetailRow label="Sign-in email" value={data.email} />
            <DetailRow label="Mobile" value={data.phone} />
          </Card>
          <Text style={screenStyles.muted}>
            Your name, sign-in email and mobile number are managed by the clinic. Ask the front desk to change them.
          </Text>

          <SectionTitle>Contact details</SectionTitle>
          <Card>
            <DetailRow label="Contact email" value={data.contacts?.email || '—'} />
            <DetailRow label="Address" value={joinAddress(data.address) ?? data.contacts?.address ?? '—'} />
            <DetailRow label="Emergency contact" value={data.emergencyContact?.name || '—'} />
            <DetailRow label="Emergency phone" value={data.emergencyContact?.phone} />
            <DetailRow label="Relationship" value={data.emergencyContact?.relationship} />
          </Card>
          <ListRow label="Edit contact details" onPress={() => router.push('/patient/profile/edit')} />
          <ListRow
            label={data.hasPassword === false ? 'Set a password' : 'Change password'}
            detail={data.hasPassword === false ? 'Sign in with email next time' : undefined}
            onPress={() => router.push('/patient/profile/password')}
          />
        </>
      ) : null}

      <SignOutSection />
    </ScrollView>
  );
}
