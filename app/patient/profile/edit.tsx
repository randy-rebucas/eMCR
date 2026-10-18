import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { apiRequest, errorMessage } from '@/lib/api';
import { emitRefresh } from '@/lib/events';
import { useApiData } from '@/lib/useApiData';
import { PatientProfile, PatientProfileUpdate } from '@/lib/types';
import { Banner, Button, LoadingView, SectionTitle, TextField, screenStyles } from '@/components/ui';
import { ErrorState } from '@/components/ErrorState';

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
  const { data, loading, error, refresh } = useApiData<PatientProfile>('/api/patients/me');
  const [form, setForm] = useState<Form | null>(null);
  const [initial, setInitial] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && !form) {
      const f = fromProfile(data);
      setForm(f);
      setInitial(f);
    }
  }, [data, form]);

  if (loading || (data && !form)) return <LoadingView />;
  if (error || !form || !initial) return <ErrorState message={error ?? 'Profile not found.'} onRetry={refresh} />;

  const set = (key: keyof Form) => (value: string) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  function validate(f: Form): boolean {
    const next: Partial<Record<keyof Form, string>> = {};
    if (f.contactEmail.trim() && !/^\S+@\S+\.\S+$/.test(f.contactEmail.trim())) next.contactEmail = 'Enter a valid email.';
    if (f.ecPhone.trim() && !/^[+0-9 ()-]*$/.test(f.ecPhone.trim())) next.ecPhone = 'Use digits, spaces, + ( ) - only.';
    // The clinic record requires these; they can be edited but not blanked.
    if (initial!.street && !f.street.trim()) next.street = "Street can't be blank.";
    if (initial!.city && !f.city.trim()) next.city = "City can't be blank.";
    if (initial!.zipCode && !f.zipCode.trim()) next.zipCode = "ZIP code can't be blank.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    if (!form || !initial || !validate(form)) return;
    const changed = (key: keyof Form) => form[key].trim() !== initial[key].trim();
    const body: PatientProfileUpdate = {};
    if (changed('contactEmail') && form.contactEmail.trim()) body.contacts = { email: form.contactEmail.trim().toLowerCase() };
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
      router.back();
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await apiRequest('/api/patients/me', { method: 'PATCH', body });
      emitRefresh('profile');
      router.back();
    } catch (err) {
      setSaveError(errorMessage(err, "Couldn't save your changes."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={screenStyles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={screenStyles.content} keyboardShouldPersistTaps="handled">
        {saveError ? <Banner message={saveError} /> : null}

        <SectionTitle>Contact</SectionTitle>
        <TextField
          label="Contact email"
          value={form.contactEmail}
          onChangeText={set('contactEmail')}
          autoCapitalize="none"
          keyboardType="email-address"
          error={errors.contactEmail}
          hint="For clinic messages. Your sign-in email doesn't change."
        />

        <SectionTitle>Address</SectionTitle>
        <TextField label="Street" value={form.street} onChangeText={set('street')} error={errors.street} maxLength={200} />
        <TextField label="City" value={form.city} onChangeText={set('city')} error={errors.city} maxLength={100} />
        <TextField label="Province / state" value={form.state} onChangeText={set('state')} maxLength={100} />
        <TextField
          label="ZIP code"
          value={form.zipCode}
          onChangeText={set('zipCode')}
          keyboardType="number-pad"
          error={errors.zipCode}
          maxLength={20}
        />
        <TextField
          label="Other address notes"
          value={form.contactAddress}
          onChangeText={set('contactAddress')}
          multiline
          maxLength={500}
        />

        <SectionTitle>Emergency contact</SectionTitle>
        <TextField label="Name" value={form.ecName} onChangeText={set('ecName')} maxLength={200} />
        <TextField
          label="Phone"
          value={form.ecPhone}
          onChangeText={set('ecPhone')}
          keyboardType="phone-pad"
          error={errors.ecPhone}
          maxLength={20}
        />
        <TextField label="Relationship" value={form.ecRelationship} onChangeText={set('ecRelationship')} maxLength={100} />

        <Button title="Save" onPress={save} loading={saving} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
