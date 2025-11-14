/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Ethos Typography System - Inter Only
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        mono: ['SF Mono', 'JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
      },

      // Ethos Type Scale (14px base)
      fontSize: {
        'xs': ['12px', { lineHeight: '1.5' }],
        'sm': ['14px', { lineHeight: '1.5714' }], // Ethos base
        'base': ['16px', { lineHeight: '1.5714' }],
        'lg': ['18px', { lineHeight: '1.5714' }],
        'xl': ['20px', { lineHeight: '1.5' }],
        '2xl': ['24px', { lineHeight: '1.4' }],
        '3xl': ['30px', { lineHeight: '1.3' }],
        '4xl': ['36px', { lineHeight: '1.2' }],
        '5xl': ['48px', { lineHeight: '1.1' }],
      },

      // Ethos Gray Color Palette (Minimal & Elegant)
      colors: {
        // Ethos Gray Scale (Primary System)
        'ethos-gray': {
          50: '#E8E7E1',   // Lightest
          100: '#DED DCD5', // Very Light
          200: '#D5D4CD',   // Secondary Surface
          300: '#CBCBC2',   // Primary Cards
          400: '#C1C0B6',   // Main Background ⭐
          500: '#BFBFB8',   // Elevated Surfaces
          600: '#9B9A8F',   // Borders
          700: '#7A7970',   // Subtle Text
          800: '#5A5954',   // Secondary Text
          900: '#3A3936',   // Dark Gray
        },

        // Primary Black (High Contrast Text)
        'ethos-black': '#000000',

        // Minimal Accent Colors (Restrained Usage)
        'ethos-blue': '#1f21b6',      // Primary actions
        'ethos-green': '#127f31',     // Success
        'ethos-amber': '#cc9a1a',     // Warning
        'ethos-red': '#b72b38',       // Error

        // Orange CTA (Call-to-Action)
        'ethos-orange': {
          DEFAULT: '#FF4000',  // Primary CTA
          hover: '#FF5A23',    // Hover state
        },

        // Legacy compatibility
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },

      // Ethos Border Radius (Minimal 6px)
      borderRadius: {
        'sm': '4px',
        DEFAULT: '6px',   // Ethos standard
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        'full': '9999px',
      },

      // Ethos Minimal Shadow System
      boxShadow: {
        'xs': '0 1px 2px -2px rgba(0, 0, 0, 0.08)',
        'sm': '0 1px 2px -2px rgba(0, 0, 0, 0.16)',  // Ethos card shadow
        'md': '0 2px 4px -2px rgba(0, 0, 0, 0.16)',
        'lg': '0 4px 8px -4px rgba(0, 0, 0, 0.16)',
        'xl': '0 8px 16px -8px rgba(0, 0, 0, 0.16)',
        // Orange CTA Glow
        'orange-glow': '0 0 2px #000, 0 0 20px rgba(255, 64, 0, 0.4)',
        'orange-glow-lg': '0 0 4px #000, 0 0 30px rgba(255, 64, 0, 0.5)',
      },

      // Ethos Transition Duration (Smooth 0.2s)
      transitionDuration: {
        DEFAULT: '200ms',
        'fast': '150ms',
        'slow': '300ms',
      },

      // Ethos Transition Timing
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
