/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Premium Restaurant Typography System
      fontFamily: {
        display: ['Playfair Display', 'Cormorant Garamond', 'serif'],
        sans: ['IBM Plex Sans', 'Bricolage Grotesque', 'sans-serif'],
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'monospace'],
      },

      // Type Scale (3x ratio)
      fontSize: {
        '5xl': ['72px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        '4xl': ['60px', { lineHeight: '1.1', letterSpacing: '-0.01em', fontWeight: '600' }],
        '3xl': ['48px', { lineHeight: '1.2', letterSpacing: '0' }],
        '2xl': ['36px', { lineHeight: '1.3', letterSpacing: '0' }],
        'xl': ['24px', { lineHeight: '1.4', letterSpacing: '0' }],
        'lg': ['20px', { lineHeight: '1.5', letterSpacing: '0' }],
        'base': ['16px', { lineHeight: '1.6', letterSpacing: '0' }],
        'sm': ['14px', { lineHeight: '1.5', letterSpacing: '0' }],
        'xs': ['12px', { lineHeight: '1.4', letterSpacing: '0' }],
      },

      // Premium Restaurant Color Palette
      colors: {
        // Deep Burgundy - Primary brand color
        burgundy: {
          50: '#fdf2f4',
          100: '#fce7eb',
          200: '#f9d0d9',
          300: '#f4a8b8',
          400: '#ec7591',
          500: '#e0476d',
          600: '#cc2a56',
          700: '#ad1e47',
          800: '#7D1128', // PRIMARY
          900: '#6b0e21',
          950: '#3d0312',
        },

        // Warm Gold - Premium accent
        gold: {
          50: '#fefaec',
          100: '#fdf3c9',
          200: '#fce588',
          300: '#fad24e',
          400: '#D4AF37', // PRIMARY
          500: '#d9a527',
          600: '#c18020',
          700: '#9b5d1d',
          800: '#7f4a1d',
          900: '#6c3e1d',
        },

        // Charcoal - Dark mode & depth
        charcoal: {
          50: '#f6f6f6',
          100: '#e7e7e7',
          200: '#d1d1d1',
          300: '#b0b0b0',
          400: '#888888',
          500: '#6d6d6d',
          600: '#5d5d5d',
          700: '#4f4f4f',
          800: '#454545',
          900: '#2B2B2B', // PRIMARY
          950: '#1a1a1a',
        },

        // Cream - Elegant backgrounds
        cream: {
          50: '#fefdfb',
          100: '#fdfcf6',
          200: '#F5F5DC', // PRIMARY - Beige
          300: '#ebe9d5',
          400: '#ddd9c0',
          500: '#cbc5a7',
          600: '#b5ad8a',
          700: '#989173',
          800: '#7d7660',
          900: '#676253',
        },

        // Semantic Colors
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#4A7C59', // PRIMARY - Forest green
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },

        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#D97706', // PRIMARY - Amber
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },

        error: {
          50: '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#991B1B', // PRIMARY - Deep red
          800: '#991b1b',
          900: '#7f1d1d',
        },

        info: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#1E40AF', // PRIMARY - Royal blue
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },

        // Table Status Colors
        'status-available': '#4A7C59',
        'status-occupied': '#991B1B',
        'status-reserved': '#1E40AF',
        'status-cleaning': '#D97706',

        // Legacy compatibility (can be removed later)
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
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },

      // Border Radius
      borderRadius: {
        lg: "1rem",     // 16px
        md: "0.75rem",  // 12px
        sm: "0.5rem",   // 8px
        xl: "1.5rem",   // 24px
        '2xl': "2rem",  // 32px
        full: "9999px",
      },

      // Shadows & Depth
      boxShadow: {
        'xs': '0 1px 2px rgba(43, 43, 43, 0.05)',
        'sm': '0 1px 3px rgba(43, 43, 43, 0.1), 0 1px 2px rgba(43, 43, 43, 0.06)',
        'md': '0 4px 6px -1px rgba(43, 43, 43, 0.1), 0 2px 4px -1px rgba(43, 43, 43, 0.06)',
        'lg': '0 10px 15px -3px rgba(43, 43, 43, 0.1), 0 4px 6px -2px rgba(43, 43, 43, 0.05)',
        'xl': '0 20px 25px -5px rgba(43, 43, 43, 0.1), 0 10px 10px -5px rgba(43, 43, 43, 0.04)',
        '2xl': '0 25px 50px -12px rgba(125, 17, 40, 0.25)',
        'burgundy': '0 20px 25px -5px rgba(125, 17, 40, 0.3), 0 10px 10px -5px rgba(125, 17, 40, 0.2)',
        'gold': '0 20px 25px -5px rgba(212, 175, 55, 0.3), 0 10px 10px -5px rgba(212, 175, 55, 0.2)',
      },

      // Spacing System (8px grid)
      spacing: {
        '0': '0',
        '1': '0.25rem',  // 4px
        '2': '0.5rem',   // 8px
        '3': '0.75rem',  // 12px
        '4': '1rem',     // 16px
        '5': '1.25rem',  // 20px
        '6': '1.5rem',   // 24px
        '8': '2rem',     // 32px
        '10': '2.5rem',  // 40px
        '12': '3rem',    // 48px
        '16': '4rem',    // 64px
        '20': '5rem',    // 80px
        '24': '6rem',    // 96px
      },

      // Animation & Motion
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'out-back': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'in-out-circ': 'cubic-bezier(0.85, 0, 0.15, 1)',
      },

      transitionDuration: {
        '100': '100ms',
        '200': '200ms',
        '300': '300ms',
        '500': '500ms',
        '700': '700ms',
      },

      // Keyframe Animations
      keyframes: {
        'fade-in-up': {
          '0%': {
            opacity: '0',
            transform: 'translateY(20px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        'scale-in': {
          '0%': {
            opacity: '0',
            transform: 'scale(0.95)',
          },
          '100%': {
            opacity: '1',
            transform: 'scale(1)',
          },
        },
        'shimmer': {
          '0%': {
            backgroundPosition: '-1000px 0',
          },
          '100%': {
            backgroundPosition: '1000px 0',
          },
        },
        'slide-in-right': {
          '0%': {
            opacity: '0',
            transform: 'translateX(100px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateX(0)',
          },
        },
        'slide-in-left': {
          '0%': {
            opacity: '0',
            transform: 'translateX(-100px)',
          },
          '100%': {
            opacity: '1',
            transform: 'translateX(0)',
          },
        },
      },

      animation: {
        'fade-in-up': 'fade-in-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scale-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'shimmer': 'shimmer 2s infinite',
        'slide-in-right': 'slide-in-right 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in-left': 'slide-in-left 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },

      // Background Images & Patterns
      backgroundImage: {
        'mesh-gradient': `
          radial-gradient(at 40% 20%, #7D1128 0px, transparent 50%),
          radial-gradient(at 80% 0%, #D4AF37 0px, transparent 50%),
          radial-gradient(at 0% 50%, #2B2B2B 0px, transparent 50%),
          radial-gradient(at 80% 50%, #ad1e47 0px, transparent 50%),
          radial-gradient(at 0% 100%, #c18020 0px, transparent 50%),
          radial-gradient(at 80% 100%, #cc2a56 0px, transparent 50%)
        `,
        'parchment-texture': `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ebe9d5' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
      },

      // Backdrop Blur
      backdropBlur: {
        xs: '2px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '20px',
        '2xl': '40px',
      },

      // Backdrop Saturate
      backdropSaturate: {
        180: '180%',
      },
    },
  },
  plugins: [],
}
