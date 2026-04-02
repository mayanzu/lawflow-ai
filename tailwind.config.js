/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"SF Pro Display"', '"Helvetica Neue"', 'sans-serif'],
      },
      colors: {
        apple: {
          blue: '#0071E3',
          blueHover: '#0077ED',
          gray: { 50: '#FBFBFD', 100: '#F5F5F7', 200: '#E8E8ED', 300: '#D2D2D7', 400: '#86868B', 500: '#6E6E73', 600: '#424245', 700: '#1D1D1F' },
          green: '#30D158',
          red: '#FF3B30',
          orange: '#FF9500',
        },
      },
      borderRadius: { 'apple': '18px', 'apple-sm': '12px', 'apple-xs': '8px' },
      boxShadow: {
        'apple': '0 2px 12px rgba(0,0,0,0.08)',
        'apple-hover': '0 8px 30px rgba(0,0,0,0.12)',
        'apple-dark': '0 2px 12px rgba(0,0,0,0.3)',
      },
    },
  },
  plugins: [],
}
