import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { router, useNavigation } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { apiRequest, errorMessage } from '@/lib/api';
import { emitRefresh } from '@/lib/events';
import { useApiData } from '@/lib/useApiData';
import { PatientProfile, PatientProfileUpdate } from '@/lib/types';
import { colors, radius, spacing } from '@/lib/theme';
import { Banner, Button, IconName, LoadingView, useKeyboardVisible } from '@/components/ui';
import { ErrorState } from '@/components/ErrorState';
import { AppHeader, softShadow } from '@/components/AppHeader';
import { IconField } from '@/components/auth';

// Exactly the fields PATCH /api/patients/me accepts.
interface Form {
  contactEmail: string;
  contactAddress: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  ecName: string;
  ecPhone: string;
  ecRelationship: string;
}

const RELATIONSHIPS = ['Parent', 'Spouse', 'Sibling', 'Child', 'Relative', 'Friend'];

function fromProfile(p: PatientProfile): Form {
  return {
    contactEmail: p.contacts?.email ?? '',
    contactAddress: p.contacts?.address ?? '',
    street: p.address?.street ?? '',
    city: p.address?.city ?? '',
    state: p.address?.state ?? '',
    zipCode: p.address?.zipCode ?? '',
    ecName: p.emergencyContact?.name ?? '',
    ecPhone: p.emergencyContact?.phone ?? '',
    ecRelationship: p.emergencyContact?.relationship ?? '',
  };
}

export default function EditProfileScreen() {
  const navigation = useNavigation();
  const keyboardVisible = useKeyboardVisible();
  const { data, loading, error, refresh } = useApiData<PatientProfile>('/api/patients/me');
  const [form, setForm] = useState<Form | null>(null);
  const [initial, setInitial] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setSaving] = useState(false);
  // Guards a second tap before `isSaving` re-renders.
  const saving = useRef(false);
  // Set once a save succeeds (or the user chose to discard) so leaving isn't questioned.
  const leaving = useRef(false);

  useEffect(() => {
    if (data && !form) {
      const f = fromProfile(data);
      setForm(f);
      setInitial(f);
    }
  }, [data, form]);

  const dirty =
    !!form && !!initial && (Object.keys(form) as (keyof Form)[]).some((k) => form[k].trim() !== initial[k].trim());

  // Ask before throwing away edits (back button, swipe, or the header chevron).
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!dirty || leaving.current) return;
      e.preventDefault();
      Alert.alert('Discard changes?', "Your edits haven't been saved.", [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            leaving.current = true;
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
  }, [navigation, dirty]);

  // The native-stack swipe-back can't be cancelled by beforeRemove once it starts, so
  // turn it off while there are unsaved edits; the back chevron / Android back still ask.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !dirty });
  }, [navigation, dirty]);

  if (loading || (data && !form)) return <LoadingView />;
  if (error || !form || !initial) return <ErrorState message={error ?? 'Profile not found.'} onRetry={refresh} />;

  const set = (key: keyof Form) => (value: string) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  function validate(f: Form): boolean {
    const next: Partial<Record<keyof Form, string>> = {};
    if (f.contactEmail.trim() && !/^\S+@\S+\.\S+$/.test(f.contactEmail.trim())) next.contactEmail = 'Enter a valid email.';
    // PATCH /api/patients/me only accepts a valid address here, so it can be changed but not removed.
    if (initial!.contactEmail.trim() && !f.contactEmail.trim()) {
      next.contactEmail = "Contact email can't be removed here. Enter a new one, or ask the front desk.";
    }
    if (f.ecPhone.trim() && !/^[+0-9 ()-]*$/.test(f.ecPhone.trim())) next.ecPhone = 'Use digits, spaces, + ( ) - only.';
    // The clinic record requires these; they can be edited but not blanked.
    if (initial!.street && !f.street.trim()) next.street = "Street can't be blank.";
    if (initial!.city && !f.city.trim()) next.city = "City can't be blank.";
    if (initial!.zipCode && !f.zipCode.trim()) next.zipCode = "ZIP code can't be blank.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    if (!form || !initial || saving.current) return;
    if (!validate(form)) {
      setSaveError('Please fix the highlighted fields.');
      return;
    }
    const changed = (key: keyof Form) => form[key].trim() !== initial[key].trim();
    const body: PatientProfileUpdate = {};
    if (changed('contactEmail')) body.contacts = { email: form.contactEmail.trim().toLowerCase() };
    if (changed('contactAddress')) body.contacts = { ...body.contacts, address: form.contactAddress.trim() };
    const address: NonNullable<PatientProfileUpdate['address']> = {};
    if (changed('street')) address.street = form.street.trim();
    if (changed('city')) address.city = form.city.trim();
    if (changed('state')) address.state = form.state.trim();
    if (changed('zipCode')) address.zipCode = form.zipCode.trim();
    if (Object.keys(address).length) body.address = address;
    const ec: NonNullable<PatientProfileUpdate['emergencyContact']> = {};
    if (changed('ecName')) ec.name = form.ecName.trim();
    if (changed('ecPhone')) ec.phone = form.ecPhone.trim();
    if (changed('ecRelationship')) ec.relationship = form.ecRelationship.trim();
    if (Object.keys(ec).length) body.emergencyContact = ec;

    if (Object.keys(body).length === 0) {
      leaving.current = true;
      router.back();
      return;
    }

    saving.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await apiRequest('/api/patients/me', { method: 'PATCH', body });
      emitRefresh('profile');
      leaving.current = true;
      router.back();
    } catch (err) {
      setSaveError(errorMessage(err, "Couldn't save your changes."));
    } finally {
      saving.current = false;
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <SafeAreaView edges={['top']}>
          <AppHeader back />
          <Text style={styles.title} accessibilityRole="header">
            Edit Contact Details
          </Text>
          <Text style={styles.subtitle}>Keep your contact information up to date so your clinic can reach you.</Text>
        </SafeAreaView>

        {saveError ? (
          <View style={styles.bannerSpacing}>
            <Banner message={saveError} />
          </View>
        ) : null}

        <Section icon="mail-outline" title="Contact">
          <Field
            label="Contact email"
            icon="mail-outline"
            value={form.contactEmail}
            onChangeText={set('contactEmail')}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            error={errors.contactEmail}
            hint="For messages from your clinic. Your sign-in email doesn't change."
          />
        </Section>

        <Section icon="home-outline" title="Home Address">
          <Field
            label="Street"
            icon="location-outline"
            value={form.street}
            onChangeText={set('street')}
            error={errors.street}
            maxLength={200}
            autoComplete="street-address"
          />
          <View style={styles.pair}>
            <View style={styles.flex}>
              <Field label="City" icon="business-outline" value={form.city} onChangeText={set('city')} error={errors.city} maxLength={100} />
            </View>
            <View style={styles.zip}>
              <Field
                label="ZIP code"
                icon="keypad-outline"
                value={form.zipCode}
                onChangeText={set('zipCode')}
                keyboardType="number-pad"
                error={errors.zipCode}
                maxLength={20}
                autoComplete="postal-code"
              />
            </View>
          </View>
          <Field label="Province" icon="map-outline" value={form.state} onChangeText={set('state')} maxLength={100} />
          <Field
            label="Other address notes"
            icon="create-outline"
            value={form.contactAddress}
            onChangeText={set('contactAddress')}
            multiline
            maxLength={500}
            placeholder="Landmarks, unit number, directions…"
          />
        </Section>

        <Section icon="medkit-outline" title="Emergency Contact">
          <Field label="Full name" icon="person-outline" value={form.ecName} onChangeText={set('ecName')} maxLength={200} autoComplete="name" />
          <Field
            label="Phone number"
            icon="call-outline"
            value={form.ecPhone}
            onChangeText={set('ecPhone')}
            keyboardType="phone-pad"
            error={errors.ecPhone}
            maxLength={20}
            autoComplete="tel"
          />
          <Field
            label="Relationship"
            icon="people-outline"
            value={form.ecRelationship}
            onChangeText={set('ecRelationship')}
            maxLength={100}
          />
          <View style={styles.chips}>
            {RELATIONSHIPS.map((r) => {
              const selected = form.ecRelationship.trim().toLowerCase() === r.toLowerCase();
              return (
                <TouchableOpacity
                  key={r}
                  style={[styles.chip, selected && styles.chipSelected]}
                  onPress={() => set('ecRelationship')(r)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{r}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Section>

        <View style={styles.note}>
          <Ionicons name="information-circle-outline" size={18} color={colors.slate} />
          <Text style={styles.noteText}>
            Your name, date of birth, mobile number and sign-in email are managed by your clinic. Ask the front desk to
            change them.
          </Text>
        </View>
      </ScrollView>

      {/* Above the keyboard the home-indicator inset is just a dead gap. */}
      <SafeAreaView edges={keyboardVisible ? [] : ['bottom']} style={styles.bar}>
        <Button title="Cancel" variant="secondary" onPress={() => router.back()} style={styles.barButton} disabled={isSaving} />
        <Button
          title="Save Changes"
          icon="checkmark"
          onPress={save}
          loading={isSaving}
          disabled={!dirty}
          style={[styles.barButton, styles.barPrimary]}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function Section({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Field({
  label,
  icon,
  error,
  hint,
  placeholder,
  ...rest
}: TextInputProps & { label: string; icon: IconName; error?: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <IconField icon={icon} label={label} placeholder={placeholder ?? label} error={!!error} {...rest} />
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.md + 4, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  title: { fontSize: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },
  bannerSpacing: { marginTop: spacing.md },
  section: { marginTop: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: '#EAF0F2',
    padding: spacing.md,
    paddingBottom: spacing.xs,
    ...softShadow,
  },
  field: { marginBottom: spacing.xs },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  error: { fontSize: 12, color: colors.danger, marginTop: -6, marginBottom: spacing.sm },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: -6, marginBottom: spacing.sm },
  pair: { flexDirection: 'row', gap: spacing.sm },
  zip: { width: 130 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: -2, marginBottom: spacing.md },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  chipTextSelected: { color: colors.primaryOnSoft },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.slateSoft,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginTop: spacing.lg,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 18, color: colors.slate },
  bar: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
    paddingHorizontal: spacing.md + 4,
    paddingTop: spacing.sm + 4,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  barButton: { flex: 1, marginTop: 0 },
  barPrimary: { flex: 1.4 },
});
