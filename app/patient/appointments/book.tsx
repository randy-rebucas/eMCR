import { ScrollView, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { colors, spacing } from '@/lib/theme';
import { BookingForm } from '@/components/BookingForm';
import { KeyboardAvoider, useBottomPadding } from '@/components/ui';

/** Standalone booking (from the home screen's call to action, or a clinic on the Clinics screen). */
export default function BookAppointmentScreen() {
  const { tenantId } = useLocalSearchParams<{ tenantId?: string }>();
  // This screen sits under the native stack header, so the keyboard math must start below it.
  const headerHeight = useHeaderHeight();
  const bottomPad = useBottomPadding();
  return (
    <KeyboardAvoider style={styles.root} keyboardVerticalOffset={headerHeight}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <BookingForm
          tenantId={typeof tenantId === 'string' && tenantId ? tenantId : undefined}
          onBooked={({ appointment }) => {
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
