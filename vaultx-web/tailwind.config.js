/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        void: '#050508',
        charcoal: '#0B0C10',
        well: '#07080B',
        // Green Shades
        cyberGreen: '#10B981',
        matrixGreen: '#22C55E',
        neonGreen: '#4ADE80',
        emeraldHover: '#059669',
        deepGreen: '#064E3B',
        // Red Shades
        crimson: '#EF4444',
        rubyRed: '#DC2626',
        scarletGlow: '#991B1B',
        bloodRed: '#7F1D1D',
        coralRed: '#F87171',
        // Light Theme Color System
        alabaster: '#F8FAFC',
        slateSurface: '#F1F5F9',
        charcoalHeading: '#0F172A',
        mutedSlate: '#475569',
        helperSlate: '#64748B',
      },
      fontFamily: {
        sans: [
          'Redaction',
          'Marcellus',
          'serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        serif: [
          'Redaction',
          'Marcellus',
          'serif',
        ],
        mono: [
          'Redaction',
          'Marcellus',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          '"Liberation Mono"',
          '"Courier New"',
          'monospace',
        ],
      },
      boxShadow: {
        'hud': '0 24px 60px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
        'hud-light': '0 20px 50px -15px rgba(15, 23, 42, 0.08)',
        'well': 'inset 0 2px 12px rgba(0, 0, 0, 0.85)',
        'well-light': 'inset 0 1px 3px rgba(15, 23, 42, 0.04)',
        'green-cta': '0 10px 25px -5px rgba(16, 185, 129, 0.35)',
        'red-cta': '0 10px 25px -5px rgba(239, 68, 68, 0.35)',
      },
      keyframes: {
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        pulseHalo: {
          '0%, 100%': { opacity: '0.85', transform: 'translate(-50%, -50%) scale(1)' },
          '50%': { opacity: '1', transform: 'translate(-50%, -50%) scale(1.015)' },
        },
      },
      animation: {
        'float-slow': 'floatSlow 6s ease-in-out infinite',
        'pulse-halo': 'pulseHalo 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
