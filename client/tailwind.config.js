/** Colours come from CSS variables set by the published theme (see src/lib/theme.ts). */
const c = (v) => `rgb(var(--c-${v}) / <alpha-value>)`;
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: c('primary'),
        secondary: c('secondary'),
        accent: c('accent'),
        bg: c('background'),
        surface: c('surface'),
        'surface-2': c('surface-2'),
        ink: c('text'),
        muted: c('muted'),
        line: c('border'),
        contrast: c('contrast'),
        'on-contrast': c('on-contrast'),
        'on-primary': c('on-primary'),
        success: c('success'),
        warning: c('warning'),
        danger: c('danger'),
        // Fixed admin palette (the dashboard does not change with the public theme)
        adm: {
          bg: '#F6F4F0',
          panel: '#FFFFFF',
          line: '#E7E2D9',
          ink: '#1B1916',
          muted: '#716B61',
          gold: '#A98A4E',
          dark: '#141312',
        },
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'Georgia', 'serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        admin: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: { theme: 'var(--radius)', btn: 'var(--btn-radius)' },
      maxWidth: { site: '84rem' },
      spacing: { section: 'var(--section-y)' },
      transitionTimingFunction: { lux: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      keyframes: {
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
        kenburns: { from: { transform: 'scale(1.0)' }, to: { transform: 'scale(1.12)' } },
      },
      animation: { marquee: 'marquee 40s linear infinite', kenburns: 'kenburns 14s ease-out forwards' },
    },
  },
  plugins: [],
};
