import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { emitRefresh } from '@/lib/events';
import {
  claimRecord,
  getClaimContext,
  isValidBirthDate,
  noteAccountCredentials,
  setClaimContext,
  updateClaimContext,
} from '@/lib/emcr';
import { FAMILY_RELATIONSHIPS, FamilyRelationship } from '@/lib/types';
import { spacing } from '@/lib/theme';
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
import { BirthDateField, ChipPicker, ClaimExpiredScreen } from '@/components/emcr';
import { useT } from '@/lib/i18n';

type Done = { status: 'linked' | 'already_linked'; firstName: string; signedIn: boolean };

/**
 * The answer to "Is this your record?": first name + birth date of the record on this phone
 * number, and for someone the patient looks after, how they're related.
 */
export default function ClaimDetailsScreen() {
  const auth = useAuth();
  const t = useT();
  const params = useLocalSearchParams<{ relation?: string }>();
  const relation: 'self' | 'other' = params.relation === 'self' ? 'self' : 'other';
  const [context] = useState(getClaimContext);
  const mode = context?.mode ?? 'signin';

  const [firstName, setFirstName] = useState('');
  const [dob, setDob] = useState('');
  const [relationship, setRelationship] = useState<FamilyRelationship | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const [expired, setExpired] = useState(!context);
  const [done, setDone] = useState<Done | null>(null);
  const inFlight = useRef(false);

  if (expired) return <ClaimExpiredScreen signedIn={auth.signedIn} mode={mode} />;

  function finish() {
    setClaimContext(null);
    if (mode === 'add') router.dismissTo('/patient/family');
    else if (auth.signedIn) router.replace('/enable-notifications');
    else router.dismissTo('/login');
  }

  function addAnother() {
    // The same phone proof works for every person on the number while it lasts.
    if (getClaimContext()) router.replace('/verify-owner');
    else router.replace(auth.signedIn ? '/phone?purpose=add' : '/phone?purpose=signin');
  }

  if (done) {
    const someoneElse = relation === 'other';
    return (
      <StatusScreen
        art={<IconBadge icon="checkmark-circle" />}
        title={
          done.status === 'already_linked'
            ? t('auth.claim.alreadyLinked')
            : someoneElse
              ? t('auth.claim.addedTitle')
              : t('auth.claim.linkedTitle')
        }
        message={someoneElse ? t('auth.claim.addedMessage', { name: done.firstName }) : t('auth.claim.linkedMessage')}
        action={{ title: done.signedIn ? t('auth.continue') : t('auth.backToSignIn'), onPress: finish }}
        link={{ title: t('auth.addAnother'), onPress: addAnother }}
      />
    );
  }

  async function submit() {
    if (inFlight.current) return;
    const name = firstName.trim();
    if (!name) return setFailure({ kind: 'message', message: t('auth.claim.enterFirstName'), status: 0 });
    if (!isValidBirthDate(dob)) {
      return setFailure({ kind: 'message', message: t('auth.claim.enterBirthDate'), status: 0 });
    }
    const ctx = getClaimContext();
    if (!ctx) {
      setExpired(true);
      return;
    }

    inFlight.current = true;
    setFailure(null);
    setSubmitting(true);
    try {
      const result = await claimRecord(ctx.claimToken, {
        relation,
        firstName: name,
        dateOfBirth: dob,
        relationship: relation === 'other' ? (relationship ?? undefined) : undefined,
      });
      updateClaimContext({ hasOwnRecord: !!result.account?.hasOwnRecord });
      // Sign in on the account (or move this device onto it when adding from Family), so the
      // new person shows up in the family list.
      if (result.session) {
        if (mode === 'signin') noteAccountCredentials(result.account);
        await auth.applySession(result.session);
      }
      emitRefresh('family');

      if (result.status === 'pending_approval') {
        router.replace(`/pending-approval?clinics=${result.clinics ?? 0}`);
        return;
      }
      setDone({ status: result.status, firstName: name, signedIn: !!result.session || auth.signedIn });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CLAIM_EXPIRED') {
        setClaimContext(null);
        setExpired(true);
        return;
      }
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
        title={relation === 'self' ? t('auth.claim.selfTitle') : t('auth.claim.otherTitle')}
        subtitle={relation === 'self' ? t('auth.claim.selfSubtitle') : t('auth.claim.otherSubtitle')}
      />
      {errorText ? <Banner message={errorText} /> : null}

      <IconField
        icon="person-outline"
        label={relation === 'self' ? t('auth.claim.yourFirstName') : t('auth.claim.theirFirstName')}
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
        autoCorrect={false}
        autoComplete={relation === 'self' ? 'name-given' : 'off'}
        textContentType={relation === 'self' ? 'givenName' : 'none'}
        returnKeyType="next"
      />
      <BirthDateField
        value={dob}
        onChange={setDob}
        label={relation === 'self' ? t('auth.claim.yourBirthDate') : t('auth.claim.theirBirthDate')}
        onSubmitEditing={relation === 'self' ? submit : undefined}
      />

      {relation === 'other' ? (
        <View style={styles.picker}>
          <ChipPicker
            label={t('auth.claim.theyAreMy')}
            options={FAMILY_RELATIONSHIPS}
            value={relationship}
            onChange={setRelationship}
            format={(r) => t(`common.relationship.${r}`)}
          />
        </View>
      ) : null}

      <Button title={relation === 'self' ? t('auth.claim.linkMine') : t('auth.claim.addThem')} onPress={submit} loading={submitting} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  picker: { marginTop: spacing.sm },
});
