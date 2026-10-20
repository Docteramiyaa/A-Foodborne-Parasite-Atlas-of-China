/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: '#E8E1CC',
          deep: '#D9D0B8',
          light: '#F2EBD9',
        },
        ink: {
          DEFAULT: '#25362D',
          soft: '#455146',
          muted: '#68705F',
          faint: '#7B7E6B',
        },
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
          DEFAULT: '#B3AA93',
          soft: '#CBC2AA',
          strong: '#8F8875',
        },
      },
      fontFamily: {
        sans: ['"Noto Sans SC Variable"', '"Noto Sans SC"', 'PingFang SC', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        serif: ['"Noto Serif SC Variable"', '"Noto Serif SC"', 'STSong', 'SimSun', 'Songti SC', 'Georgia', 'serif'],
        kai: ['"STKaiti"', '"KaiTi"', '"Kaiti SC"', '"Noto Serif SC"', 'serif'],
        mono: ['"JetBrains Mono"', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
        'display-sm': ['clamp(2rem, 3.4vw, 2.75rem)', { lineHeight: '1.15', letterSpacing: '0.01em' }],
        'display-md': ['clamp(2.5rem, 4.6vw, 3.75rem)', { lineHeight: '1.12', letterSpacing: '0.015em' }],
        'display-lg': ['clamp(3rem, 6vw, 5.25rem)', { lineHeight: '1.06', letterSpacing: '0.02em' }],
      },
      boxShadow: {
        card: '0 1px 0 rgba(37, 54, 45, 0.08), 5px 5px 0 rgba(37, 54, 45, 0.055)',
        lift: '0 10px 24px -18px rgba(37, 54, 45, 0.32), 9px 9px 0 rgba(37, 54, 45, 0.06)',
        insetline: 'inset 0 0 0 1px rgba(37, 54, 45, 0.08)',
      },
      borderRadius: {
        xl2: '0.375rem',
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
