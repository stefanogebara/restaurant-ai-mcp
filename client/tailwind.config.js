/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        'status-available': '#10b981',
        'status-occupied': '#ef4444',
        'status-cleaning': '#f59e0b',
        'status-reserved': '#3b82f6',
      }
    },
  },
  plugins: [],
}
