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
        /* Aurora violet brand scale — Calon booking */
        brand: {
          50:  '#F5F1FF',
          100: '#ECE3FF',
          200: '#D4C5FF',
          300: '#B8A0FF',
          400: '#8A5CFF',  /* electric purple */
          500: '#6D4CFF',  /* primary violet  */
          600: '#5B3EDB',
          700: '#4830B5',
          800: '#38248F',
          900: '#281B6B',
          950: '#1A1245',
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
