import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { errorMessage } from '@/lib/api';
import { isValidBirthDate, requestAccess, searchClinics } from '@/lib/emcr';
import { ClinicDirectoryEntry } from '@/lib/types';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button } from '@/components/ui';
import {
  AuthFailure,
  AuthHeader,
  AuthScreen,
  classifyAuthError,
  IconBadge,
  IconField,
  MaintenanceScreen,
  OfflineScreen,
  StatusScreen,
} from '@/components/auth';
import { BirthDateField } from '@/components/emcr';

const SEARCH_DELAY_MS = 350;

function clinicPlace(c: ClinicDirectoryEntry): string {
  return [c.city, c.state].filter(Boolean).join(', ');
}

/**
 * "Request access" for someone whose phone number the clinic doesn't have. No sign-in. The answer
 * is always the same, whether or not the clinic has a matching record.
 */
export default function RequestAccessScreen() {
  const [clinic, setClinic] = useState<ClinicDirectoryEntry | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ClinicDirectoryEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const inFlight = useRef(false);

  // Debounced clinic search; only the latest query may write results.
  useEffect(() => {
    if (clinic) return;
    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      searchClinics(term)
        .then((list) => {
          if (cancelled) return;
          setResults(list);
          setSearchError(null);
        })
        .catch((err) => {
          if (!cancelled) setSearchError(errorMessage(err, "Couldn't search clinics. Please try again."));
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, clinic]);

  if (sentMessage) {
    return (
      <StatusScreen
        art={<IconBadge icon="paper-plane-outline" />}
        title="Request Sent"
        message={sentMessage}
        action={{ title: 'Done', onPress: () => (router.canGoBack() ? router.back() : router.replace('/login')) }}
      />
    );
  }

  async function submit() {
    if (inFlight.current) return;
    const fail = (message: string) => setFailure({ kind: 'message', message, status: 0 });
    if (!clinic) return fail('Choose your clinic.');
    if (!firstName.trim() || !lastName.trim()) return fail('Enter your first and last name as the clinic has them.');
    if (!isValidBirthDate(dob)) return fail('Enter your birth date as YYYY-MM-DD, for example 1990-04-25.');
    const contactPhone = phone.trim();
    const contactEmail = email.trim();
    if (!contactPhone && !contactEmail) return fail('Add a phone number or email so the clinic can reach you.');
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) return fail('Enter a valid email address.');

    inFlight.current = true;
    setFailure(null);
    setSubmitting(true);
    try {
      const message = await requestAccess({
        tenantId: clinic.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dob,
        contactPhone: contactPhone || undefined,
        contactEmail: contactEmail || undefined,
      });
      setSentMessage(message);
    } catch (err) {
      setFailure(classifyAuthError(err));
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  if (failure?.kind === 'offline') {
    return <OfflineScreen onRetry={submit} onBack={() => setFailure(null)} retrying={submitting} />;
  }
  if (failure?.kind === 'maintenance') {
    return <MaintenanceScreen onRetry={submit} onBack={() => setFailure(null)} retrying={submitting} />;
  }
  const errorText = failure?.kind === 'message' ? failure.message : null;

  return (
    <AuthScreen back>
      <AuthHeader
        title="Request Access"
        subtitle="If your clinic doesn't have your mobile number, ask them for access. We'll send sign-in instructions to the contact details the clinic has on file, or the clinic will contact you."
      />
      {errorText ? <Banner message={errorText} /> : null}

      <Text style={styles.label}>Your clinic</Text>
      {clinic ? (
        <View style={styles.selected}>
          <Ionicons name="business-outline" size={20} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={styles.clinicName}>{clinic.displayName || clinic.name}</Text>
            {clinicPlace(clinic) ? <Text style={styles.clinicPlace}>{clinicPlace(clinic)}</Text> : null}
          </View>
          <TouchableOpacity
            onPress={() => setClinic(null)}
            style={styles.change}
            accessibilityRole="button"
            accessibilityLabel="Choose a different clinic"
          >
            <Text style={styles.changeText}>Change</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <IconField
            icon="search-outline"
            label="Search for your clinic"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching ? <ActivityIndicator color={colors.primary} style={styles.searching} /> : null}
          {searchError ? <Text style={styles.searchNote}>{searchError}</Text> : null}
          {!searching && !searchError && search.trim().length >= 2 && results.length === 0 ? (
            <Text style={styles.searchNote}>No clinics match “{search.trim()}”.</Text>
          ) : null}
          {results.length ? (
            <View style={styles.results}>
              {results.map((c, i) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.result, i < results.length - 1 && styles.resultDivider]}
                  onPress={() => {
                    setClinic(c);
                    setFailure(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${c.displayName || c.name}`}
                >
                  <View style={styles.flex}>
                    <Text style={styles.clinicName}>{c.displayName || c.name}</Text>
                    {clinicPlace(c) ? <Text style={styles.clinicPlace}>{clinicPlace(c)}</Text> : null}
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </>
      )}

      <Text style={[styles.label, styles.section]}>About you</Text>
      <IconField
        icon="person-outline"
        label="First name"
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
        autoComplete="name-given"
        textContentType="givenName"
        returnKeyType="next"
      />
      <IconField
        icon="person-outline"
        label="Last name"
        value={lastName}
        onChangeText={setLastName}
        autoCapitalize="words"
        autoComplete="name-family"
        textContentType="familyName"
        returnKeyType="next"
      />
      <BirthDateField value={dob} onChange={setDob} />

      <Text style={[styles.label, styles.section]}>How the clinic can reach you</Text>
      <Text style={styles.hint}>Add at least one.</Text>
      <IconField
        icon="call-outline"
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        returnKeyType="next"
      />
      <IconField
        icon="mail-outline"
        label="Email address"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={submit}
      />

      <Button title="Send Request" onPress={submit} loading={submitting} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginBottom: spacing.sm },
  section: { marginTop: spacing.md },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: -spacing.xs, marginBottom: spacing.sm },
  searching: { marginVertical: spacing.sm },
  searchNote: { fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm },
  results: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  result: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 56, paddingVertical: spacing.sm },
  resultDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  selected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    marginBottom: spacing.sm + 4,
  },
  clinicName: { fontSize: 15, fontWeight: '600', color: colors.text },
  clinicPlace: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  change: { minHeight: 44, justifyContent: 'center', paddingLeft: spacing.sm },
  changeText: { fontSize: 14, fontWeight: '600', color: colors.primary },
});
