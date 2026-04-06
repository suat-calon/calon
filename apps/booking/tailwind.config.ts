import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        /* Teal / Cyan brand scale — Calon booking */
        brand: {
          50:  '#ECFEFF',
          100: '#CFFAFE',
          200: '#A5F3FC',
          300: '#67E8F9',
          400: '#22D3EE',  /* bright cyan     */
          500: '#06B6D4',  /* cyan-500        */
          600: '#0891B2',  /* primary teal    */
          700: '#0E7490',
          800: '#155E75',
          900: '#164E63',
          950: '#083344',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      backdropBlur: {
        xs: '4px',
      },
    },
  },
  plugins: [],
};

export default config;
