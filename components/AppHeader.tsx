import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { useUnread } from '@/lib/unread';
import { colors, spacing } from '@/lib/theme';
import { BrandLogo } from './BrandLogo';
import { TourTarget } from './QuickTour';

/** Logo + notifications bell + profile avatar, for the top of tab screens. */
export function AppHeader({ back = false }: { back?: boolean }) {
  const { patient } = useAuth();
  const { unreadCount } = useUnread();
  const pathname = usePathname();
  const initials = patient ? `${patient.firstName?.[0] ?? ''}${patient.lastName?.[0] ?? ''}`.toUpperCase() : '';

  return (
    <View style={styles.bar}>
      <View style={styles.brand}>
        {back ? (
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </TouchableOpacity>
        ) : null}
        <BrandLogo size="sm" align="left" />
      </View>
      <View style={styles.actions}>
        <TourTarget id="bell">
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.push('/patient/notifications')}
            accessibilityRole="button"
            accessibilityLabel={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          >
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            {unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText} maxFontSizeMultiplier={1.3}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
        </TourTarget>
        <TouchableOpacity
          style={[styles.iconButton, styles.avatar]}
          onPress={() => {
            if (pathname !== '/patient/profile') router.push('/patient/profile');
          }}
          accessibilityRole="button"
          accessibilityLabel="Your profile"
        >
          {initials ? (
            <Text style={styles.avatarText}>{initials}</Text>
          ) : (
            <Ionicons name="person" size={20} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export const softShadow = {
  shadowColor: colors.text,
  shadowOpacity: 0.05,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...softShadow,
  },
  avatar: { backgroundColor: colors.primarySoft, borderWidth: 2, borderColor: colors.surface },
  avatarText: { fontSize: 15, fontWeight: '700', color: colors.primaryOnSoft },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    minHeight: 18,
    borderRadius: 999,
    paddingHorizontal: 4,
    // #D93036: white 10pt text needs 4.5:1 (the lighter #E5484D was 3.9:1).
    backgroundColor: '#D93036',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  badgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
});
