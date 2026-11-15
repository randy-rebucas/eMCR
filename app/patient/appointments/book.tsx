import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet } from 'react-native';
import { router, useLocalSearchParams, useNavigation, usePreventRemove } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { colors, spacing } from '@/lib/theme';
import { BookingForm } from '@/components/BookingForm';
import { KeyboardAvoider, useBottomPadding } from '@/components/ui';
import { t as translate } from '@/lib/i18n';

/** Standalone booking (from the home screen's call to action, or a clinic on the Clinics screen). */
export default function BookAppointmentScreen() {
  const { tenantId } = useLocalSearchParams<{ tenantId?: string }>();
  // This screen sits under the native stack header, so the keyboard math must start below it.
  const headerHeight = useHeaderHeight();
  const bottomPad = useBottomPadding();
  const [dirty, setDirty] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const navigation = useNavigation();

  // Android back or the header chevron with a doctor, time or reason chosen: ask first.
  const disablePrevention = usePreventRemove(dirty && !leaving, ({ repeat }) => {
    Alert.alert(translate('common.discard.title'), translate('common.discard.body'), [
      { text: translate('common.discard.keep'), style: 'cancel' },
      {
        text: translate('common.discard.confirm'),
        style: 'destructive',
        onPress: () => {
          setLeaving(true);
          repeat();
        },
      },
    ]);
  });

  // The native-stack swipe-back can't be cancelled once it starts: off while something is chosen.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !dirty });
  }, [navigation, dirty]);

  return (
    <KeyboardAvoider style={styles.root} keyboardVerticalOffset={headerHeight}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <BookingForm
          tenantId={typeof tenantId === 'string' && tenantId ? tenantId : undefined}
          onDirtyChange={setDirty}
          onBooked={({ appointment }) => {
            // Booked: leaving is no longer losing anything.
            setLeaving(true);
            disablePrevention();
            if (appointment?._id) router.replace(`/patient/appointments/${appointment._id}`);
            else router.back();
          }}
        />
      </ScrollView>
    </KeyboardAvoider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md },
});
