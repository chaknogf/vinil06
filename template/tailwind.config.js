/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{html,js,ts,jsx,tsx,vue}'],
  theme: {
    extend: {
      colors: {
        bg: '#0b0d14',
        'bg-deep': '#090b10',
        surface: 'rgba(17, 21, 32, 0.78)',
        'surface-solid': '#111520',
        'surface-2': '#161c29',
        'surface-deep': '#0c0f1a',
        'surface-card': '#121726',
        border: 'rgba(255, 255, 255, 0.08)',
        'border-strong': 'rgba(255, 255, 255, 0.16)',
        text: '#f8fafc',
        muted: '#9aa7b8',
        dim: '#94a3b8',
        accent: '#34d399',
        'accent-strong': '#10b981',
        indigo: '#a5b4fc',
        amber: '#fbbf24',
        danger: '#fb7185',
        violet: '#a855f7',
        cyan: '#38bdf8',
        rose: '#f43f5e',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      borderRadius: {
        sm: '10px',
        md: '16px',
        lg: '24px',
      },
      boxShadow: {
        1: '0 6px 18px rgba(0, 0, 0, 0.35)',
        2: '0 18px 48px rgba(0, 0, 0, 0.45)',
      },
      transitionTimingFunction: {
        vinil: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      animation: {
        'spin-vinyl': 'spinVinyl 3.2s linear infinite',
        'pulse-urgent': 'pulseUrgent 0.45s ease-in-out infinite',
        'float-in': 'floatIn 260ms cubic-bezier(0.22,1,0.36,1) both',
        'result-pop': 'resultPop 260ms cubic-bezier(0.22,1,0.36,1) both',
        'dot-pulse': 'dotPulse 1.6s ease-in-out infinite',
      },
      keyframes: {
        spinVinyl: { from: { transform: 'rotate(0deg)' }, to: { transform: 'rotate(360deg)' } },
        pulseUrgent: { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.03)' } },
        floatIn: { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        resultPop: { from: { opacity: '0', transform: 'translateY(6px) scale(0.98)' }, to: { opacity: '1', transform: 'translateY(0) scale(1)' } },
        dotPulse: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.35' } },
      },
    },
  },
  plugins: [],
};
