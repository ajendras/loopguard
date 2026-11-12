import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          500: '#a855f7',
          600: '#9333ea',
        },
        accent: {
          400: '#f472b6',
          500: '#db2777',
        },
        glass: {
          light: 'rgba(255, 255, 255, 0.12)',
          border: 'rgba(255, 255, 255, 0.18)',
          highlight: 'rgba(255, 255, 255, 0.25)',
          dark: 'rgba(15, 23, 42, 0.45)',
        },
        mesh: {
          start: '#a855f7',
          mid: '#f472b6',
          end: '#67e8f9',
        },
      },
      borderRadius: {
        'glass': '24px',
        'glass-xl': '32px',
      },
      backdropBlur: {
        'glass': '24px',
        'glass-heavy': '32px',
      },
      boxShadow: {
        'glass': '0 8px 32px -6px rgb(168 85 247 / 0.2), 0 4px 12px -2px rgb(244 114 182 / 0.15)',
        'glass-inner': 'inset 0 1px 0 0 rgba(255,255,255,0.25), inset 0 -1px 0 0 rgba(255,255,255,0.08)',
      },
      backgroundImage: {
        'gradient-mesh': 'linear-gradient(135deg, #a855f7 0%, #f472b6 45%, #67e8f9 90%)',
        'gradient-mesh-soft': 'radial-gradient(circle at 30% 20%, rgba(168, 85, 247, 0.35) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(244, 114, 182, 0.35) 0%, transparent 50%), linear-gradient(135deg, #a855f7 0%, #f472b6 50%, #67e8f9 100%)',
      },
      animation: {
        'spring-pop': 'springPop 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'fade-slide': 'fadeSlide 0.3s ease-out forwards',
      },
      keyframes: {
        springPop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '50%': { transform: 'scale(1.08)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        fadeSlide: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
