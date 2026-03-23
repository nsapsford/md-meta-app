import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        md: {
          bg: '#0a0e1a',
          surface: '#131829',
          surfaceHover: '#1a2035',
          border: '#2a3050',
          gold: '#c9a84c',
          blue: '#3d7eff',
          purple: '#7c5cfc',
          orange: '#ff8c38',
          green: '#38c96e',
          red: '#ff4757',
          text: '#e8eaf0',
          textMuted: '#8892a8',
        },
        tier: {
          '0': '#ff2d55',
          '1': '#ff8c38',
          '2': '#ffd60a',
          '3': '#38c96e',
          rogue: '#8892a8',
        },
        rarity: {
          ur: '#7c5cfc',
          sr: '#ff8c38',
          r: '#3d7eff',
          n: '#8892a8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
