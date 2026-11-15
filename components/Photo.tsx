import { ReactNode, useId } from 'react';
import { Image, ImageSourcePropType, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '@/lib/theme';

/**
 * The bundled stock photos (Unsplash licence: free to use, no attribution required; sources in
 * assets/photos/CREDITS.md). Small JPEGs, cropped and desaturated 20% to sit with the teal.
 */
export const photos = {
  checkup: require('@/assets/photos/checkup.jpg') as ImageSourcePropType,
  consultation: require('@/assets/photos/consultation.jpg') as ImageSourcePropType,
  doctorWelcome: require('@/assets/photos/doctor-welcome.jpg') as ImageSourcePropType,
  pillOrganizer: require('@/assets/photos/pill-organizer.jpg') as ImageSourcePropType,
  planner: require('@/assets/photos/planner.jpg') as ImageSourcePropType,
  waitingRoom: require('@/assets/photos/waiting-room.jpg') as ImageSourcePropType,
  labTubes: require('@/assets/photos/lab-tubes.jpg') as ImageSourcePropType,
  /** Sign-in band: an older patient on clinic waiting chairs, checking her phone. Light wall at the top. */
  patientPhone: require('@/assets/photos/patient-phone.jpg') as ImageSourcePropType,
};

/**
 * A photo under a navy scrim that deepens toward the bottom, so white text there always reads
 * (the foot is near-solid navy: the contrast is navy's, not the photo's). Decorative: the photo is
 * hidden from screen readers; the children carry the meaning. Keep `flex: 1` off text inside it,
 * or the text stretches up onto the light part of the photo.
 */
export function ScrimPhoto({
  source,
  children,
  style,
  top = 0.15,
  bottom = 0.92,
}: {
  source: ImageSourcePropType;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scrim opacity at the top edge and at the bottom edge. */
  top?: number;
  bottom?: number;
}) {
  const id = `scrim${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    // A View with the photo absolutely behind it: ImageBackground is deprecated in RN 0.88.
    <View style={[styles.frame, style]}>
      <Image
        source={source}
        resizeMode="cover"
        style={styles.image}
        accessibilityIgnoresInvertColors
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
      <Svg style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.navy} stopOpacity={top} />
            <Stop offset="0.45" stopColor={colors.navy} stopOpacity={(top + bottom) / 2} />
            <Stop offset="1" stopColor={colors.navy} stopOpacity={bottom} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', backgroundColor: colors.navy },
  // Explicit size: absoluteFill alone leaves a bundled Image at its own pixel size (zoomed in).
  image: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
  content: { flex: 1 },
});
