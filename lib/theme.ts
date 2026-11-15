/**
 * Shared design tokens, aligned with the web app's brand teal (globals.css
 * --brand-teal*). `primary` is the darker teal so white text on buttons
 * passes contrast; `accent` is the brighter brand teal for marks and fills.
 */
export const colors = {
  background: '#F5F8F9',
  surface: '#FFFFFF',
  surfaceMuted: '#F7FAFA',
  border: '#DCE3E8',
  text: '#0B2136',
  textMuted: '#5B6B7A',
  primary: '#0A7F7E',
  primaryPressed: '#086362',
  primaryText: '#FFFFFF',
  primarySoft: '#E3F6F5',
  /** Teal for text/icons sitting on primarySoft: 6.3:1 there (primary is only 4.3:1). */
  primaryOnSoft: '#086362',
  accent: '#0EA5A4',
  danger: '#B3261E',
  dangerSoft: '#FBE9E7',
  success: '#0A7F7E',
  warning: '#8A5A00',
  warningSoft: '#FFF4DC',
  slateSoft: '#EAF0F5',
  slate: '#4A6684',
  /** The scrim under Home's photos (the same ink as `text`): white text on it is 16:1. */
  navy: '#0B2136',
  /** Secondary text on navy or on a photo's navy foot: 9.6:1. */
  onNavyMuted: '#A9BCCF',
  /** Hairlines and outline buttons on navy (the next-appointment card). */
  navyLine: '#24405C',
  /** Dimmed page behind a centred sheet (the check-in QR): navy at 55%. */
  backdrop: 'rgba(11,33,54,0.55)',
  /** Outline of the eMCR renewal card, a step darker than `warningSoft`. */
  warningLine: '#F1D9A6',
  /** Fill of the eMCR renewal card: lighter than `warningSoft`, so its tile still shows. */
  warningTint: '#FFFBF2',
  /** Unread-count dot on the header bell: white 10pt text on it is 4.5:1 (the lighter #E5484D was 3.9:1). */
  badgeRed: '#D93036',
  /** A day that can't be booked in the date picker: faint on purpose (it is also struck through). */
  textDisabled: '#B8C3CC',
  /** Filled rating stars (visit feedback). */
  star: '#E0A400',
  /** Dimmed page behind a bottom sheet (language picker): a darker navy at 45%. */
  sheetBackdrop: 'rgba(6, 24, 38, 0.45)',
  /** The quick tour's dark layer around the highlighted control. */
  tourScrim: 'rgba(6, 24, 38, 0.72)',
  /** Camera screens (QR scanner): black page, white text and frame, black scrims for legibility over video. */
  black: '#000000',
  white: '#FFFFFF',
  cameraScrim: 'rgba(0,0,0,0.55)',
  cameraScrimStrong: 'rgba(0,0,0,0.6)',
};

/**
 * Font sizes, named after the sizes the screens already use most: a screen's big title (28), a
 * card or empty-state heading (20), a section heading (17), button text (16), body copy (15), labels and buttons'
 * secondary text (14), meta lines (13) and small print (12). New and touched styles use these;
 * older styles still carry raw numbers.
 */
export const typography = {
  title: 28,
  heading: 20,
  section: 17,
  button: 16,
  body: 15,
  label: 14,
  caption: 13,
  small: 12,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
};
