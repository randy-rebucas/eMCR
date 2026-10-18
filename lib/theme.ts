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
};

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
