import { createContext, ReactNode, RefObject, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { router, usePathname } from 'expo-router';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import { getTourSeen, setTourSeen } from '@/lib/storage';
import { colors, radius, spacing } from '@/lib/theme';

/**
 * First-run coach marks over the patient home screen. Screens mark what the
 * tour points at with <TourTarget id>; the overlay measures the target when its
 * step comes up, so scrolling or late layout never leaves a stale spotlight.
 */

type TourId = 'home-book' | 'home-shortcuts' | 'bell' | 'tab-appointments' | 'tab-queue' | 'tab-results' | 'tab-more';

type Step = {
  target: TourId;
  title: string;
  body: string;
  /** Tab icons are small; their spotlight grows to cover the icon and label. */
  shape?: 'tab';
};

const STEPS: Step[] = [
  {
    target: 'home-book',
    title: 'Book in a few taps',
    body: 'Choose a doctor and a time that works for you. Your clinic confirms it here in the app.',
  },
  {
    target: 'home-shortcuts',
    title: 'Shortcuts',
    body: 'Jump straight to your appointments, queue number, results and prescriptions.',
  },
  {
    target: 'bell',
    title: 'Notifications',
    body: 'Reminders, new lab results, payment updates and clinic announcements arrive here.',
  },
  {
    target: 'tab-appointments',
    shape: 'tab',
    title: 'Appointments',
    body: 'See upcoming and past visits, and reschedule or cancel when plans change.',
  },
  {
    target: 'tab-queue',
    shape: 'tab',
    title: 'Live queue',
    body: 'On visit day, follow your queue number and how many patients are ahead of you.',
  },
  {
    target: 'tab-results',
    shape: 'tab',
    title: 'Results',
    body: 'Lab results and imaging reports appear as soon as your clinic releases them.',
  },
  {
    target: 'tab-more',
    shape: 'tab',
    title: 'Everything else',
    body: 'Prescriptions, billing, documents and your profile. You can replay this tour from here anytime.',
  },
];

const HOME = '/patient/home';

type Ctx = {
  register: (id: TourId, ref: RefObject<View | null>) => () => void;
  /** Replay the tour: returns to Home and starts once it's on screen. */
  replay: () => void;
};

const TourContext = createContext<Ctx | null>(null);

export function useTour(): Ctx {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used inside <TourProvider>');
  return ctx;
}

/** Marks a view the tour can spotlight. Renders a plain wrapper View. */
export function TourTarget({ id, children, style }: { id: TourId; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const ctx = useContext(TourContext);
  const ref = useRef<View>(null);
  useEffect(() => ctx?.register(id, ref), [ctx, id]);
  return (
    <View ref={ref} collapsable={false} style={style}>
      {children}
    </View>
  );
}

type Box = { x: number; y: number; width: number; height: number };

function measure(ref: RefObject<View | null>): Promise<Box | null> {
  return new Promise((resolve) => {
    if (!ref.current) return resolve(null);
    ref.current.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null));
  });
}

export function TourProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Several mounted screens can render the same target (every tab has an AppHeader bell).
  const targets = useRef(new Map<TourId, Set<RefObject<View | null>>>());
  const [pending, setPending] = useState(false);
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    getTourSeen()
      .then((seen) => !seen && setPending(true))
      .catch(() => {});
  }, []);

  // Start only once Home is the visible screen, after its layout settles.
  useEffect(() => {
    if (!pending || pathname !== HOME) return;
    const t = setTimeout(() => {
      setPending(false);
      setStep(0);
    }, 700);
    return () => clearTimeout(t);
  }, [pending, pathname]);

  const register = useCallback<Ctx['register']>((id, ref) => {
    const set = targets.current.get(id) ?? new Set();
    set.add(ref);
    targets.current.set(id, set);
    return () => {
      set.delete(ref);
    };
  }, []);

  const replay = useCallback(() => {
    setStep(null);
    if (pathname !== HOME) router.navigate(HOME);
    setPending(true);
  }, [pathname]);

  const finish = useCallback(() => {
    setStep(null);
    setTourSeen().catch(() => {});
  }, []);

  const value = useMemo(() => ({ register, replay }), [register, replay]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {step !== null ? (
        <TourOverlay
          step={step}
          locate={async (id) => {
            for (const ref of targets.current.get(id) ?? []) {
              const box = await measure(ref);
              if (box) return box;
            }
            return null;
          }}
          onStep={setStep}
          onFinish={finish}
        />
      ) : null}
    </TourContext.Provider>
  );
}

const CARD_GAP = 14;
const EDGE = spacing.md;

function TourOverlay({
  step,
  locate,
  onStep,
  onFinish,
}: {
  step: number;
  locate: (id: TourId) => Promise<Box | null>;
  onStep: (i: number) => void;
  onFinish: () => void;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const rootRef = useRef<View>(null);
  const [hole, setHole] = useState<Box | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  const next = useCallback(() => (last ? onFinish() : onStep(step + 1)), [last, onFinish, onStep, step]);

  useEffect(() => {
    let cancelled = false;
    fade.setValue(0);
    setHole(null);
    (async () => {
      const [target, origin] = await Promise.all([locate(current.target), measure(rootRef)]);
      if (cancelled) return;
      // A target that isn't on screen (still loading, or Home is scrolled) is skipped, not shown empty.
      if (!target || target.y + target.height < 0 || target.y > H) return next();
      // Window coords → overlay coords, whatever the platform's status-bar handling.
      const box = { ...target, x: target.x - (origin?.x ?? 0), y: target.y - (origin?.y ?? 0) };
      setHole(current.shape === 'tab' ? tabHole(box, W) : pad(box, 8));
      Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      AccessibilityInfo.announceForAccessibility(`${current.title}. ${current.body}`);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onFinish();
      return true;
    });
    return () => sub.remove();
  }, [onFinish]);

  const below = hole ? hole.y + hole.height / 2 < H / 2 : true;
  const cardW = W - EDGE * 2;
  const arrowX = hole ? Math.min(Math.max(hole.x + hole.width / 2 - EDGE - 9, 20), cardW - 38) : 0;

  return (
    <View ref={rootRef} collapsable={false} style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <Mask id="tour-hole" x="0" y="0" width={W} height={H} maskUnits="userSpaceOnUse">
            <Rect x={0} y={0} width={W} height={H} fill="#FFFFFF" />
            {hole ? <Rect x={hole.x} y={hole.y} width={hole.width} height={hole.height} rx={radius.lg} fill="#000000" /> : null}
          </Mask>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill="rgba(6, 24, 38, 0.72)" mask="url(#tour-hole)" />
        {hole ? (
          <Rect
            x={hole.x - 2}
            y={hole.y - 2}
            width={hole.width + 4}
            height={hole.height + 4}
            rx={radius.lg + 2}
            fill="none"
            stroke={colors.accent}
            strokeWidth={2.5}
          />
        ) : null}
      </Svg>

      {hole ? (
        <Animated.View
          style={[
            styles.card,
            { width: cardW, opacity: fade },
            below ? { top: hole.y + hole.height + CARD_GAP } : { bottom: H - hole.y + CARD_GAP },
          ]}
        >
          <View style={[styles.arrow, { left: arrowX }, below ? styles.arrowTop : styles.arrowBottom]} />
          <Text style={styles.count}>
            {step + 1} of {STEPS.length}
          </Text>
          <Text style={styles.title} accessibilityRole="header">
            {current.title}
          </Text>
          <Text style={styles.body}>{current.body}</Text>

          <View style={styles.actions}>
            {!last ? (
              <Pressable onPress={onFinish} hitSlop={10} accessibilityRole="button" accessibilityLabel="Skip tour">
                <Text style={styles.skip}>Skip</Text>
              </Pressable>
            ) : (
              <View />
            )}
            <View style={styles.navs}>
              {step > 0 ? (
                <Pressable
                  onPress={() => onStep(step - 1)}
                  style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.btnText, { color: colors.primaryOnSoft }]}>Back</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={next}
                style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={[styles.btnText, { color: colors.primaryText }]}>{last ? 'Done' : 'Next'}</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

function pad(b: Box, p: number): Box {
  return { x: b.x - p, y: b.y - p, width: b.width + p * 2, height: b.height + p * 2 };
}

/** Grow a tab icon's box to the whole tab: icon plus the label underneath. */
function tabHole(icon: Box, screenW: number): Box {
  const width = Math.min(screenW / 5 - 4, 84);
  const cx = icon.x + icon.width / 2;
  return { x: cx - width / 2, y: icon.y - 8, width, height: icon.height + 34 };
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: EDGE,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md + 2,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  arrow: {
    position: 'absolute',
    width: 18,
    height: 18,
    backgroundColor: colors.surface,
    transform: [{ rotate: '45deg' }],
    borderRadius: 3,
  },
  arrowTop: { top: -7 },
  arrowBottom: { bottom: -7 },
  count: { fontSize: 12, fontWeight: '700', color: colors.primary, letterSpacing: 0.4, textTransform: 'uppercase' },
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 4, letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 21, color: colors.textMuted, marginTop: 6 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md + 2 },
  skip: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  navs: { flexDirection: 'row', gap: spacing.sm },
  btn: { minHeight: 44, minWidth: 84, paddingHorizontal: spacing.md + 2, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: colors.primary },
  btnGhost: { backgroundColor: colors.primarySoft },
  btnText: { fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.85 },
});
