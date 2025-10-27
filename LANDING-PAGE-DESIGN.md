# Restaurant AI MCP - Landing Page Design Document

**Date**: October 27, 2025
**Purpose**: Sales/Demo Landing Page
**Target Audience**: Restaurant owners, managers, hospitality groups
**Design Style**: Glass Morphism, Modern, Minimalistic, Chique

---

## 🎯 Goals

1. **Showcase the product** - Clear value proposition
2. **Interactive demo** - Let prospects test the system
3. **Generate leads** - Capture contact information
4. **Professional presentation** - Impress potential clients

---

## 🎨 Design System

### Color Palette (Dark Theme with Glass)

**Primary Colors**:
```css
--bg-primary: #0A0A0A;           /* Deep black background */
--bg-secondary: #1E1E1E;         /* Card backgrounds */
--glass-bg: rgba(255, 255, 255, 0.05);  /* Glass morphism */
--glass-border: rgba(255, 255, 255, 0.1);

--accent-primary: #A855F7;       /* Purple (brand color) */
--accent-secondary: #3B82F6;     /* Blue */
--accent-success: #10B981;       /* Green */
--accent-warning: #F59E0B;       /* Amber */

--text-primary: #FFFFFF;
--text-secondary: #A1A1AA;       /* Gray 400 */
--text-muted: #71717A;           /* Gray 500 */
```

**Gradients**:
```css
--gradient-hero: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
--gradient-glass: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%);
--gradient-accent: linear-gradient(90deg, #A855F7 0%, #3B82F6 100%);
```

### Glass Morphism Components

**Standard Glass Card**:
```css
.glass-card {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 24px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}
```

**Elevated Glass (Hover)**:
```css
.glass-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.4);
  transform: translateY(-4px);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Typography

**Fonts**:
- **Headings**: `font-family: 'Inter', sans-serif; font-weight: 700;`
- **Body**: `font-family: 'DM Sans', sans-serif; font-weight: 400;`
- **Code/Numbers**: `font-family: 'JetBrains Mono', monospace;`

**Sizes** (Tailwind):
- Hero Headline: `text-6xl md:text-7xl lg:text-8xl`
- Section Heading: `text-4xl md:text-5xl`
- Feature Title: `text-2xl md:text-3xl`
- Body: `text-base md:text-lg`

### Borders & Shapes

- **Border Radius**: 16px (normal), 24px (cards), 32px (hero sections), 9999px (buttons)
- **Curved Borders**: Use `border-radius` with smooth curves
- **Mirror Effect**: `transform: rotateY(10deg)` with perspective

---

## 📐 Page Structure

### 1. Navigation Bar (Sticky)

**Layout**:
```
┌─────────────────────────────────────────────────────────┐
│  🤖 AI Restaurant MCP    Features  Demo  Pricing  Contact  │
│                                              [Try Demo]   │
└─────────────────────────────────────────────────────────┘
```

**Features**:
- Glass morphism background
- Sticky on scroll with blur effect
- Logo on left
- Navigation links center
- CTA button on right
- Smooth scroll to sections

**Component**: `LandingNav.tsx`

---

### 2. Hero Section

**Layout**:
```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│        Transform Your Restaurant with AI                │
│        ────────────────────────────────                  │
│                                                          │
│   Intelligent table management, voice reservations,      │
│   and real-time analytics powered by Claude AI           │
│                                                          │
│   [📞 Try Live Demo]    [📅 Schedule Call]               │
│                                                          │
│        ┌─────────────────────────┐                      │
│        │  Dashboard Preview      │  <- Floating glass   │
│        │  (Interactive)          │     with 3D effect   │
│        └─────────────────────────┘                      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Features**:
- Large headline with gradient text
- Subheadline explaining value prop
- Two CTAs: "Try Live Demo" + "Schedule Call"
- Floating dashboard preview with parallax effect
- Background: Subtle animated gradient mesh
- Stats counter: "Used by 50+ restaurants" (animated count-up)

**Component**: `HeroSection.tsx`

---

### 3. Social Proof / Logos

**Layout**:
```
Trusted by leading restaurants

[Logo 1]  [Logo 2]  [Logo 3]  [Logo 4]  [Logo 5]
```

**Features**:
- Horizontal scroll of demo logos
- Gray filter with hover color
- Infinite loop animation

**Component**: `TrustedBy.tsx`

---

### 4. Interactive Demo Section ⭐ (Most Important)

**Layout**:
```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│              See It In Action                            │
│                                                          │
│   ┌──────────────────────────────────────────────────┐  │
│   │  Live Demo Restaurant Dashboard                   │  │
│   │  ────────────────────────────────────            │  │
│   │                                                   │  │
│   │  [Embedded host-dashboard iframe OR              │  │
│   │   Interactive component with demo data]          │  │
│   │                                                   │  │
│   │  ✓ Click to add walk-in                         │  │
│   │  ✓ Drag party to table                          │  │
│   │  ✓ See real-time updates                        │  │
│   │                                                   │  │
│   └──────────────────────────────────────────────────┘  │
│                                                          │
│   [ 🎤 Try Voice Reservation ]  ← Opens phone call       │
│   simulation or embedded conversation                    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

**Features**:
- Full-width glass container
- Embedded actual dashboard OR demo component
- Demo data pre-loaded (Demo Restaurant)
- Guided tour tooltips
- "Call Demo Restaurant" button → Opens phone simulation
- Tabs: "Host Dashboard" | "Voice AI" | "Analytics"

**Components**:
- `InteractiveDemoSection.tsx`
- `DashboardDemo.tsx`
- `VoiceAIDemo.tsx`
- `AnalyticsDemo.tsx`

**Demo Data**:
```json
{
  "restaurant_name": "La Bella Vista (Demo)",
  "phone": "+1 (555) 123-DEMO",
  "tables": 12,
  "active_parties": 3,
  "reservations": 8
}
```

---

### 5. Features Grid

**Layout**:
```
Why Choose AI Restaurant MCP?

┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  🎤 Voice   │  │  📊 Smart   │  │  ⚡ Real-   │
│  AI Bot     │  │  Analytics  │  │  Time       │
│             │  │             │  │             │
│  Natural    │  │  Predict    │  │  Instant    │
│  language   │  │  no-shows   │  │  updates    │
└─────────────┘  └─────────────┘  └─────────────┘

┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  📱 Mobile  │  │  🔒 Secure  │  │  💰 ROI     │
│  First      │  │  & Private  │  │  Focused    │
└─────────────┘  └─────────────┘  └─────────────┘
```

**Each Card**:
- Glass morphism background
- Icon (animated on hover)
- Title
- Short description
- Hover effect: lift + glow

**Component**: `FeaturesGrid.tsx`

---

### 6. How It Works (Timeline)

**Layout**:
```
┌──────────────────────────────────────────────────┐
│                How It Works                       │
│                                                   │
│   1. Customer Calls ───────────────> 🎤          │
│                                                   │
│   2. AI Handles Request ──────────> 🤖          │
│                                                   │
│   3. Table Assigned ──────────────> 📋          │
│                                                   │
│   4. Host Confirmed ──────────────> ✓           │
│                                                   │
└──────────────────────────────────────────────────┘
```

**Features**:
- Vertical timeline with animated connectors
- Each step has icon + description
- Auto-play animation on scroll into view
- Glass cards for each step

**Component**: `HowItWorksTimeline.tsx`

---

### 7. Stats / Impact Section

**Layout**:
```
┌─────────────────────────────────────────────┐
│         The Numbers Speak                    │
│                                              │
│   ┌───────┐  ┌───────┐  ┌───────┐          │
│   │  95%  │  │  30%  │  │  <2s  │          │
│   │       │  │       │  │       │          │
│   │Customer│  │Revenue│  │Response│        │
│   │Sat.   │  │Increase│  │Time   │         │
│   └───────┘  └───────┘  └───────┘          │
└─────────────────────────────────────────────┘
```

**Features**:
- Animated counters on scroll
- Large numbers with labels
- Glass cards
- Background: Subtle gradient

**Component**: `StatsSection.tsx`

---

### 8. Pricing Section

**Layout**:
```
┌──────────────────────────────────────────────────────┐
│                   Pricing                             │
│                                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   Starter   │  │   Pro       │  │  Enterprise │ │
│  │   ─────     │  │   ───       │  │  ──────────│ │
│  │   $199/mo   │  │   $499/mo   │  │  Custom    │ │
│  │             │  │             │  │            │ │
│  │  ✓ Feature  │  │  ✓ All +    │  │  ✓ All +   │ │
│  │  ✓ Feature  │  │  ✓ Premium  │  │  ✓ White   │ │
│  │             │  │             │  │    Label   │ │
│  │ [Get Started]│  │[Get Started]│  │[Contact Us]│ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
└──────────────────────────────────────────────────────┘
```

**Features**:
- 3 tiers with glass cards
- Middle tier highlighted (most popular)
- Feature checkmarks
- CTA buttons
- "Custom" for enterprise

**Component**: `PricingSection.tsx`

**Pricing Strategy** (Example):
- **Starter**: $199/mo - 1 location, 50 tables, basic features
- **Pro**: $499/mo - 3 locations, unlimited tables, analytics
- **Enterprise**: Custom - Multi-location, white label, API access

---

### 9. FAQ Section

**Layout**:
```
┌──────────────────────────────────────────┐
│       Frequently Asked Questions          │
│                                           │
│  ▼ How does the AI voice bot work?      │
│     ──────────────────────────────       │
│     Our AI uses Claude from Anthropic... │
│                                           │
│  ▶ What if AI makes a mistake?          │
│                                           │
│  ▶ Can I integrate with my POS?         │
│                                           │
└──────────────────────────────────────────┘
```

**Features**:
- Accordion style
- Glass cards
- Smooth expand/collapse animation

**Component**: `FAQSection.tsx`

---

### 10. Contact / CTA Section

**Layout**:
```
┌──────────────────────────────────────────────┐
│     Ready to Transform Your Restaurant?       │
│                                               │
│   ┌───────────────────────────────────────┐  │
│   │  Name: ________________               │  │
│   │  Email: ________________              │  │
│   │  Restaurant: ____________             │  │
│   │  Message: ________________            │  │
│   │           ________________            │  │
│   │                                       │  │
│   │  [Send Message]                       │  │
│   └───────────────────────────────────────┘  │
│                                               │
│   Or email: stefanogebara@gmail.com          │
└──────────────────────────────────────────────┘
```

**Features**:
- Glass form with smooth inputs
- Submit sends to your email
- Success animation
- Alternative contact: stefanogebara@gmail.com

**Component**: `ContactForm.tsx`

**Email Integration**:
- Use EmailJS or SendGrid
- Send to: stefanogebara@gmail.com
- Auto-reply to customer

---

### 11. Footer

**Layout**:
```
┌────────────────────────────────────────────────────┐
│  AI Restaurant MCP                                 │
│  The future of restaurant management               │
│                                                    │
│  Product          Company        Legal            │
│  ───────          ───────        ─────            │
│  Features         About          Privacy          │
│  Pricing          Contact        Terms            │
│  Demo                                             │
│                                                    │
│  © 2025 AI Restaurant MCP. All rights reserved.   │
│  Built with Claude AI & React                     │
└────────────────────────────────────────────────────┘
```

**Component**: `Footer.tsx`

---

## 🎭 Animations & Interactions

### Scroll Animations
```javascript
// Using Framer Motion or AOS (Animate On Scroll)

// Fade up on scroll
<motion.div
  initial={{ opacity: 0, y: 50 }}
  whileInView={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.6 }}
>

// Stagger children
<motion.div
  variants={{
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.2 }
    }
  }}
>
```

### Hover Effects
- Cards: Lift + glow
- Buttons: Scale + gradient shift
- Images: Zoom slight + overlay

### Parallax
- Hero background moves slower than content
- Dashboard preview has depth

---

## 📱 Responsive Design

**Breakpoints**:
- Mobile: < 768px
- Tablet: 768px - 1024px
- Desktop: > 1024px

**Mobile Adjustments**:
- Stack cards vertically
- Simplified navigation (hamburger menu)
- Smaller text sizes
- Full-width CTAs
- Reduced animations

---

## 🚀 Tech Stack

**Frontend**:
```json
{
  "framework": "React 18 + TypeScript",
  "styling": "Tailwind CSS",
  "animations": "Framer Motion",
  "icons": "Lucide React OR Hero Icons",
  "form": "React Hook Form",
  "email": "EmailJS OR SendGrid"
}
```

**Components Library** (Reusable):
```
src/landing/
├── components/
│   ├── LandingNav.tsx
│   ├── HeroSection.tsx
│   ├── TrustedBy.tsx
│   ├── InteractiveDemoSection.tsx
│   ├── FeaturesGrid.tsx
│   ├── HowItWorksTimeline.tsx
│   ├── StatsSection.tsx
│   ├── PricingSection.tsx
│   ├── FAQSection.tsx
│   ├── ContactForm.tsx
│   └── Footer.tsx
├── pages/
│   └── LandingPage.tsx
└── styles/
    └── glass-morphism.css
```

---

## 🎬 Demo Data Setup

**Demo Restaurant Profile**:
```javascript
// demo-data.ts
export const DEMO_RESTAURANT = {
  name: "La Bella Vista",
  tagline: "Fine Italian Dining Experience",
  phone: "+1 (555) 123-DEMO",
  email: "demo@restaurant-ai-mcp.com",
  address: "123 Demo Street, San Francisco, CA",

  // Pre-populated data for demo
  tables: [
    { number: 1, capacity: 2, status: 'Available', location: 'Window' },
    { number: 2, capacity: 4, status: 'Occupied', location: 'Indoor' },
    { number: 3, capacity: 4, status: 'Available', location: 'Patio' },
    // ... 12 tables total
  ],

  active_parties: [
    {
      customer_name: 'Demo Customer A',
      party_size: 4,
      table: 2,
      seated_at: '2025-10-27T18:30:00Z',
      estimated_departure: '2025-10-27T20:00:00Z'
    }
  ],

  reservations: [
    {
      customer_name: 'Demo Customer B',
      party_size: 2,
      date: '2025-10-27',
      time: '19:00',
      status: 'Confirmed'
    },
    // ... 8 reservations
  ],

  stats: {
    total_capacity: 42,
    available_seats: 18,
    occupied_seats: 24,
    occupancy: 57
  }
};
```

---

## 🎤 Voice AI Demo Implementation

**Option 1: Phone Call Simulation**
```typescript
// Embedded audio player with pre-recorded conversation
<div className="voice-demo-player">
  <audio controls>
    <source src="/demo-conversation.mp3" />
  </audio>
  <div className="transcript">
    <p><strong>Customer:</strong> "I'd like to make a reservation for tonight"</p>
    <p><strong>AI:</strong> "I'd be happy to help! How many people?"</p>
    // ... conversation
  </div>
</div>
```

**Option 2: Interactive Chat** (Easier):
```typescript
// Simulated conversation with buttons
<div className="chat-demo">
  <div className="messages">
    {messages.map(m => <Message key={m.id} {...m} />)}
  </div>
  <div className="quick-actions">
    <button>Make Reservation</button>
    <button>Check Availability</button>
    <button>Modify Booking</button>
  </div>
</div>
```

**Option 3: Actual ElevenLabs Widget** (If you want real voice):
```html
<!-- Embed ElevenLabs conversational AI widget -->
<div id="elevenlabs-widget"></div>
<script src="https://elevenlabs.io/widget.js"></script>
```

---

## 📊 Analytics & Tracking

**Add Google Analytics**:
```html
<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
```

**Track Events**:
- "Try Demo" button clicked
- Contact form submitted
- Pricing viewed
- Demo interacted with

---

## ✅ Pre-Launch Checklist

- [ ] Design all sections in Figma/Sketch (optional)
- [ ] Build components with glass morphism
- [ ] Create demo data
- [ ] Set up contact form (EmailJS)
- [ ] Test on mobile, tablet, desktop
- [ ] Optimize images (WebP format)
- [ ] Add meta tags (SEO)
- [ ] Set up Google Analytics
- [ ] Test demo interactions
- [ ] Deploy to Vercel
- [ ] Custom domain (optional)

---

## 🌐 SEO & Meta Tags

```html
<!-- landing.html -->
<head>
  <title>AI Restaurant MCP - Intelligent Restaurant Management Platform</title>
  <meta name="description" content="Transform your restaurant with AI-powered table management, voice reservations, and real-time analytics. Try our live demo today!" />

  <!-- Open Graph (Social) -->
  <meta property="og:title" content="AI Restaurant MCP - The Future of Restaurant Management" />
  <meta property="og:description" content="Intelligent table management powered by Claude AI. See it in action with our live demo." />
  <meta property="og:image" content="https://restaurant-ai-mcp.vercel.app/og-image.png" />
  <meta property="og:url" content="https://restaurant-ai-mcp.vercel.app" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="AI Restaurant MCP" />
  <meta name="twitter:description" content="Transform your restaurant with AI" />
  <meta name="twitter:image" content="https://restaurant-ai-mcp.vercel.app/og-image.png" />
</head>
```

---

## 🎯 Call-to-Action Strategy

**Primary CTA**: "Try Live Demo" (Immediate value, low friction)
**Secondary CTA**: "Schedule a Call" (High intent, personal touch)
**Tertiary CTA**: Contact form (Lead capture)

**Placement**:
- Hero: Both CTAs
- Nav: "Try Demo" button
- Demo section: "Book a Call" after interaction
- Pricing: "Get Started" per tier
- Footer: Contact info

---

## 💼 Value Propositions (Copy Examples)

**Hero Headline Options**:
1. "The AI Assistant Your Restaurant Needs"
2. "Transform Tables into Revenue with AI"
3. "Restaurant Management, Reimagined with AI"
4. "Never Miss a Reservation Again"

**Subheadline**:
"Powered by Claude AI, our platform handles reservations via voice, optimizes table assignments, and provides real-time analytics—so you can focus on creating amazing dining experiences."

**Features (Benefits-Focused)**:
- "95% customer satisfaction with voice AI"
- "30% increase in table turnover"
- "Zero training required for staff"
- "Works with any restaurant size"

---

**Next Steps**: Start building components or approve design first?
**Contact**: stefanogebara@gmail.com
**Repository**: https://github.com/stefanogebara/restaurant-ai-mcp
