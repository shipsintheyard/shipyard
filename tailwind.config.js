/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './providers/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        heading: ["'Outfit'", 'sans-serif'],
        mono: ["'Space Mono'", 'monospace'],
      },
      colors: {
        primary: {
          DEFAULT: '#88c0ff',
          dark: '#5a9fd4',
        },
        'bg-base': '#0f1419',
        'bg-card': '#1a1f2e',
        'bg-input': 'rgba(10, 14, 18, 0.8)',
        'bg-glass': 'rgba(15, 20, 25, 0.8)',
        'bg-header': 'rgba(15, 20, 25, 0.9)',
        'text-body': '#c9d1d9',
        'text-muted': '#8b9bb0',
        'text-dim': '#6b7d94',
        'text-subtle': '#9ab4c8',
        'border-primary': 'rgba(136, 192, 255, 0.15)',
        'border-accent': 'rgba(136, 192, 255, 0.25)',
        burn: {
          DEFAULT: '#f97316',
          dark: '#ea580c',
        },
        success: '#7ee787',
      },
    },
  },
  plugins: [],
};
