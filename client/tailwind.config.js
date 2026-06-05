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
        'muted-stone': '#706A65',
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
        // Warm Glass — light-mode glass tokens per DESIGN.md
        // Translucent whites stacked over the body's 4-orb warm gradient.
        // Use these instead of pure bg-white or bg-warm-white on flow surfaces.
        'glass-card': 'rgba(255, 255, 255, 0.62)',         // flow-level cards
        'glass-panel': 'rgba(255, 255, 255, 0.55)',        // larger surfaces
        'glass-modal': 'rgba(255, 255, 255, 0.78)',        // elevated modals — more opaque for legibility
        'glass-subtle': 'rgba(255, 255, 255, 0.40)',       // secondary surfaces, chips
        'glass-border': 'rgba(255, 255, 255, 0.70)',       // warm white edge
        'glass-border-dark': 'rgba(28, 25, 23, 0.06)',     // dark fine inner border for busy gradient regions
        'glass-border-input': 'rgba(28, 25, 23, 0.12)',    // 2x stronger — form fields need a visible box outline against gradient
      },
      backdropBlur: {
        // Warm Glass tier values. DESIGN.md spec:
        // navbar 16px / card 18px / panel 24px / modal 32px / chip 12px
        'glass-chip': '12px',
        'glass-nav': '16px',
        'glass-card': '18px',
        'glass-panel': '24px',
        'glass-modal': '32px',
      },
      boxShadow: {
        // Soft drop shadows replace Nordic Clean's borders-only rule.
        // The blur reads as glass depth; the shadow grounds the surface above
        // the body gradient. Together they replace the flat 1-px border.
        'glass-card': '0 1px 2px rgba(28, 25, 23, 0.05), 0 8px 24px rgba(28, 25, 23, 0.08)',
        'glass-nav':  '0 1px 2px rgba(28, 25, 23, 0.04)',
        'glass-modal': '0 4px 12px rgba(28, 25, 23, 0.08), 0 24px 48px rgba(28, 25, 23, 0.10)',
      },
      backgroundImage: {
        // The 4-orb warm-glass page background, matching DESIGN.md spec.
        // Use as `bg-warm-orbs` on body or page wrappers. background-attachment: fixed
        // is set globally in index.css so this stays anchored during scroll.
        'warm-orbs': [
          'radial-gradient(ellipse 65% 45% at 12% 18%, rgba(217, 119, 6, 0.18) 0%, transparent 60%)',
          'radial-gradient(ellipse 55% 40% at 88% 22%, rgba(245, 158, 11, 0.15) 0%, transparent 60%)',
          'radial-gradient(ellipse 75% 50% at 50% 95%, rgba(159, 18, 57, 0.12) 0%, transparent 65%)',
          'radial-gradient(ellipse 45% 35% at 90% 80%, rgba(120, 53, 15, 0.10) 0%, transparent 55%)',
        ].join(', '),
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
