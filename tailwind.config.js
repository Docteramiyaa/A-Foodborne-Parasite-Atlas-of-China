/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#F7F9FC',
          deep: '#EAF0F7',
          light: '#FFFFFF',
        },
        ink: {
          DEFAULT: '#182C46',
          soft: '#40556F',
          muted: '#596D85',
          faint: '#63768D',
        },
        blue: {
          950: '#102D50', 900: '#124579', 800: '#165DAD', 700: '#165DAD',
          600: '#2071CE', 500: '#2581E7', 400: '#65A7EE', 300: '#99C7F6',
          200: '#C3E0FF', 100: '#E5F1FF', 50: '#F0F7FF',
        },
        pink: { DEFAULT: '#F29DAA', 50: '#FFF4F6', 100: '#FCE3E8', 200: '#F7C5CF', 500: '#F29DAA' },
        butter: { DEFAULT: '#FFF8C4', light: '#FFFDF0' },
        jade: {
          950: '#1C2B23',
          900: '#263A30',
          800: '#3E5741',
          700: '#536C4D',
          600: '#637C5A',
          500: '#7E9470',
          400: '#9DAD8D',
          300: '#BEC8AC',
          200: '#D4D9C2',
          100: '#E4E3D1',
          50: '#EFEBDD',
        },
        ochre: {
          700: '#844E2C',
          600: '#9A6238',
          500: '#B07747',
          400: '#C18D5E',
          300: '#D3AA7B',
          200: '#E5C9A5',
          100: '#F0DFC9',
        },
        terracotta: {
          800: '#702A20',
          700: '#843428',
          600: '#9C3E2D',
          500: '#B0503B',
          400: '#C2755F',
          300: '#D6A18F',
          200: '#E7C5B8',
          100: '#F2DDD2',
        },
        line: {
          DEFAULT: '#DCE5EF',
          soft: '#EBF0F6',
          strong: '#B5C7DC',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans SC Variable"', '"Noto Sans SC"', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        serif: ['"Noto Serif SC Variable"', '"Noto Serif SC"', 'STSong', 'SimSun', 'Songti SC', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1.125rem' }],
        'display-sm': ['clamp(2rem, 3.4vw, 2.75rem)', { lineHeight: '1.15', letterSpacing: '0.01em' }],
        'display-md': ['clamp(2.5rem, 4.6vw, 3.75rem)', { lineHeight: '1.12', letterSpacing: '0.015em' }],
        'display-lg': ['clamp(3rem, 6vw, 5.25rem)', { lineHeight: '1.06', letterSpacing: '0.02em' }],
      },
      boxShadow: {
        card: '0 4px 24px -12px rgba(22, 93, 173, 0.16)',
        lift: '0 14px 38px -18px rgba(22, 93, 173, 0.24)',
        insetline: 'inset 0 0 0 1px rgba(22, 93, 173, 0.08)',
      },
      borderRadius: {
        xl2: '1.5rem',
      },
      maxWidth: {
        shell: '1280px',
        prose: '46rem',
      },
      transitionTimingFunction: {
        atlas: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        ripple: {
          '0%': { transform: 'scale(0.6)', opacity: '0.5' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.6s ease both',
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
