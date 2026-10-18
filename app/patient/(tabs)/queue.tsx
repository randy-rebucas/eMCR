import { useCallback, useRef } from 'react';
import { AppState, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useApiData } from '@/lib/useApiData';
import { QueueEntry } from '@/lib/types';
import { colors, radius, spacing } from '@/lib/theme';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';

/**
 * The backend has no realtime channel, so the queue position is polled while
 * this screen is focused and the app is in the foreground. A queue push
 * (`data.tag` = `queue-…`) also triggers an immediate refetch.
 */
const POLL_INTERVAL_MS = 15000;

export default function QueueScreen() {
  const { data: entry, loading, refreshing, error, refresh, poll } = useApiData<QueueEntry | null>(
    '/api/patients/me/queue',
    { refreshOn: ['queue'] }
  );
  const focusedBefore = useRef(false);

  useFocusEffect(
    useCallback(() => {
      // The first focus coincides with the initial load; refetch on later returns to the tab.
      if (focusedBefore.current) poll();
      focusedBefore.current = true;

      const interval = setInterval(() => {
        if (AppState.currentState === 'active') poll();
      }, POLL_INTERVAL_MS);
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') poll();
      });
      return () => {
        clearInterval(interval);
        subscription.remove();
      };
    }, [poll])
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {error && !entry ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        >
          {!loading && !entry ? (
            <EmptyState message="You're not currently in the queue." />
          ) : entry ? (
            <View style={styles.card}>
              {entry.status === 'in-progress' ? (
                <>
                  <Text style={styles.headline}>It's your turn!</Text>
                  <Text style={styles.subtext}>
                    {entry.room ? `Please proceed to ${entry.room.name}.` : 'Please proceed to your assigned room.'}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.position}>{entry.position ?? '—'}</Text>
                  <Text style={styles.subtext}>your position in line</Text>
                  {entry.estimatedWaitTime ? (
                    <Text style={styles.wait}>Estimated wait: ~{entry.estimatedWaitTime} min</Text>
                  ) : null}
                </>
              )}
              <View style={styles.meta}>
                <Text style={styles.metaText}>Queue #{entry.queueNumber}</Text>
                {entry.doctor ? (
                  <Text style={styles.metaText}>
                    Dr. {entry.doctor.firstName} {entry.doctor.lastName}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flexGrow: 1, padding: spacing.md, justifyContent: 'center' },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
  },
  headline: { fontSize: 24, fontWeight: '700', color: colors.primary, textAlign: 'center' },
  position: { fontSize: 56, fontWeight: '700', color: colors.primary },
  subtext: { fontSize: 15, color: colors.textMuted, marginTop: spacing.xs, textAlign: 'center' },
  wait: { fontSize: 14, color: colors.text, marginTop: spacing.sm },
  meta: { marginTop: spacing.lg, alignItems: 'center' },
  metaText: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
});
