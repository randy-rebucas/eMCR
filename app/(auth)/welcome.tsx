import { useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  ImageSourcePropType,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { setWelcomeSeen } from '@/lib/storage';
import { colors, radius, spacing } from '@/lib/theme';
import { BrandLogo } from '@/components/BrandLogo';
import { photos, ScrimPhoto } from '@/components/Photo';
import { Button } from '@/components/ui';
import { LanguagePicker, useLanguageSummary } from '@/components/LanguagePicker';
import { useT } from '@/lib/i18n';

type Slide = {
  /** Text is `auth.welcome.<key>.title` and `.body`. */
  key: 'intro' | 'appointments' | 'records' | 'notify';
  photo: ImageSourcePropType;
  /** Scrim opacity at the photo's top edge: higher for photos with a light top. */
  top: number;
};

// One photo per slide, each showing the part of a clinic visit the slide is about.
const SLIDES: Slide[] = [
  { key: 'intro', photo: photos.doctorWelcome, top: 0.35 },
  { key: 'appointments', photo: photos.planner, top: 0.2 },
  { key: 'records', photo: photos.labTubes, top: 0.2 },
  { key: 'notify', photo: photos.waitingRoom, top: 0.25 },
];

/** First-launch intro carousel, then on to sign-in. */
export default function WelcomeScreen() {
  const { signedIn } = useAuth();
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);
  const [pickingLanguage, setPickingLanguage] = useState(false);
  const t = useT();
  const languageSummary = useLanguageSummary();

  if (signedIn) return <Redirect href="/patient/home" />;

  const last = index === SLIDES.length - 1;

  function finish() {
    setWelcomeSeen().catch(() => {});
    router.replace('/login');
  }

  function next() {
    if (last) return finish();
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  }

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => setPickingLanguage(true)}
          style={styles.topAction}
          accessibilityRole="button"
          accessibilityLabel={`${t('common.language.title')}: ${languageSummary}`}
        >
          <Ionicons name="globe-outline" size={18} color={colors.primary} />
          <Text style={styles.languageText} numberOfLines={1}>
            {languageSummary}
          </Text>
        </Pressable>
        {index > 0 ? (
          <Pressable onPress={finish} style={styles.topAction} accessibilityRole="button" accessibilityLabel={t('auth.welcome.skipA11y')}>
            <Text style={styles.skip}>{t('common.skip')}</Text>
          </Pressable>
        ) : null}
      </View>
      <LanguagePicker visible={pickingLanguage} onClose={() => setPickingLanguage(false)} />

      <Animated.FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumEnd}
        renderItem={({ item, index: i }) => (
          <View style={[styles.slide, { width }]}>
            {/* The photo keeps its own 1080×640 shape (stretched tall it went soft); the logo sits
                on a darker top scrim, the words below on the page. */}
            <ScrimPhoto source={item.photo} top={i === 0 ? 0.75 : item.top} bottom={0.35}
              // Capped on short phones so the words below still fit (cover crops, never squashes).
              style={[styles.photo, { maxHeight: height * 0.35 }]}
            >
              <View style={styles.photoInner}>
                {i === 0 ? <BrandLogo size="sm" align="left" tone="onNavy" /> : null}
              </View>
            </ScrimPhoto>
            {/* Scrolls only when large text outgrows the space left under the photo. */}
            <ScrollView style={styles.copyScroll} contentContainerStyle={styles.copy} showsVerticalScrollIndicator={false} bounces={false}>
              <Text style={styles.title} accessibilityRole="header">
                {t(`auth.welcome.${item.key}.title`)}
              </Text>
              <Text style={styles.body}>{t(`auth.welcome.${item.key}.body`)}</Text>
            </ScrollView>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={t('auth.welcome.step', { step: index + 1, total: SLIDES.length })}>
          {SLIDES.map((s, i) => {
            const range = [(i - 1) * width, i * width, (i + 1) * width];
            const w = scrollX.interpolate({ inputRange: range, outputRange: [8, 22, 8], extrapolate: 'clamp' });
            const opacity = scrollX.interpolate({ inputRange: range, outputRange: [0.25, 1, 0.25], extrapolate: 'clamp' });
            return <Animated.View key={s.key} style={[styles.dot, { width: w, opacity }]} />;
          })}
        </View>
        <Button
          title={index === 0 || last ? t('auth.welcome.getStarted') : t('common.next')}
          icon="arrow-forward"
          iconPosition="right"
          onPress={next}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  topBar: {
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  // 44pt tall targets (the old ones were text-sized with a hitSlop).
  topAction: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, minHeight: 44, paddingHorizontal: spacing.sm },
  languageText: { color: colors.primary, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  skip: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  // Photo + words centred in the space above the dots, not stuck to the top over a white gap.
  slide: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  photo: { width: '100%', aspectRatio: 1080 / 640, borderRadius: radius.lg },
  photoInner: { flex: 1, padding: spacing.lg },
  copyScroll: { flexGrow: 0, flexShrink: 1 },
  copy: { gap: spacing.sm, paddingHorizontal: spacing.xs, paddingTop: spacing.lg },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  body: { fontSize: 16, lineHeight: 23, color: colors.textMuted },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
