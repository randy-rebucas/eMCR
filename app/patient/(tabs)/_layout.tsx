import { Tabs } from 'expo-router';
import { colors } from '@/lib/theme';
import { useUnread } from '@/lib/unread';

export default function PatientTabsLayout() {
  const { unreadCount } = useUnread();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="appointments" options={{ title: 'Appointments' }} />
      <Tabs.Screen name="queue" options={{ title: 'Queue' }} />
      <Tabs.Screen name="results" options={{ title: 'Results' }} />
      <Tabs.Screen
        name="more"
        options={{ title: 'More', tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined }}
      />
    </Tabs>
  );
}
