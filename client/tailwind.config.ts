import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        md: {
          bg: '#09090b',
          surface: '#111113',
          surfaceAlt: '#18181b',
          surfaceHover: '#1c1c1f',
          border: '#27272a',
          borderLight: '#3f3f46',
          gold: '#d4af37',
          goldMuted: '#b8962e',
          blue: '#4a8eff',
          blueLight: '#6ba3ff',
          purple: '#8b6cff',
          orange: '#ff9147',
          green: '#34d399',
          red: '#ff4d5e',
          text: '#eceef4',
          textSecondary: '#a1a1aa',
          textMuted: '#71717a',
          winRate: '#34d399',
          playRate: '#94a3b8',
        },
        tier: {
          '0': '#ff2d55',
          '1': '#ff8c38',
          '2': '#ffd60a',
          '3': '#38c96e',
          rogue: '#6b7694',
        },
        rarity: {
          ur: '#8b6cff',
          sr: '#ff9147',
          r: '#4a8eff',
          n: '#6b7694',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'hero-glow': 'radial-gradient(ellipse at 50% 0%, rgba(74,142,255,0.08) 0%, transparent 60%)',
        'gold-glow': 'radial-gradient(ellipse at 50% 0%, rgba(212,175,55,0.06) 0%, transparent 50%)',
      },
      boxShadow: {
        'glow-blue': '0 0 20px rgba(74,142,255,0.15)',
        'glow-gold': '0 0 20px rgba(212,175,55,0.15)',
        'glow-purple': '0 0 20px rgba(139,108,255,0.15)',
        'card': '0 4px 24px rgba(0,0,0,0.4)',
        'card-hover': '0 12px 40px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.08)',
        'card-featured': '0 0 0 1px rgba(255,255,255,0.06), 0 12px 48px rgba(0,0,0,0.7)',
        'surface': '0 1px 3px rgba(0,0,0,0.3)',
        'surface-lg': '0 4px 16px rgba(0,0,0,0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
