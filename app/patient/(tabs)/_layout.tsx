import { ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';
import { useUnread } from '@/lib/unread';
import { IconName } from '@/components/ui';
import { TourTarget } from '@/components/QuickTour';
import { useT } from '@/lib/i18n';

type TabTourId = 'tab-appointments' | 'tab-queue' | 'tab-results' | 'tab-more';

function tabIcon(active: IconName, inactive: IconName, tourId?: TabTourId) {
  return ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => {
    const icon = <Ionicons name={focused ? active : inactive} size={size} color={color as string} />;
    return tourId ? <TourTarget id={tourId}>{icon}</TourTarget> : icon;
  };
}

export default function PatientTabsLayout() {
  const { unreadCount } = useUnread();
  const t = useT();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: t('nav.home'), headerShown: false, tabBarIcon: tabIcon('home', 'home-outline') }}
      />
      <Tabs.Screen
        name="appointments"
        options={{ title: t('nav.appointments'), headerShown: false, tabBarIcon: tabIcon('calendar', 'calendar-outline', 'tab-appointments') }}
      />
      <Tabs.Screen
        name="queue"
        options={{ title: t('nav.queue'), headerShown: false, tabBarIcon: tabIcon('people', 'people-outline', 'tab-queue') }}
      />
      <Tabs.Screen
        name="results"
        options={{
          title: t('nav.results'),
          headerShown: false,
          tabBarIcon: tabIcon('document-text', 'document-text-outline', 'tab-results'),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('nav.more'),
          headerShown: false,
          tabBarIcon: tabIcon('ellipsis-horizontal', 'ellipsis-horizontal', 'tab-more'),
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
        }}
      />
    </Tabs>
  );
}
