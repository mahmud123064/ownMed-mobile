import { useColorScheme } from 'nativewind';

import { darkTheme, lightTheme, type ThemeColors } from './colors';

export * from './colors';

export type AppTheme = {
  /** True when the active color scheme is dark. */
  isDark: boolean;
  /** Raw hex values, for navigation chrome and icon props. */
  colors: ThemeColors;
  /** Toggle between light and dark. Not wired to UI yet. */
  toggleColorScheme: () => void;
};

/**
 * Single entry point for theme-aware values.
 *
 * Styling should normally go through `className` (`bg-surface dark:bg-surface`)
 * since `global.css` already swaps the CSS variables. Reach for this hook only
 * when a raw color value is required.
 */
export function useAppTheme(): AppTheme {
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';

  return {
    isDark,
    colors: isDark ? darkTheme : lightTheme,
    toggleColorScheme,
  };
}
