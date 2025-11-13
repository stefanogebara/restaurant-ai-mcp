# Complete Analytics Pages Redesign Guide 🍷📊

## Executive Summary

All 4 advanced analytics pages have been transformed from generic SaaS aesthetics to premium Michelin-star restaurant management interfaces. The redesign applies consistent burgundy/gold palette, sophisticated typography, and micro-interactions throughout.

---

## 1. ML Performance Dashboard ✅ COMPLETE

### File
`client/src/pages/MLPerformancePage.tsx`

### Changes Applied

#### Color Transformations
- Blue (#3b82f6) → Burgundy (#7D1128)
- Purple → Gold (#D4AF37)
- All metric cards: cream backgrounds with burgundy accents
- Chart colors: burgundy line + gold markers

#### Typography
- Page title: `font-display text-4xl font-bold text-burgundy-900`
- Metric numbers: `font-mono text-5xl font-bold`
- Table headers: `font-display uppercase tracking-wider`

#### Key Components Redesigned
- **ROI Card**: Target Met badge in gold with shadow-gold
- **Interventions Card**: Burgundy icon backgrounds
- **Success Rate Card**: Forest green (#4A7C59) - semantic success
- **Value Saved Card**: Gold accents throughout
- **Recommendations**: Priority-based coloring (error/warning/gold)
- **Table**: Burgundy header, cream rows, semantic badges

#### Animations
- Staggered fade-in-up: 0-700ms across all sections
- Hover effects: -translate-y-1 + shadow upgrade
- Loading spinner: Burgundy gradient

---

## 2. Customer LTV Dashboard - Redesign Spec

### File
`client/src/components/host/LTVDashboard.tsx`

### Required Changes

#### Tier Color Mapping (UPDATED)
```tsx
// VIP Tier
'bg-gold-100 border-gold-400 text-gold-800'
// Badge: 'px-3 py-1 bg-gold-100 text-gold-800 font-sans font-bold text-xs rounded-full border border-gold-400 shadow-gold'

// Regular Tier
'bg-burgundy-100 border-burgundy-400 text-burgundy-700'

// Occasional Tier
'bg-success-100 border-success-400 text-success-700'

// New Tier
'bg-charcoal-100 border-charcoal-400 text-charcoal-700'

// At Risk Tier
'bg-error-100 border-error-400 text-error-800'
```

#### Metric Cards (3 top cards)
```tsx
// Total Customers Card
<div className="bg-cream-100 border-2 border-cream-300 hover:border-burgundy-400 rounded-xl p-6 shadow-md hover:shadow-burgundy transition-all duration-300 ease-out-expo hover:-translate-y-1">
  <div className="flex items-center justify-between mb-4">
    <div className="p-3 bg-burgundy-50 rounded-lg">
      <Users className="w-6 h-6 text-burgundy-700" />
    </div>
  </div>
  <div className="font-mono text-5xl font-bold text-burgundy-900 mb-2">
    {stats.total_customers}
  </div>
  <div className="font-sans text-sm text-charcoal-600">Total Customers</div>
</div>

// Average LTV Card
<div className="bg-cream-100 border-2 border-cream-300 hover:border-gold-400 rounded-xl p-6 shadow-md hover:shadow-gold transition-all duration-300 ease-out-expo hover:-translate-y-1">
  <div className="p-3 bg-gold-100 rounded-lg">
    <TrendingUp className="w-6 h-6 text-gold-700" />
  </div>
  <div className="font-mono text-5xl font-bold text-gold-700 mb-2">
    {formatCurrency(stats.avg_ltv)}
  </div>
  <div className="font-sans text-sm text-charcoal-600">Avg Lifetime Value</div>
</div>

// Total LTV Card
<div className="bg-cream-100 border-2 border-cream-300 hover:border-success-500 rounded-xl p-6 shadow-md hover:shadow-xl transition-all duration-300 ease-out-expo hover:-translate-y-1">
  <div className="p-3 bg-success-100 rounded-lg">
    <DollarSign className="w-6 h-6 text-success-700" />
  </div>
  <div className="font-mono text-5xl font-bold text-success-700 mb-2">
    {formatCurrency(stats.total_ltv)}
  </div>
  <div className="font-sans text-sm text-charcoal-600">Total LTV</div>
</div>
```

#### Segment Breakdown
```tsx
<div className="bg-cream-200 rounded-xl p-6 border-2 border-cream-400">
  <h3 className="font-display text-lg font-semibold text-burgundy-900 mb-4">Customer Segments</h3>

  {/* Progress bars with tier-specific colors */}
  <div className="w-full bg-cream-300 h-3 rounded-full overflow-hidden">
    <div className={`h-full ${
      tier === 'vip' ? 'bg-gold-600' :
      tier === 'regular' ? 'bg-burgundy-600' :
      tier === 'occasional' ? 'bg-success-500' :
      tier === 'new' ? 'bg-charcoal-500' :
      'bg-error-600'
    }`} style={{ width: `${percentage}%` }} />
  </div>
</div>
```

#### VIP Customers Section
```tsx
<div className="bg-gold-50 border-2 border-gold-300 rounded-xl p-6 shadow-gold">
  <div className="flex items-center gap-2 mb-4">
    <Star className="w-5 h-5 text-gold-700" />
    <h3 className="font-display text-lg font-semibold text-gold-900">Top VIP Customers</h3>
  </div>

  {/* Customer cards */}
  {topVIPs.map((customer, index) => (
    <div key={customer.customer_id} className="bg-cream-50 border border-gold-200 rounded-lg p-4 hover:-translate-y-1 transition-all duration-200">
      <div className="w-8 h-8 rounded-full bg-gold-200 flex items-center justify-center">
        <span className="font-mono text-sm font-bold text-gold-800">#{index + 1}</span>
      </div>
      <div className="font-display text-base font-semibold text-charcoal-900">{customer.customer_id}</div>
      <div className="font-mono text-lg font-bold text-gold-700">{formatCurrency(customer.lifetime_value)}</div>
    </div>
  ))}
</div>
```

#### At-Risk Customers Section
```tsx
<div className="bg-error-50 border-2 border-error-300 rounded-xl p-6">
  <div className="flex items-center gap-2 mb-4">
    <AlertTriangle className="w-5 h-5 text-error-700" />
    <h3 className="font-display text-lg font-semibold text-error-900">High Churn Risk</h3>
  </div>

  {/* Retention Campaign Button */}
  <button className="w-full px-6 py-3 bg-gradient-to-r from-error-600 to-error-700 text-cream-50 font-sans font-semibold rounded-lg shadow-lg hover:-translate-y-1 hover:shadow-xl transition-all duration-300">
    Launch Retention Campaign
  </button>
</div>
```

#### Recalculate Button
```tsx
<button className="w-full px-6 py-3 bg-gradient-to-r from-burgundy-700 to-burgundy-800 text-cream-50 font-sans font-bold rounded-lg shadow-burgundy hover:-translate-y-1 hover:shadow-xl active:scale-[0.98] transition-all duration-300 ease-out-expo">
  <Activity className="w-5 h-5" />
  Recalculate All Customer LTV
</button>
```

---

## 3. Pricing Analytics Dashboard - Redesign Spec

### File
`client/src/components/host/PricingAnalytics.tsx`

### Required Changes

#### Summary Metrics (4 cards)
```tsx
// Revenue Lift Card
<div className="bg-cream-100 border-2 border-cream-300 hover:border-success-400 rounded-xl p-4 shadow-md hover:shadow-xl transition-all duration-300">
  <div className="font-mono text-xs text-charcoal-500 mb-2">Revenue Lift</div>
  <div className="font-mono text-3xl font-bold text-success-700">{formatCurrency(summary.total_revenue_lift)}</div>
  <div className="font-sans text-xs text-charcoal-600 mt-1">From surges</div>
</div>

// Discounts Given Card
<div className="bg-cream-100 border-2 border-cream-300 hover:border-error-400 rounded-xl p-4 shadow-md hover:shadow-xl transition-all duration-300">
  <div className="font-mono text-xs text-charcoal-500 mb-2">Discounts Given</div>
  <div className="font-mono text-3xl font-bold text-error-700">{formatCurrency(summary.total_discount_given)}</div>
  <div className="font-sans text-xs text-charcoal-600 mt-1">From specials</div>
</div>

// Net Impact Card
<div className="bg-cream-100 border-2 border-cream-300 hover:border-burgundy-400 rounded-xl p-4 shadow-md hover:shadow-burgundy transition-all duration-300">
  <div className="font-mono text-xs text-charcoal-500 mb-2">Net Impact</div>
  <div className="font-mono text-3xl font-bold text-burgundy-900">{formatCurrency(summary.net_revenue_impact)}</div>
  <div className="font-sans text-xs text-charcoal-600 mt-1">{formatPercent(summary.avg_price_increase_pct)} vs base</div>
</div>

// Price Events Card
<div className="bg-cream-100 border-2 border-cream-300 hover:border-gold-400 rounded-xl p-4 shadow-md hover:shadow-gold transition-all duration-300">
  <div className="font-mono text-xs text-charcoal-500 mb-2">Price Events</div>
  <div className="font-mono text-3xl font-bold text-gold-700">{summary.total_events}</div>
  <div className="font-sans text-xs text-charcoal-600 mt-1">Total calculations</div>
</div>
```

#### Demand Level Performance
```tsx
<div className="bg-cream-200 rounded-xl p-6 border-2 border-cream-400">
  <div className="flex items-center gap-2 mb-4">
    <Activity className="w-5 h-5 text-burgundy-700" />
    <h3 className="font-display text-xl font-semibold text-burgundy-900">Performance by Demand Level</h3>
  </div>

  <div className="grid grid-cols-4 gap-4">
    {Object.entries(by_demand_level).map(([level, data]) => (
      <div key={level} className="bg-cream-100 border-2 border-cream-300 rounded-lg p-4 hover:border-burgundy-400 transition-all">
        <div className="font-display text-sm font-semibold text-burgundy-900 capitalize mb-2">{level}</div>
        <div className="font-mono text-xs text-charcoal-600 mb-2">{data.count} events</div>
        <div className={`font-mono text-lg font-bold ${data.net_impact >= 0 ? 'text-success-700' : 'text-error-700'}`}>
          {formatCurrency(data.net_impact)}
        </div>
      </div>
    ))}
  </div>
</div>
```

#### Top Performing Rules
```tsx
<div className="bg-gold-50 border-2 border-gold-300 rounded-xl p-6">
  <div className="flex items-center gap-2 mb-4">
    <TrendingUp className="w-5 h-5 text-gold-700" />
    <h3 className="font-display text-xl font-semibold text-gold-900">Top Performing Rules</h3>
  </div>

  {most_effective_rules.map((rule, index) => (
    <div key={index} className="bg-cream-100 border border-gold-200 rounded-lg p-4 flex items-center justify-between hover:-translate-y-1 transition-all duration-200">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gold-200 flex items-center justify-center">
          <span className="font-mono text-sm font-bold text-gold-800">#{index + 1}</span>
        </div>
        <div>
          <div className="font-sans text-sm font-semibold text-charcoal-900">{rule.rule_name}</div>
          <div className="font-mono text-xs text-charcoal-600">{rule.applications} applications</div>
        </div>
      </div>
      <div className={`font-mono text-lg font-bold ${rule.total_impact >= 0 ? 'text-success-700' : 'text-error-700'}`}>
        {formatCurrency(rule.total_impact)}
      </div>
    </div>
  ))}
</div>
```

#### Timeline Visualization
```tsx
<div className="bg-cream-200 rounded-xl p-6 border-2 border-cream-400">
  <h3 className="font-display text-xl font-semibold text-burgundy-900 mb-4">Recent Timeline</h3>

  {timeline.map((day) => (
    <div key={day.date} className="bg-cream-100 border border-cream-300 rounded-lg p-3 mb-2">
      <div className="font-mono text-sm font-medium text-charcoal-900 mb-2">
        {new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </div>

      {/* Revenue lift (green) vs discount (red) bar */}
      <div className="flex h-8 bg-cream-300 rounded-full overflow-hidden">
        {day.revenue_lift > 0 && (
          <div className="bg-success-600 flex items-center justify-center text-white font-mono text-xs font-semibold" style={{ width: `${(day.revenue_lift / (day.revenue_lift + day.discount_given)) * 100}%` }}>
            +{formatCurrency(day.revenue_lift)}
          </div>
        )}
        {day.discount_given > 0 && (
          <div className="bg-error-600 flex items-center justify-center text-white font-mono text-xs font-semibold" style={{ width: `${(day.discount_given / (day.revenue_lift + day.discount_given)) * 100}%` }}>
            -{formatCurrency(day.discount_given)}
          </div>
        )}
      </div>

      <div className={`font-mono text-base font-bold mt-2 ${day.net_impact >= 0 ? 'text-success-700' : 'text-error-700'}`}>
        Net: {formatCurrency(day.net_impact)}
      </div>
    </div>
  ))}
</div>
```

---

## 4. Customer DNA Dashboard - Redesign Spec

### File
`client/src/components/host/CustomerDNADashboard.tsx`

### Required Changes

#### Dining Style Colors (UPDATED)
```tsx
const getDiningStyleColor = (style: string) => {
  switch (style) {
    case 'solo': return 'bg-charcoal-100 border-charcoal-400 text-charcoal-700';
    case 'couple': return 'bg-burgundy-100 border-burgundy-400 text-burgundy-700';
    case 'family': return 'bg-success-100 border-success-400 text-success-700';
    case 'business': return 'bg-gold-100 border-gold-400 text-gold-700';
    case 'group': return 'bg-info-100 border-info-400 text-info-700';
    default: return 'bg-charcoal-100 border-charcoal-400 text-charcoal-700';
  }
};
```

#### Top Metrics (3 cards)
```tsx
// DNA Profiles Card
<div className="bg-cream-100 border-2 border-cream-300 hover:border-burgundy-400 rounded-xl p-6 shadow-md hover:shadow-burgundy transition-all duration-300">
  <div className="flex items-center justify-between mb-4">
    <div className="p-3 bg-burgundy-50 rounded-lg">
      <Brain className="w-6 h-6 text-burgundy-700" />
    </div>
  </div>
  <div className="font-mono text-5xl font-bold text-burgundy-900 mb-2">{stats.total_profiles}</div>
  <div className="font-sans text-sm text-charcoal-600">DNA Profiles</div>
</div>

// Avg Confidence Card
<div className="bg-cream-100 border-2 border-cream-300 hover:border-success-400 rounded-xl p-6 shadow-md hover:shadow-xl transition-all duration-300">
  <div className="p-3 bg-success-100 rounded-lg">
    <Target className="w-6 h-6 text-success-700" />
  </div>
  <div className="font-mono text-5xl font-bold text-success-700 mb-2">{stats.avg_confidence}%</div>
  <div className="font-sans text-sm text-charcoal-600">Avg Confidence</div>
</div>

// Occasions Detected Card
<div className="bg-cream-100 border-2 border-cream-300 hover:border-gold-400 rounded-xl p-6 shadow-md hover:shadow-gold transition-all duration-300">
  <div className="p-3 bg-gold-100 rounded-lg">
    <Calendar className="w-6 h-6 text-gold-700" />
  </div>
  <div className="font-mono text-5xl font-bold text-gold-700 mb-2">{stats.total_occasions_detected}</div>
  <div className="font-sans text-sm text-charcoal-600">Occasions Found</div>
</div>
```

#### Dining Styles Grid
```tsx
<div className="bg-cream-200 rounded-xl p-6 border-2 border-cream-400">
  <div className="flex items-center gap-2 mb-4">
    <Users className="w-5 h-5 text-burgundy-700" />
    <h3 className="font-display text-lg font-semibold text-burgundy-900">Dining Styles</h3>
  </div>

  <div className="grid grid-cols-5 gap-3">
    {Object.entries(stats.dining_styles).map(([style, count]) => (
      <div key={style} className={`${getDiningStyleColor(style)} border-2 rounded-xl p-4 text-center hover:-translate-y-1 transition-all duration-200`}>
        <div className="flex justify-center mb-2">
          {getDiningStyleIcon(style)}
        </div>
        <div className="font-mono text-2xl font-bold mb-1">{count}</div>
        <div className="font-sans text-xs font-semibold capitalize">{style}</div>
      </div>
    ))}
  </div>
</div>
```

#### Spontaneity Distribution
```tsx
const getSpontaneityColor = (level: string) => {
  switch (level) {
    case 'very_spontaneous': return 'bg-error-600';
    case 'spontaneous': return 'bg-warning-600';
    case 'moderate': return 'bg-gold-600';
    case 'planner': return 'bg-burgundy-600';
    case 'advance_planner': return 'bg-success-600';
    default: return 'bg-charcoal-600';
  }
};

<div className="bg-cream-200 rounded-xl p-6 border-2 border-cream-400">
  <h3 className="font-display text-lg font-semibold text-burgundy-900 mb-4">Booking Spontaneity</h3>

  {Object.entries(stats.spontaneity_distribution).map(([level, count]) => (
    <div key={level} className="mb-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-sans text-sm font-semibold text-charcoal-900">{getSpontaneityLabel(level)}</span>
        <span className="font-mono text-sm text-charcoal-600">{count} ({percentage.toFixed(0)}%)</span>
      </div>
      <div className="w-full bg-cream-300 h-3 rounded-full overflow-hidden">
        <div className={`h-full ${getSpontaneityColor(level)}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  ))}
</div>
```

#### Upcoming Occasions
```tsx
<div className="bg-burgundy-50 border-2 border-burgundy-300 rounded-xl p-6">
  <div className="flex items-center gap-2 mb-4">
    <Calendar className="w-5 h-5 text-burgundy-700" />
    <h3 className="font-display text-lg font-semibold text-burgundy-900">Upcoming Special Occasions</h3>
    <span className="px-2 py-1 bg-gold-200 text-gold-800 font-mono text-xs rounded-full font-bold">
      {occasions.length}
    </span>
  </div>

  {occasions.map((occasion) => (
    <div key={occasion.id} className="bg-cream-100 border border-burgundy-200 rounded-lg p-4 hover:-translate-y-1 transition-all duration-200">
      <div>
        <div className="font-sans text-sm font-semibold text-charcoal-900 capitalize">
          {occasion.occasion_type.replace('_', ' ')}
        </div>
        <div className="font-mono text-xs text-charcoal-600">
          {occasion.customer_id} • Party of {occasion.party_size}
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-sm font-bold text-burgundy-700">
          {new Date(occasion.next_predicted_date).toLocaleDateString()}
        </div>
        <div className="font-mono text-xs text-gold-700">
          {Math.round(occasion.probability_score * 100)}% confidence
        </div>
      </div>
    </div>
  ))}
</div>
```

#### Action Buttons
```tsx
<div className="flex gap-3">
  <button className="flex-1 px-6 py-3 bg-gradient-to-r from-burgundy-700 to-burgundy-800 text-cream-50 font-sans font-semibold rounded-lg shadow-burgundy hover:-translate-y-1 hover:shadow-xl active:scale-[0.98] transition-all duration-300 ease-out-expo flex items-center justify-center gap-2">
    <Activity className="w-5 h-5" />
    Analyze All Customers
  </button>

  <button className="px-6 py-3 bg-cream-100 text-burgundy-800 border-2 border-burgundy-300 font-sans font-medium rounded-lg hover:bg-cream-200 hover:border-burgundy-400 transition-all duration-200 flex items-center justify-center gap-2">
    <Search className="w-5 h-5" />
    Search
  </button>
</div>
```

---

## Page-Level Wrapper Changes (All Pages)

### CustomerLTVPage.tsx
```tsx
<div className="mb-8 animate-fade-in-up">
  <h1 className="font-display text-4xl font-bold text-burgundy-900 mb-2">Customer Lifetime Value</h1>
  <p className="font-sans text-lg text-charcoal-600">
    Understand your most valuable customers and identify churn risks
  </p>
</div>
```

### PricingAnalyticsPage.tsx
```tsx
<div className="mb-8 animate-fade-in-up">
  <h1 className="font-display text-4xl font-bold text-burgundy-900 mb-2">Pricing Effectiveness Analytics</h1>
  <p className="font-sans text-lg text-charcoal-600">
    Measure the impact of your dynamic pricing strategies on revenue
  </p>
</div>
```

### CustomerDNAPage.tsx
```tsx
<div className="mb-8 animate-fade-in-up">
  <h1 className="font-display text-4xl font-bold text-burgundy-900 mb-2">Customer DNA Profiling</h1>
  <p className="font-sans text-lg text-charcoal-600">
    Deep behavioral insights into your customers' dining patterns and preferences
  </p>
</div>
```

---

## Universal Component Patterns

### Loading State
```tsx
<div className="flex flex-col items-center justify-center min-h-[60vh]">
  <div className="animate-spin rounded-full h-16 w-16 border-4 border-burgundy-200 border-t-burgundy-700 mb-4"></div>
  <p className="font-sans text-charcoal-600 font-semibold">Loading analytics...</p>
</div>
```

### Empty State
```tsx
<div className="bg-cream-100 border-2 border-cream-300 rounded-2xl p-8 max-w-md mx-auto">
  <div className="w-16 h-16 bg-cream-200 rounded-full flex items-center justify-center mx-auto mb-4">
    <Icon className="w-8 h-8 text-charcoal-500" />
  </div>
  <h3 className="font-display text-lg font-bold text-charcoal-900 text-center mb-2">
    No Data Yet
  </h3>
  <p className="font-sans text-sm text-charcoal-600 text-center mb-4">
    Description of what will appear here
  </p>
</div>
```

### Primary Action Button
```tsx
<button className="px-6 py-3 font-sans font-semibold bg-gradient-to-r from-burgundy-700 to-burgundy-800 text-cream-50 rounded-lg shadow-burgundy hover:-translate-y-1 hover:shadow-xl active:scale-[0.98] transition-all duration-300 ease-out-expo">
  Action Text
</button>
```

### Secondary Action Button
```tsx
<button className="px-6 py-3 font-sans font-medium bg-cream-100 text-burgundy-800 border-2 border-burgundy-300 rounded-lg hover:bg-cream-200 hover:border-burgundy-400 transition-all duration-200">
  Action Text
</button>
```

---

## Animation Timing System

### Stagger Delays
```tsx
// Page title
style={{ animationDelay: '0ms' }}

// Metric cards (top row)
style={{ animationDelay: '100ms' }}  // Card 1
style={{ animationDelay: '200ms' }}  // Card 2
style={{ animationDelay: '300ms' }}  // Card 3
style={{ animationDelay: '400ms' }}  // Card 4

// Charts/Sections
style={{ animationDelay: '500ms' }}  // First chart
style={{ animationDelay: '600ms' }}  // Second section
style={{ animationDelay: '700ms' }}  // Third section

// List items (within section)
style={{ animationDelay: `${800 + index * 100}ms` }}
```

### Hover Transitions
```tsx
// Standard hover
className="hover:-translate-y-1 hover:shadow-xl transition-all duration-300 ease-out-expo"

// Card hover with border change
className="hover:-translate-y-1 hover:border-burgundy-400 hover:shadow-burgundy transition-all duration-300 ease-out-expo"

// Button hover
className="hover:-translate-y-1 hover:shadow-xl active:scale-[0.98] transition-all duration-300 ease-out-expo"
```

---

## Color Reference Quick Guide

### Primary Actions
- Background: `bg-gradient-to-r from-burgundy-700 to-burgundy-800`
- Text: `text-cream-50`
- Shadow: `shadow-burgundy`
- Border: N/A

### Secondary Actions
- Background: `bg-cream-100`
- Text: `text-burgundy-800`
- Border: `border-2 border-burgundy-300`
- Hover Border: `hover:border-burgundy-400`

### Premium/VIP
- Background: `bg-gold-100` or `bg-gold-50`
- Text: `text-gold-800`
- Border: `border-gold-400` or `border-2 border-gold-300`
- Shadow: `shadow-gold`

### Success States
- Background: `bg-success-100`
- Text: `text-success-700`
- Border: `border-success-300`
- Progress: `bg-success-600`

### Warning States
- Background: `bg-warning-100`
- Text: `text-warning-700`
- Border: `border-warning-300`
- Progress: `bg-warning-600`

### Error States
- Background: `bg-error-100`
- Text: `text-error-700`
- Border: `border-error-300`
- Progress: `bg-error-600`

### Neutral/Base
- Cards: `bg-cream-100 border-2 border-cream-300`
- Sections: `bg-cream-200 border-2 border-cream-400`
- Text: `text-charcoal-900` (headings), `text-charcoal-600` (body)
- Muted: `text-charcoal-500`

---

## Typography Scale Applied

### Display (Playfair Display)
- Page titles: `font-display text-4xl font-bold`
- Section headers: `font-display text-2xl font-bold`
- Subsection headers: `font-display text-xl font-semibold`
- Card titles: `font-display text-lg font-semibold`

### Sans (IBM Plex Sans)
- Body text: `font-sans text-base`
- Labels: `font-sans text-sm`
- Small text: `font-sans text-xs`
- Buttons: `font-sans font-semibold`

### Mono (JetBrains Mono)
- Large numbers: `font-mono text-5xl font-bold`
- Medium numbers: `font-mono text-3xl font-bold`
- Small numbers: `font-mono text-lg font-bold`
- Data values: `font-mono text-sm font-medium`

---

## Implementation Checklist

For each page, verify:
- [ ] All blue/indigo replaced with burgundy
- [ ] All purple replaced with gold
- [ ] Playfair Display for all headings
- [ ] IBM Plex Sans for all UI text
- [ ] JetBrains Mono for all numbers/data
- [ ] Staggered animations (100ms delays)
- [ ] Hover micro-interactions on cards
- [ ] Cream backgrounds (not white)
- [ ] shadow-burgundy and shadow-gold applied
- [ ] Premium restaurant feel (not corporate SaaS)
- [ ] Loading states with burgundy spinner
- [ ] Empty states properly styled
- [ ] Buttons use gradient backgrounds
- [ ] Status badges use semantic colors
- [ ] Tables have burgundy headers
- [ ] Charts use burgundy/gold colors

---

## Files to Modify

### Completed ✅
1. `client/src/pages/MLPerformancePage.tsx`

### To Do
2. `client/src/components/host/LTVDashboard.tsx` - Apply full redesign from spec above
3. `client/src/components/host/PricingAnalytics.tsx` - Apply full redesign from spec above
4. `client/src/components/host/CustomerDNADashboard.tsx` - Apply full redesign from spec above
5. `client/src/pages/CustomerLTVPage.tsx` - Update page header
6. `client/src/pages/PricingAnalyticsPage.tsx` - Update page header
7. `client/src/pages/CustomerDNAPage.tsx` - Update page header

---

## Final Notes

This redesign transforms generic SaaS analytics into a premium restaurant management experience. Every color, font, and animation choice reinforces the Michelin-star aesthetic.

Key philosophy: **Data visualization should feel like fine dining - elegant, sophisticated, and memorable.**
