/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Modern 2025 Typography System
      fontFamily: {
        display: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Inter', 'sans-serif'],
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'Inter', 'sans-serif'],
        mono: ['SF Mono', 'JetBrains Mono', 'Menlo', 'Monaco', 'monospace'],
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

      // Modern Premium Restaurant 2025 Color Palette
      colors: {
        // Deep Slate - Professional & Modern base
        slate: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a', // PRIMARY - Deep Slate
          950: '#020617',
        },

        // Warm Sage - Sophisticated secondary
        sage: {
          50: '#f6f7f6',
          100: '#e3e5e3',
          200: '#c6cbc6',
          300: '#a3aba3',
          400: '#818a81',
          500: '#5f6f5f', // PRIMARY - Warm Sage
          600: '#4f5e4f',
          700: '#3f4d3f',
          800: '#343f34',
          900: '#2b342b',
          950: '#1a1f1a',
        },

        // Electric Violet - Premium accent
        violet: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea', // PRIMARY - Electric Violet
          700: '#7e22ce',
          800: '#6b21a8',
          900: '#581c87',
          950: '#3b0764',
        },

        // Ocean Blue - Trust & Intelligence
        ocean: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7', // PRIMARY - Ocean Blue
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },

        // Amber Glow - Energy & Attention
        amber: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706', // PRIMARY - Amber Glow
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },

        // Semantic Colors (Modern)
        success: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669', // PRIMARY - Emerald
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
          950: '#022c22',
        },

        warning: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c', // PRIMARY - Orange
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407',
        },

        error: {
          50: '#fff1f2',
          100: '#ffe4e6',
          200: '#fecdd3',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48', // PRIMARY - Rose
          700: '#be123c',
          800: '#9f1239',
          900: '#881337',
          950: '#4c0519',
        },

        info: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7', // PRIMARY - Sky (same as ocean)
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },

        // Table Status Colors (Updated)
        'status-available': '#059669',  // Emerald
        'status-occupied': '#e11d48',   // Rose
        'status-reserved': '#0284c7',   // Ocean
        'status-cleaning': '#d97706',   // Amber

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

      // Modern Shadow & Glow System
      boxShadow: {
        'xs': '0 1px 2px rgba(15, 23, 42, 0.04)',
        'sm': '0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.04)',
        'md': '0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -1px rgba(15, 23, 42, 0.04)',
        'lg': '0 10px 15px -3px rgba(15, 23, 42, 0.08), 0 4px 6px -2px rgba(15, 23, 42, 0.04)',
        'xl': '0 20px 25px -5px rgba(15, 23, 42, 0.08), 0 10px 10px -5px rgba(15, 23, 42, 0.04)',
        '2xl': '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
        // Premium glow effects
        'glow-violet': '0 0 20px rgba(147, 51, 234, 0.4), 0 0 40px rgba(147, 51, 234, 0.2)',
        'glow-ocean': '0 0 20px rgba(2, 132, 199, 0.4), 0 0 40px rgba(2, 132, 199, 0.2)',
        'glow-success': '0 0 20px rgba(5, 150, 105, 0.4), 0 0 40px rgba(5, 150, 105, 0.2)',
        'glow-amber': '0 0 20px rgba(217, 119, 6, 0.4), 0 0 40px rgba(217, 119, 6, 0.2)',
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

      // Modern 2025 Animation Keyframes
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
        'pulse-glow': {
          '0%, 100%': {
            boxShadow: '0 0 20px rgba(147, 51, 234, 0.4)',
          },
          '50%': {
            boxShadow: '0 0 40px rgba(147, 51, 234, 0.6)',
          },
        },
        'bounce-subtle': {
          '0%, 100%': {
            transform: 'translateY(0)',
          },
          '50%': {
            transform: 'translateY(-4px)',
          },
        },
      },

      animation: {
        'fade-in-up': 'fade-in-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scale-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'shimmer': 'shimmer 2s infinite',
        'slide-in-right': 'slide-in-right 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-in-left': 'slide-in-left 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'bounce-subtle': 'bounce-subtle 1s ease-in-out infinite',
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
