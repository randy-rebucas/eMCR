import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { checkForUpdate, noteSoftPromptShown, softPromptShownFor, UpdateStatus } from '@/lib/appVersion';
import { whenLaunchSplashHidden } from '@/lib/launchSplash';
import { colors, spacing } from '@/lib/theme';
import { useT } from '@/lib/i18n';
import { IconBadge, StatusScreen } from './auth';

/** Coming back to the foreground checks again, but not more often than this. */
const RECHECK_AFTER_MS = 30 * 60 * 1000;

function openStore(url: string | null): void {
  if (url) Linking.openURL(url).catch(() => {});
}

/**
 * Mounted once at the root. Below the server's minimum version it covers the whole app with
 * "Update required" (no way past it); below the latest version it asks once per version, in a
 * dismissible alert. A failed check never blocks anything (lib/appVersion.ts).
 */
export function UpdateGate() {
  const t = useT();
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'none' });
  const lastCheck = useRef(0);
  const inFlight = useRef(false);

  const promptSoft = useCallback(
    async (latestVersion: string, storeUrl: string | null) => {
      if (await softPromptShownFor(latestVersion)) return;
      await whenLaunchSplashHidden();
      await noteSoftPromptShown(latestVersion);
      Alert.alert(t('common.update.softTitle'), t('common.update.softBody'), [
        { text: t('common.update.later'), style: 'cancel' },
        ...(storeUrl ? [{ text: t('common.update.update'), onPress: () => openStore(storeUrl) }] : []),
      ]);
    },
    [t]
  );

  const check = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const next = await checkForUpdate();
      lastCheck.current = Date.now();
      // A failed recheck ('none' from an error) never lifts a requirement already known this run;
      // only a newer build can, and that is a new process.
      setStatus((prev) => (prev.kind === 'required' ? prev : next));
      if (next.kind === 'available') promptSoft(next.latestVersion, next.storeUrl).catch(() => {});
    } finally {
      inFlight.current = false;
    }
  }, [promptSoft]);

  useEffect(() => {
    check();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && Date.now() - lastCheck.current > RECHECK_AFTER_MS) check();
    });
    return () => subscription.remove();
  }, [check]);

  const required = status.kind === 'required';

  // Android back would otherwise reach the screens underneath (or close the app to the same wall).
  useEffect(() => {
    if (!required) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [required]);

  if (status.kind !== 'required') return null;
  const storeName = Platform.OS === 'ios' ? t('common.update.appStore') : t('common.update.playStore');
  return (
    <View style={styles.cover} accessibilityViewIsModal>
      <StatusScreen
        art={<IconBadge icon="cloud-download-outline" />}
        title={t('common.update.requiredTitle')}
        message={t('common.update.requiredBody')}
        action={status.storeUrl ? { title: t('common.update.update'), onPress: () => openStore(status.storeUrl) } : undefined}
      >
        {status.storeUrl ? null : <Text style={styles.hint}>{t('common.update.noStore', { store: storeName })}</Text>}
      </StatusScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  // Above every screen and the App Lock cover: nothing else is usable until the update.
  cover: { ...StyleSheet.absoluteFill, backgroundColor: colors.background, zIndex: 1000, elevation: 1000 },
  hint: { color: colors.textMuted, fontSize: 15, textAlign: 'center', marginTop: spacing.md },
});
