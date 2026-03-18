/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Lato', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // Nordic Clean Theme Colors
        'nordic-surface': '#F9FAFB',
        'nordic-border': '#E5E7EB',
        'nordic-muted': '#9CA3AF',
        'nordic-teal': '#9F1239',
        'nordic-teal-dark': '#881337',
        'nordic-text': '#111827',
        'nordic-success': '#9F1239',
        'nordic-warning': '#D97706',
        // Legacy aliases (mapped to Nordic equivalents)
        'warm-bg': '#FFFFFF',
        'warm-hover': '#F9FAFB',
        'warm-divider': '#E5E7EB',
        'accent-burgundy': '#9F1239',
        'success-green': '#9F1239',
        'warning-amber': '#D97706',
        // Modern Elegant Theme Colors
        'warm-white': '#FAFAF9',
        'soft-gray': '#F5F5F4',
        'deep-charcoal': '#1C1917',
        'stone-gray': '#57534E',
        'burgundy': '#9F1239',
        'burgundy-dark': '#881337',
        'border-gray': '#E7E5E4',
        'warm-stone': '#78716C',
        'muted-stone': '#A8A29E',
        'charcoal-dark': '#292524',
        // CSS Variable Colors
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        sidebar: {
          DEFAULT: "var(--sidebar)",
          foreground: "var(--sidebar-foreground)",
          primary: "var(--sidebar-primary)",
          "primary-foreground": "var(--sidebar-primary-foreground)",
          accent: "var(--sidebar-accent)",
          "accent-foreground": "var(--sidebar-accent-foreground)",
          border: "var(--sidebar-border)",
          ring: "var(--sidebar-ring)",
        },
        // Status colors for restaurant features
        'status-available': '#10b981',
        'status-occupied': '#ef4444',
        'status-cleaning': '#f59e0b',
        'status-reserved': '#3b82f6',
        // Platform brand colors
        'whatsapp': '#25D366',
        'spotify': '#20BD5A',
        // Custom neutrals (not exact Tailwind matches)
        'stone-mid': '#3a3533',
        'stone-pale': '#EEECEB',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'fade-in-up': 'fadeInUp 0.4s ease-out forwards',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
