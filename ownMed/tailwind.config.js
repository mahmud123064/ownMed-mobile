/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  corePlugins: {
    // Weights are separate font files in React Native, so Tailwind's
    // `fontWeight` utilities are remapped to families below instead.
    fontWeight: false,
  },
  theme: {
    extend: {
      fontFamily: {
        // Inter — primary body font. Each weight is a distinct family in RN.
        sans: ['Inter_400Regular'],
        'sans-medium': ['Inter_500Medium'],
        'sans-semibold': ['Inter_600SemiBold'],
        'sans-bold': ['Inter_700Bold'],
        // Manrope — optional accent / display font for headings.
        display: ['Manrope_600SemiBold'],
        'display-bold': ['Manrope_700Bold'],
        'display-extrabold': ['Manrope_800ExtraBold'],
      },
      colors: {
        // OwnMed brand — clinical teal.
        brand: {
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
        },
        // Semantic tokens — driven by CSS variables in global.css so the
        // light/dark palettes swap without touching component classes.
        background: 'rgb(var(--color-background) / <alpha-value>)',
        surface: 'rgb(var(--color-surface) / <alpha-value>)',
        'surface-muted': 'rgb(var(--color-surface-muted) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
        muted: 'rgb(var(--color-muted) / <alpha-value>)',
        // Fixed status colors for clinical states.
        success: '#16a34a',
        warning: '#f59e0b',
        danger: '#dc2626',
        info: '#0284c7',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [
    // `font-medium` / `font-semibold` / `font-bold` normally set `fontWeight`,
    // which does nothing for separate weight files in React Native. Map them
    // to the matching Inter family instead so existing classes "just work".
    function ({ addUtilities }) {
      addUtilities({
        '.font-medium': { fontFamily: 'Inter_500Medium' },
        '.font-semibold': { fontFamily: 'Inter_600SemiBold' },
        '.font-bold': { fontFamily: 'Inter_700Bold' },
      });
    },
  ],
};
