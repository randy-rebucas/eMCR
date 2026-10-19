import { useRef, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '@/lib/theme';
import { Button, LoadingView } from './ui';

/**
 * Full-screen QR scanner. Calls `onScanned` once with the raw string; the
 * parent decides whether to re-arm it (by remounting) after a failed sign-in.
 */
export function QrScanner({
  onScanned,
  onCancel,
  prompt = 'Point the camera at the login QR code from your clinic.',
  purpose = 'To sign in with your clinic QR code',
}: {
  onScanned: (data: string) => void;
  onCancel: () => void;
  /** Shown over the camera. */
  prompt?: string;
  /** Why the camera is needed, for the permission screen ("To … , allow the app to use the camera"). */
  purpose?: string;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const handledRef = useRef(false);

  function handleScan(result: BarcodeScanningResult) {
    // The camera fires repeatedly while the code stays in frame.
    if (handledRef.current || !result.data) return;
    handledRef.current = true;
    setScanned(true);
    onScanned(result.data);
  }

  if (!permission) return <LoadingView />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permission}>
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionText}>
          {purpose}, allow the app to use the camera. It's only used while this screen is open.
        </Text>
        {permission.canAskAgain ? (
          <Button title="Allow camera" onPress={requestPermission} />
        ) : (
          <Button title="Open settings" onPress={() => Linking.openSettings()} />
        )}
        <Button title="Cancel" variant="secondary" onPress={onCancel} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleScan}
      />
      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <Text style={styles.overlayText}>{prompt}</Text>
        <View style={styles.frame} />
        <TouchableOpacity style={styles.cancel} onPress={onCancel} accessibilityRole="button">
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'space-between', padding: spacing.lg },
  overlayText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.lg,
  },
  frame: { width: 240, height: 240, borderWidth: 3, borderColor: '#fff', borderRadius: radius.lg },
  cancel: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.lg,
  },
  cancelText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  permission: { flex: 1, justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.background },
  permissionTitle: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  permissionText: { fontSize: 15, color: colors.textMuted, marginBottom: spacing.lg },
});
