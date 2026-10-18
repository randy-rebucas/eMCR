import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { useUnread } from '@/lib/unread';
import { ListRow, SectionTitle, screenStyles } from '@/components/ui';

export default function MoreScreen() {
  const { patient } = useAuth();
  const { unreadCount } = useUnread();

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={screenStyles.content}>
        <ListRow
          label="Notifications"
          detail={unreadCount ? `${unreadCount} unread` : undefined}
          badgeCount={unreadCount}
          onPress={() => router.push('/patient/notifications')}
        />

        <SectionTitle>Records</SectionTitle>
        <ListRow label="Prescriptions" onPress={() => router.push('/patient/prescriptions')} />
        <ListRow label="Billing" detail="Invoices and balance" onPress={() => router.push('/patient/invoices')} />
        <ListRow label="Documents" onPress={() => router.push('/patient/documents')} />

        <SectionTitle>Account</SectionTitle>
        <ListRow
          label="Profile"
          detail={patient ? `${patient.firstName} ${patient.lastName}` : undefined}
          onPress={() => router.push('/patient/profile')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
