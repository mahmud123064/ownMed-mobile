/**
 * Raw color values for the handful of places that cannot take a Tailwind
 * className — React Navigation screen options, StatusBar, and inline SVG
 * props on Lucide icons.
 *
 * Keep these in sync with the CSS variables in `global.css`; that file is the
 * source of truth for anything styled with `className`.
 */
export const brand = {
  50: '#effefb',
  100: '#c8fff2',
  200: '#91fee6',
  300: '#52f6d7',
  400: '#1fe3c4',
  500: '#06c7ab',
  600: '#00a08c',
  700: '#058072',
  800: '#0a655c',
  900: '#0d544d',
  950: '#00332f',
} as const;

export const status = {
  success: '#16a34a',
  warning: '#f59e0b',
  danger: '#dc2626',
  info: '#0284c7',
} as const;

export type ThemeColors = {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  foreground: string;
  muted: string;
};

export const lightTheme: ThemeColors = {
  background: '#f8fafc',
  surface: '#ffffff',
  surfaceMuted: '#f1f5f9',
  border: '#e2e8f0',
  foreground: '#0f172a',
  muted: '#64748b',
};

export const darkTheme: ThemeColors = {
  background: '#080f16',
  surface: '#111a24',
  surfaceMuted: '#1e2936',
  border: '#283544',
  foreground: '#f1f5f9',
  muted: '#94a3b8',
};
