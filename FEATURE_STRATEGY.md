# Seatable Feature Gating & Onboarding Strategy

## 🎯 Product Philosophy

**Core Principle**: Every plan should provide real value while creating clear upgrade incentives. Basic users should love the product enough to want more, not feel frustrated by limitations.

---

## 💰 Feature Gating Strategy by Plan

### **Basic Plan - €49.99/month**
*"Perfect for small, single-location restaurants just getting started with AI"*

**What's INCLUDED:**
- ✅ AI reservation assistant (voice + text)
- ✅ Host dashboard (real-time table management)
- ✅ Up to **10 tables** (perfect for small restaurants)
- ✅ **50 reservations per month** (enough to test and validate)
- ✅ Basic analytics (occupancy, daily stats)
- ✅ Email notifications
- ✅ **1 user account** (owner/manager)
- ✅ 30-day data retention
- ✅ Email support (24-48 hour response)

**What's LOCKED:**
- ❌ More than 10 tables → Shows "Upgrade to add more tables"
- ❌ Advanced analytics (trends, predictions, customer insights)
- ❌ Waitlist management
- ❌ SMS notifications
- ❌ Multiple team members
- ❌ API access
- ❌ Longer data retention

**Upgrade Triggers:**
- When they try to add table #11
- When they hit 50 reservations in a month
- When they want to see weekly/monthly trends
- When they need to add a second staff member

---

### **Professional Plan - €99.99/month** ⭐ MOST POPULAR
*"For growing restaurants that need advanced features and unlimited capacity"*

**What's INCLUDED (Everything in Basic PLUS):**
- ✅ **Unlimited tables** (scale as you grow)
- ✅ **Unlimited reservations** (no monthly limits)
- ✅ Advanced analytics (trends, predictions, peak hours)
- ✅ Waitlist management with auto-notifications
- ✅ SMS notifications (reservation confirmations, table ready alerts)
- ✅ **Up to 5 team members** (host staff, managers)
- ✅ Priority support (4-8 hour response)
- ✅ 1-year data retention
- ✅ Customer history & preferences
- ✅ No-show prediction (ML-powered)
- ✅ Custom branding (logo, colors on customer-facing pages)

**What's LOCKED:**
- ❌ Multi-location management
- ❌ API access for custom integrations
- ❌ White-label (remove "Powered by Seatable")
- ❌ Dedicated account manager
- ❌ SLA guarantees

**Upgrade Triggers:**
- When they open a second location
- When they want to integrate with existing POS system
- When they need white-label for their brand

---

### **Enterprise Plan - €199.99/month** 👑
*"For restaurant chains and businesses that need full control"*

**What's INCLUDED (Everything in Professional PLUS):**
- ✅ **Multi-location management** (manage all locations from one dashboard)
- ✅ **Unlimited team members** with role-based permissions
- ✅ **Full API access** (integrate with POS, CRM, accounting systems)
- ✅ **White-label** (completely remove Seatable branding)
- ✅ **Custom integrations** (we build custom connectors for you)
- ✅ **Dedicated account manager** (personal support contact)
- ✅ **24/7 phone support** (call anytime)
- ✅ **SLA guarantee** (99.9% uptime with compensation)
- ✅ **Unlimited data retention** (forever)
- ✅ **Custom feature development** (we build features you need)
- ✅ **Training & onboarding** (hands-on setup assistance)

---

## 🚀 Seamless Onboarding Flow

### **Step 1: Welcome & Quick Setup (2 minutes)**

**Screen: Welcome to Seatable**
```
"Let's set up your restaurant in under 5 minutes!"

Progress: [▓░░░░] Step 1 of 5

What's your restaurant called?
[Restaurant Name                    ]

What type of restaurant?
[Dropdown: Fine Dining, Casual, Fast Casual, Cafe, Bar, Other]

Where are you located?
[City, Country                      ]

Continue →
```

**Why this works:** Start with easy, non-technical questions. Build momentum.

---

### **Step 2: Contact & Business Hours (2 minutes)**

**Screen: How can customers reach you?**
```
Progress: [▓▓░░░] Step 2 of 5

Restaurant phone number
[+1 (555) 123-4567                  ]
💡 This will be your AI assistant's number

Email address
[contact@restaurant.com              ]

Business hours
Monday:    [9:00 AM ▼] to [10:00 PM ▼]  [Copy to all days]
Tuesday:   [9:00 AM ▼] to [10:00 PM ▼]
Wednesday: [9:00 AM ▼] to [10:00 PM ▼]
...

Average dining duration
[90 minutes ▼]  💡 Used to estimate table turnover

← Back    Continue →
```

**Why this works:** Critical operational info. Phone number integration hint for later.

---

### **Step 3: Table Configuration (3 minutes)** 🎯 MOST IMPORTANT

**Screen: Let's set up your tables**
```
Progress: [▓▓▓░░] Step 3 of 5

How many dining areas do you have?
[Indoor ▼] [+ Add area]

━━━ INDOOR AREA ━━━

How many tables in this area?

2-person tables:  [4  ] tables
4-person tables:  [6  ] tables
6-person tables:  [2  ] tables
8+ person tables: [1  ] table

Total capacity: 48 seats across 13 tables

[+ Add another area (Patio, Bar, Private Room)]

💡 Pro tip: You can always adjust this later in Settings

← Back    Continue →
```

**Smart Defaults:**
- If Basic plan: Show "You can add up to 10 tables (3 more available)"
- If Professional: Show "Unlimited tables"

**Basic Plan Limit Warning:**
```
⚠️ Basic Plan Limit
You've configured 13 tables, but Basic plan supports up to 10 tables.

Options:
1. Remove 3 tables to stay on Basic plan
2. Upgrade to Professional (unlimited tables) → €99.99/month

[Choose tables to keep] [Upgrade Now]
```

**Why this works:** Visual, easy to understand. Shows capacity calculation in real-time. Gentle upgrade prompt if they exceed limits.

---

### **Step 4: Reservation Settings (1 minute)**

**Screen: Reservation preferences**
```
Progress: [▓▓▓▓░] Step 4 of 5

How far in advance can customers book?
[30 days ▼]

How much time between reservations?
[15 minutes ▼]  💡 Buffer time to clean tables

Cancellation policy
[Free cancellation up to 2 hours before ▼]

Special notes (optional)
[_________________________________________]
Example: "Vegan options available, outdoor seating seasonal"

← Back    Continue →
```

**Why this works:** Quick, sensible defaults provided. Optional field at end.

---

### **Step 5: Team Setup (1 minute)**

**Screen: Invite your team** [PROFESSIONAL+ ONLY]

```
Progress: [▓▓▓▓▓] Step 5 of 5

Add team members who will manage reservations

Email                              Role
[manager@restaurant.com         ]  [Manager ▼]  [Remove]

[+ Add team member]

Available roles:
• Owner - Full access to everything
• Manager - Manage reservations, view analytics
• Host - View and manage reservations only

💡 Basic plan: 1 user (you)
💡 Professional plan: Up to 5 users
💡 Enterprise plan: Unlimited users

[Upgrade to add more users →]

← Back    Complete Setup →
```

**Basic Plan Users See:**
```
🔒 Team Management (Professional Plan Feature)

Upgrade to Professional to:
• Add up to 5 team members
• Set role-based permissions
• Track who made changes

[Upgrade Now]  [Skip for now]
```

---

### **Step 6: Success & Next Steps**

**Screen: You're all set! 🎉**
```
✓ Restaurant profile created
✓ Tables configured (12 tables, 48 seats)
✓ Reservation settings saved
✓ Team members invited (2 pending)

━━━ WHAT'S NEXT? ━━━

1. 📱 Connect AI Phone Assistant
   Link your phone number to enable voice reservations
   [Set up now] [Later]

2. 🧪 Make a test reservation
   Try the system with a fake booking
   [Start test]

3. 📊 Explore your dashboard
   View real-time table status and reservations
   [Go to dashboard →]

4. 📚 Watch 3-minute tutorial
   Learn the basics of Seatable
   [Watch video]

Need help? [Live chat] [Email support] [Help center]
```

**Why this works:** Clear checklist. Multiple entry points. Not overwhelming.

---

## 🎨 Onboarding UX Principles

### **1. Progressive Disclosure**
- Show 5 simple steps, not 20 fields at once
- Use "Skip for now" buttons for optional features
- Save progress automatically (can resume later)

### **2. Smart Defaults**
- Pre-fill common values (90-min dining duration, 15-min buffer)
- Suggest typical table configurations
- Use location to suggest business hours

### **3. Inline Validation**
- Check restaurant name isn't taken
- Validate phone number format in real-time
- Show capacity calculations as they type

### **4. Gentle Upgrade Prompts**
- Never block the flow with upgrade walls
- Always provide "Skip" or "Later" options
- Show value, not just features ("Add 5 team members" not "Multi-user")

### **5. Visual Feedback**
- Progress bar shows how far along they are
- Checkmarks for completed steps
- Animations for successful actions

---

## 🔒 When to Show Upgrade Prompts

### **During Onboarding:**
1. When they try to add table #11 (Basic limit)
2. When they invite team member #2 (Basic limit)
3. At the end: "Upgrade to Professional for 40% more features"

### **During Normal Use:**
1. When they hit 50 reservations this month
2. When they click "Advanced Analytics"
3. When they try to enable SMS notifications
4. When they try to add a second location

### **Prompt Design:**
```
┌─────────────────────────────────────┐
│  🔒 Professional Feature             │
│                                      │
│  Advanced Analytics                  │
│  See trends, predictions, and        │
│  customer insights to grow revenue   │
│                                      │
│  Current plan: Basic (€49.99)       │
│  Upgrade to: Professional (€99.99)  │
│                                      │
│  ✓ Unlimited tables & reservations  │
│  ✓ Advanced analytics & insights    │
│  ✓ SMS notifications                │
│  ✓ Up to 5 team members             │
│                                      │
│  [View Plans] [Start Free Trial →] │
│                                      │
│  [Maybe later]                       │
└─────────────────────────────────────┘
```

---

## 📊 Key Metrics to Track

1. **Onboarding Completion Rate** (target: >80%)
2. **Time to Complete Onboarding** (target: <5 minutes)
3. **Upgrade Rate from Basic** (target: >25% after 30 days)
4. **Feature Discovery** (% of users who click locked features)
5. **Trial-to-Paid Conversion** (target: >40%)

---

## 🎯 Next Steps

1. ✅ Define feature limits clearly
2. Build onboarding wizard (5 steps)
3. Add upgrade prompts at key trigger points
4. Create "Restaurant Settings" page for post-onboarding edits
5. Build admin dashboard to view onboarding analytics

**Implementation Priority:**
1. Onboarding wizard (critical path)
2. Table limit enforcement
3. Reservation limit tracking
4. Team member limits
5. Feature gates for advanced analytics, waitlist, SMS

This strategy balances value for all tiers while creating clear upgrade incentives based on real business needs.
