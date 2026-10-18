import { useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { useAuth } from '@/lib/auth';
import { setWelcomeSeen } from '@/lib/storage';
import { colors, radius, spacing } from '@/lib/theme';
import { BrandLogo } from '@/components/BrandLogo';
import { Button } from '@/components/ui';

type Slide = {
  key: string;
  title: string;
  body: string;
  Art: (p: { size: number }) => React.ReactElement;
};

const SLIDES: Slide[] = [
  {
    key: 'intro',
    title: 'Your Health\nin One Place',
    body: 'Manage your appointments, medical records, prescriptions, and more — anytime, anywhere.',
    Art: IntroArt,
  },
  {
    key: 'appointments',
    title: 'Book and Manage\nAppointments',
    body: 'Schedule, reschedule, or cancel your clinic appointments with ease.',
    Art: AppointmentsArt,
  },
  {
    key: 'records',
    title: 'Access Your\nMedical Records',
    body: 'View your lab results, prescriptions, medical history, and important documents all in one secure place.',
    Art: RecordsArt,
  },
  {
    key: 'notify',
    title: 'Stay Informed',
    body: 'Receive notifications, payment updates, and important announcements from your clinic.',
    Art: NotifyArt,
  },
];

/** First-launch intro carousel, then on to sign-in. */
export default function WelcomeScreen() {
  const { signedIn } = useAuth();
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const [index, setIndex] = useState(0);

  if (signedIn) return <Redirect href="/patient/home" />;

  // Keep the art from crowding the copy on short phones.
  const artSize = Math.min(width - spacing.lg * 2, height * 0.4, 340);
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
        {index > 0 ? (
          <Pressable onPress={finish} hitSlop={12} accessibilityRole="button" accessibilityLabel="Skip intro">
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        ) : null}
      </View>

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
            {i === 0 ? (
              <View style={styles.introHead}>
                <BrandLogo size="md" />
                <Text style={[styles.title, styles.center, styles.introTitle]} accessibilityRole="header">
                  {item.title}
                </Text>
                <Text style={[styles.body, styles.center]}>{item.body}</Text>
              </View>
            ) : (
              <View>
                <Text style={styles.title} accessibilityRole="header">
                  {item.title}
                </Text>
                <Text style={styles.body}>{item.body}</Text>
              </View>
            )}
            <View style={styles.artWrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={{ width: artSize, height: artSize, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: ART, height: ART, transform: [{ scale: artSize / ART }] }}>
                  <item.Art size={ART} />
                </View>
              </View>
            </View>
          </View>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${SLIDES.length}`}>
          {SLIDES.map((s, i) => {
            const range = [(i - 1) * width, i * width, (i + 1) * width];
            const w = scrollX.interpolate({ inputRange: range, outputRange: [8, 22, 8], extrapolate: 'clamp' });
            const opacity = scrollX.interpolate({ inputRange: range, outputRange: [0.25, 1, 0.25], extrapolate: 'clamp' });
            return <Animated.View key={s.key} style={[styles.dot, { width: w, opacity }]} />;
          })}
        </View>
        <Button
          title={index === 0 || last ? 'Get Started' : 'Next'}
          icon="arrow-forward"
          iconPosition="right"
          onPress={next}
        />
      </View>
    </SafeAreaView>
  );
}

// ---- Illustrations ---------------------------------------------------------
// Drawn in code so they stay crisp, theme-aligned and need no image assets.

/** Art is laid out on a fixed canvas and scaled, so card text never reflows on small phones. */
const ART = 320;

const SKIN = '#F6C3A5';
const SKIN_SHADE = '#E8A88A';
const HAIR = '#1E2A44';

function Blob({ size, color = colors.primarySoft }: { size: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" style={StyleSheet.absoluteFill}>
      <Path
        d="M50 6c18 0 36 8 42 25s1 33-7 46-24 20-38 17S16 84 10 70 2 38 12 24 32 6 50 6z"
        fill={color}
      />
    </Svg>
  );
}

function FloatTile({
  children,
  style,
  bg = colors.surface,
}: {
  children: React.ReactNode;
  style: object;
  bg?: string;
}) {
  return <View style={[styles.floatTile, { backgroundColor: bg }, style]}>{children}</View>;
}

function IntroArt({ size }: { size: number }) {
  const s = size;
  const tile = s * 0.2;
  return (
    <View style={{ width: s, height: s }}>
      <Blob size={s} />
      <FloatTile style={{ width: tile, height: tile, left: s * 0.02, top: s * 0.12 }}>
        <Ionicons name="calendar-outline" size={tile * 0.48} color={colors.primary} />
      </FloatTile>
      <FloatTile style={{ width: tile, height: tile, right: s * 0.1, top: s * 0.02 }}>
        <Ionicons name="document-text-outline" size={tile * 0.48} color={colors.primary} />
      </FloatTile>
      <FloatTile bg="#E9F7EF" style={{ width: tile, height: tile, right: 0, top: s * 0.36 }}>
        <MaterialCommunityIcons name="pill" size={tile * 0.5} color="#1F9D62" />
      </FloatTile>
      <Svg width={s} height={s} viewBox="0 0 240 240">
        {/* hair, back */}
        <Path d="M70 122C60 72 86 40 120 40c36 0 60 30 52 84-3 30 4 60 12 82H58c8-24 16-52 12-84z" fill={HAIR} />
        {/* neck + shirt */}
        <Rect x={107} y={138} width={26} height={48} rx={11} fill={SKIN_SHADE} />
        <Path d="M42 240c2-44 34-68 78-68s76 24 78 68z" fill={colors.accent} />
        <Path d="M105 173q15 16 30 0z" fill={SKIN_SHADE} />
        {/* face */}
        <Ellipse cx={86} cy={118} rx={7} ry={10} fill={SKIN_SHADE} />
        <Ellipse cx={120} cy={112} rx={34} ry={40} fill={SKIN} />
        <Path d="M84 104c2-32 22-46 42-44 26 2 36 22 30 42-14-14-34-20-52-16-8 3-14 10-20 18z" fill={HAIR} />
        <Path d="M101 106q7-4 13 0M128 106q7-4 13 0" stroke={HAIR} strokeWidth={2.4} strokeLinecap="round" fill="none" />
        <Circle cx={108} cy={117} r={3.4} fill={HAIR} />
        <Circle cx={134} cy={117} r={3.4} fill={HAIR} />
        <Circle cx={100} cy={129} r={6} fill="#F59C8B" opacity={0.35} />
        <Circle cx={142} cy={129} r={6} fill="#F59C8B" opacity={0.35} />
        <Path d="M111 134q10 8 20 0" stroke="#C0574A" strokeWidth={3} strokeLinecap="round" fill="none" />
        {/* forearm, phone, hand */}
        <Path d="M136 240c4-16 12-26 24-30l14 12c-10 6-16 12-18 18z" fill={SKIN} />
        <G transform="rotate(16 170 196)">
          <Rect x={152} y={160} width={38} height={66} rx={8} fill={colors.text} />
          <Rect x={156} y={166} width={30} height={52} rx={5} fill="#2C4766" />
        </G>
        <Ellipse cx={162} cy={214} rx={15} ry={12} fill={SKIN} />
        <Rect x={150} y={196} width={22} height={8} rx={4} fill={SKIN} transform="rotate(-20 161 200)" />
      </Svg>
    </View>
  );
}

function SkeletonLines({ widths = ['70%', '45%'] }: { widths?: `${number}%`[] }) {
  return (
    <View style={{ gap: 6, marginTop: 6 }}>
      {widths.map((w, i) => (
        <View key={i} style={[styles.line, { width: w }]} />
      ))}
    </View>
  );
}

function AppointmentsArt({ size }: { size: number }) {
  const s = size;
  const phoneW = s * 0.58;
  return (
    <View style={{ width: s, height: s }}>
      <Blob size={s} />
      {/* phone with calendar */}
      <View style={[styles.phone, { width: phoneW, height: s * 0.86, left: s * 0.16, top: s * 0.06 }]}>
        <View style={styles.phoneCam} />
        <View style={styles.calendar}>
          <View style={styles.calHeader}>
            <View style={[styles.calRing, { left: '22%' }]} />
            <View style={[styles.calRing, { right: '22%' }]} />
          </View>
          <View style={styles.calGrid}>
            {Array.from({ length: 15 }).map((_, i) =>
              i === 7 ? (
                <View key={i} style={[styles.calCell, styles.calCellOn]}>
                  <Ionicons name="checkmark" size={12} color="#fff" />
                </View>
              ) : (
                <View key={i} style={styles.calCell} />
              ),
            )}
          </View>
        </View>
      </View>
      {/* clock */}
      <View style={[styles.clock, { width: s * 0.24, height: s * 0.24, right: s * 0.1, top: 0 }]}>
        <Ionicons name="time-outline" size={s * 0.17} color={colors.primary} />
      </View>
      {/* patient card */}
      <View style={[styles.card, { width: s * 0.72, left: s * 0.08, bottom: s * 0.02 }]}>
        <View style={[styles.cardIcon, { backgroundColor: '#E6EEFB', borderRadius: 999 }]}>
          <Ionicons name="person" size={22} color="#2F5FB3" />
        </View>
        <View style={{ flex: 1 }}>
          <SkeletonLines widths={['75%', '90%', '55%']} />
        </View>
      </View>
    </View>
  );
}

type Row = { label: string; icon: React.ReactNode; bg: string; tint: string };

function RowCard({ row, chevron, compact }: { row: Row; chevron?: boolean; compact?: boolean }) {
  return (
    <View style={[styles.rowCard, compact && styles.rowCardCompact, { backgroundColor: row.tint }]}>
      <View style={[styles.cardIcon, compact && styles.cardIconCompact, { backgroundColor: row.bg }]}>{row.icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, compact && styles.rowLabelCompact]} numberOfLines={1}>
          {row.label}
        </Text>
        <SkeletonLines widths={compact ? ['65%'] : ['70%', '40%']} />
      </View>
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null}
    </View>
  );
}

function RecordsArt({ size }: { size: number }) {
  const rows: Row[] = [
    { label: 'Lab Results', bg: colors.primarySoft, tint: '#F4FAFA', icon: <Ionicons name="flask-outline" size={20} color={colors.primary} /> },
    { label: 'Prescriptions', bg: '#E3F5EC', tint: '#F4FBF7', icon: <MaterialCommunityIcons name="pill" size={20} color="#1F9D62" /> },
    { label: 'Medical History', bg: '#EEEAFB', tint: '#F8F6FE', icon: <Ionicons name="document-text-outline" size={20} color="#5B47B0" /> },
    { label: 'Imaging Reports', bg: '#FDF1DC', tint: '#FEFAF2', icon: <Ionicons name="image-outline" size={20} color="#C26A00" /> },
  ];
  return (
    <View style={{ width: size, height: size, justifyContent: 'center' }}>
      <Blob size={size} />
      <View style={{ gap: size * 0.03, paddingHorizontal: size * 0.04 }}>
        {rows.map((r) => (
          <RowCard key={r.label} row={r} chevron />
        ))}
      </View>
    </View>
  );
}

function NotifyArt({ size }: { size: number }) {
  const s = size;
  const rows: Row[] = [
    { label: 'Appointment Reminder', bg: '#E6EEFB', tint: colors.surface, icon: <Ionicons name="calendar-outline" size={18} color="#2F5FB3" /> },
    { label: 'Lab Result Available', bg: '#E3F5EC', tint: colors.surface, icon: <Ionicons name="document-text-outline" size={18} color="#1F9D62" /> },
    { label: 'Payment Update', bg: '#FDF1DC', tint: colors.surface, icon: <Ionicons name="card-outline" size={18} color="#C26A00" /> },
    { label: 'Clinic Announcement', bg: '#EEEAFB', tint: colors.surface, icon: <Ionicons name="megaphone-outline" size={18} color="#5B47B0" /> },
  ];
  return (
    <View style={{ width: s, height: s }}>
      <Blob size={s} />
      {/* phone top with bell */}
      <View style={[styles.phone, styles.phoneTop, { width: s * 0.52, height: s * 0.34, left: s * 0.24 }]}>
        <View style={styles.bellHalo}>
          <Ionicons name="notifications" size={s * 0.13} color={colors.primary} />
          <View style={styles.badge}>
            <Text style={styles.badgeText}>1</Text>
          </View>
        </View>
      </View>
      <View style={[styles.ray, { left: s * 0.14, top: s * 0.12, transform: [{ rotate: '35deg' }] }]} />
      <View style={[styles.ray, { left: s * 0.12, top: s * 0.21 }]} />
      <View style={[styles.ray, { right: s * 0.14, top: s * 0.12, transform: [{ rotate: '-35deg' }] }]} />
      <View style={[styles.ray, { right: s * 0.12, top: s * 0.21 }]} />
      <View style={{ position: 'absolute', top: s * 0.28, left: s * 0.06, right: s * 0.06, gap: s * 0.022 }}>
        {rows.map((r) => (
          <RowCard key={r.label} row={r} compact />
        ))}
      </View>
    </View>
  );
}

const shadow = {
  shadowColor: colors.text,
  shadowOpacity: 0.08,
  shadowRadius: 14,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  topBar: { height: 44, paddingHorizontal: spacing.lg, alignItems: 'flex-end', justifyContent: 'center' },
  skip: { color: colors.primary, fontSize: 15, fontWeight: '600' },
  slide: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  introHead: { alignItems: 'center', marginTop: -spacing.sm },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  introTitle: { marginTop: spacing.lg },
  body: { fontSize: 15, lineHeight: 22, color: colors.textMuted, marginTop: spacing.sm + 2 },
  center: { textAlign: 'center' },
  artWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.lg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { height: 8, borderRadius: 4, backgroundColor: colors.primary },

  floatTile: { position: 'absolute', borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', zIndex: 2, ...shadow },
  phone: {
    position: 'absolute',
    borderWidth: 6,
    borderColor: '#1D4F5F',
    borderRadius: 26,
    backgroundColor: colors.surface,
    padding: spacing.sm + 2,
    overflow: 'hidden',
  },
  phoneTop: { top: 0, borderBottomWidth: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0, alignItems: 'center', justifyContent: 'center' },
  phoneCam: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#B8C3CC', marginBottom: spacing.sm },
  calendar: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#F7FAFA', ...shadow },
  calHeader: { height: 34, backgroundColor: colors.primary },
  calRing: { position: 'absolute', top: -6, width: 6, height: 16, borderRadius: 3, backgroundColor: '#1D4F5F' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8, gap: 6, justifyContent: 'center' },
  calCell: { width: '15%', aspectRatio: 1, borderRadius: 4, backgroundColor: '#E8EEF1', alignItems: 'center', justifyContent: 'center' },
  calCellOn: { backgroundColor: colors.primary },
  clock: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow,
  },
  card: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md - 2,
    ...shadow,
  },
  cardIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  line: { height: 6, borderRadius: 3, backgroundColor: '#E3EAEE' },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    borderRadius: radius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md - 4,
    ...shadow,
  },
  rowCardCompact: { paddingVertical: 7 },
  cardIconCompact: { width: 34, height: 34, borderRadius: 10 },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowLabelCompact: { fontSize: 13 },
  bellHalo: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 12,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#D93036',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  ray: { position: 'absolute', width: 14, height: 3, borderRadius: 2, backgroundColor: colors.accent },
});
