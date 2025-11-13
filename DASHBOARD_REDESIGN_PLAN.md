# Advanced Dashboards Redesign Plan
## Vision: 3 World-Class Analytics Dashboards

**Goal**: Transform 8 mediocre dashboards into 3 exceptional, data-driven insights platforms that provide real business value to restaurant owners.

---

## 📊 The Three Core Dashboards

### **Dashboard 1: ML Performance & Interventions** 🤖
**Route**: `/host-dashboard/ml`
**Plan**: Basic → Professional
**Purpose**: Track AI-powered no-show prevention and calculate ROI

### **Dashboard 2: Customer Intelligence** 👥
**Route**: `/host-dashboard/customers`
**Plan**: Professional
**Purpose**: Understand customer behavior, lifetime value, and retention

### **Dashboard 3: Revenue Optimization** 💰
**Route**: `/host-dashboard/revenue`
**Plan**: Professional
**Purpose**: Track revenue patterns, peak times, and pricing opportunities

---

## 🎨 Dashboard 1: ML Performance & Interventions

### **Current State Analysis**
✅ **What Works**:
- MLROIWidget component exists
- API endpoint `/api/ml-outcomes?action=roi-summary` works
- Real database table: `ml_interventions`
- Clean metrics: ROI%, success rate, outcomes

❌ **What's Missing**:
- No intervention history/timeline
- No drill-down into individual interventions
- No action recommendations
- No cost breakdown by intervention type
- Missing trend graphs (ROI over time)

### **Redesign Plan**

#### **New Metrics & Features**:

**Hero Metrics** (Top Cards):
1. **ROI Percentage** - Current vs Target (300-500%)
   - Large number with color coding (green if >300%)
   - Trend arrow (↑↓) vs last period
   - Tooltip explaining calculation

2. **Total Value Saved** - €€€ in prevented no-shows
   - Month-to-date vs last month
   - Visual progress bar to monthly goal

3. **Success Rate** - % of interventions that worked
   - Percentage with trend
   - Breakdown by intervention type

4. **Active Interventions** - Currently in progress
   - Real-time count
   - Link to intervention queue

**Detailed Sections**:

1. **Intervention Timeline** (NEW)
   - Last 30 days of interventions
   - Expandable cards showing:
     - Customer name
     - Risk score (High/Medium/Low)
     - Action taken (Call, SMS, Email, Deposit)
     - Cost of intervention
     - Actual outcome (Showed/No-show/Cancelled)
     - Value saved/lost
   - Filter by: All / High ROI / Failed / In Progress

2. **ROI Trend Graph** (NEW)
   - Line chart showing ROI % over last 3 months
   - Weekly data points
   - Target line at 300%
   - Annotations for major changes

3. **Intervention Type Breakdown** (NEW)
   - Table comparing each intervention method:
     ```
     Type          | Count | Avg Cost | Success Rate | ROI
     -------------------------------------------------------------
     Phone Call    |   45  |  €5.00   |    68%       | 423%
     SMS Reminder  |   89  |  €0.50   |    52%       | 510%
     Email         |   23  |  €0.10   |    43%       | 890%
     Deposit Req   |   12  |  €2.00   |    91%       | 1240%
     ```

4. **Recommendations Engine** (NEW)
   - AI-powered suggestions:
     - "🔥 Increase SMS reminders - 510% ROI, only €0.50 cost"
     - "⚠️ Phone calls underperforming this week - check scripts"
     - "💡 Try deposit requirements for parties >6 - 91% success"

5. **Cost Analysis** (NEW)
   - Pie chart: Total spend by intervention type
   - Budget tracker: €214/€500 spent this month
   - Cost per prevented no-show metric

#### **UI/UX Design**:

**Visual Hierarchy**:
```
┌─────────────────────────────────────────────────────────┐
│  ML Performance Dashboard                    🔄 Live    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐          │
│  │  ROI 704% │  │ €1,720    │  │  67.6%    │          │
│  │  ↑ +12%   │  │ Saved     │  │ Success   │          │
│  │  🎯 Hit!  │  │ This Week │  │ Rate      │          │
│  └───────────┘  └───────────┘  └───────────┘          │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 📈 ROI Trend (Last 90 Days)                      │   │
│  │ [Line Graph: Jan 450% → Feb 580% → Mar 704%]     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 📋 Recent Interventions                 [Filter▾] │   │
│  │                                                    │   │
│  │  🔴 HIGH RISK • Maria Garcia • Party of 4        │   │
│  │  Action: Phone Call (€5) → ✅ Showed Up          │   │
│  │  Value Saved: €75 • ROI: 1400%                   │   │
│  │                                                    │   │
│  │  🟡 MEDIUM • John Smith • Party of 2             │   │
│  │  Action: SMS Reminder (€0.50) → ❌ No-Show       │   │
│  │  Cost Lost: €0.50                                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 💡 Smart Recommendations                          │   │
│  │  • SMS reminders show highest ROI this month     │   │
│  │  • Consider deposits for large parties (6+)      │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**Color Palette**:
- **Success/High ROI**: Emerald green (#10b981)
- **Warning/Medium**: Amber (#f59e0b)
- **Danger/Low ROI**: Red (#ef4444)
- **Info**: Blue (#3b82f6)
- **Neutral**: Slate (#64748b)

**Interactions**:
- Hover on intervention card → Expand to show full details
- Click ROI trend → Drill down to specific week
- Click intervention type → Filter timeline
- Click recommendation → Open action modal

#### **Backend Requirements**:

**Existing API** (`/api/ml-outcomes`):
- ✅ `GET ?action=roi-summary` - Already works
- ❌ Need: `GET ?action=intervention-history&limit=30`
- ❌ Need: `GET ?action=intervention-types-breakdown`
- ❌ Need: `GET ?action=roi-trend&period=90days`
- ❌ Need: `GET ?action=recommendations`

**Database Queries Needed**:
```sql
-- Intervention timeline
SELECT * FROM ml_interventions
WHERE created_at > NOW() - INTERVAL '30 days'
ORDER BY created_at DESC
LIMIT 50;

-- Type breakdown
SELECT
  intervention_type,
  COUNT(*) as count,
  AVG(cost_of_intervention) as avg_cost,
  SUM(CASE WHEN actual_outcome = 'showed_up' THEN 1 ELSE 0 END)::float / COUNT(*) * 100 as success_rate,
  (SUM(value_saved) / SUM(cost_of_intervention)) * 100 as roi
FROM ml_interventions
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY intervention_type;

-- ROI trend
SELECT
  DATE_TRUNC('week', created_at) as week,
  (SUM(value_saved) / NULLIF(SUM(cost_of_intervention), 0)) * 100 as roi
FROM ml_interventions
GROUP BY week
ORDER BY week DESC
LIMIT 12;
```

**Smart Recommendations Algorithm**:
```javascript
function generateRecommendations(interventionData) {
  const recommendations = [];

  // Find highest ROI intervention type
  const bestType = interventionData.types
    .filter(t => t.count > 5) // Min sample size
    .sort((a, b) => b.roi - a.roi)[0];

  if (bestType && bestType.roi > 400) {
    recommendations.push({
      type: 'increase_usage',
      icon: '🔥',
      message: `${bestType.name} shows ${bestType.roi}% ROI - use more often`,
      priority: 'high'
    });
  }

  // Identify underperforming types
  const worstType = interventionData.types
    .filter(t => t.count > 5)
    .sort((a, b) => a.roi - b.roi)[0];

  if (worstType && worstType.roi < 200) {
    recommendations.push({
      type: 'review_strategy',
      icon: '⚠️',
      message: `${worstType.name} underperforming at ${worstType.roi}% ROI`,
      priority: 'medium'
    });
  }

  // Budget optimization
  if (interventionData.totalSpent > interventionData.budget * 0.8) {
    recommendations.push({
      type: 'budget_alert',
      icon: '💰',
      message: `${Math.round(interventionData.totalSpent / interventionData.budget * 100)}% of budget used`,
      priority: 'high'
    });
  }

  return recommendations;
}
```

---

## 👥 Dashboard 2: Customer Intelligence

### **Purpose**: Unified customer insights combining LTV + behavior patterns

### **Current State**:
- ❌ LTVDashboard component exists but API unknown
- ❌ CustomerDNADashboard too complex, mostly UI mockups
- ✅ Database has `customer_history` table with good data

### **Redesign Plan**

#### **New Metrics & Features**:

**Hero Metrics**:
1. **Total Active Customers** - Dined in last 90 days
2. **Average LTV** - Revenue per customer over lifetime
3. **VIP Count** - Customers with >€500 LTV
4. **Churn Risk** - Customers who haven't returned in 60+ days

**Detailed Sections**:

1. **Customer Segments** (Visual Funnel)
   ```
   💎 VIP (15)           €8,450 total  • €563/customer
   ⭐ Regular (42)       €12,600 total • €300/customer
   ✨ Occasional (89)    €13,350 total • €150/customer
   🆕 New (34)           €2,040 total  • €60/customer
   ⚠️ At Risk (23)       €3,450 total  • €150/customer (CHURNING!)
   ```

2. **Top Customers Table** (Sortable)
   ```
   Name            | Visits | LTV     | Avg Party | Last Visit | Status
   --------------------------------------------------------------------
   Maria Garcia    |   18   | €1,240  |    4     | 3 days ago | VIP
   John Smith      |   12   | €890    |    2     | 1 week ago | Regular
   ...
   ```

3. **Behavioral Insights**
   - **Visit Frequency Distribution**
     - Chart showing: Weekly (5%), Monthly (35%), Quarterly (45%), Yearly (15%)

   - **Party Size Preferences**
     - Bar chart: Solo (8%), Couples (42%), Small Groups 3-4 (35%), Large 5+ (15%)

   - **Preferred Days/Times**
     - Heatmap: Weekday Lunch vs Dinner vs Weekend patterns

4. **Retention Analysis** (NEW)
   - **Customer Lifecycle**:
     ```
     Month 1-3:   45 customers (New → Trying)
     Month 4-6:   32 customers (Engaged → Regular)
     Month 7-12:  18 customers (Loyal → VIP)
     Month 13+:   12 customers (Champions)
     ```

   - **Churn Warning List**:
     - Customers who haven't visited in 60+ days
     - Suggested actions: "Send comeback offer", "Birthday discount"

5. **Win-Back Campaigns** (NEW)
   - Target at-risk customers with special offers
   - Track campaign success rate
   - Estimated value recovery

#### **UI/UX Design**:

```
┌─────────────────────────────────────────────────────────┐
│  Customer Intelligence                       Last 90d   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐          │
│  │    203    │  │   €180    │  │     15    │          │
│  │  Active   │  │  Avg LTV  │  │    VIPs   │          │
│  │ Customers │  │  ↑ +8%    │  │  💎       │          │
│  └───────────┘  └───────────┘  └───────────┘          │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 📊 Customer Segmentation                          │   │
│  │                                                    │   │
│  │  💎 VIP (15)          ████████░░  €8,450          │   │
│  │  ⭐ Regular (42)      ████████████████  €12,600   │   │
│  │  ✨ Occasional (89)   ████████████████████  €13k  │   │
│  │  🆕 New (34)          ████░░  €2,040              │   │
│  │  ⚠️ At Risk (23)      ██████░░  €3,450 [Action!] │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 🏆 Top Customers                        [Export▾] │   │
│  │  ┌──────────────────────────────────────────┐    │   │
│  │  │ Maria Garcia      18 visits  €1,240  💎  │    │   │
│  │  │ Last: 3 days ago • Avg party: 4 people  │    │   │
│  │  │ [View Profile] [Send Offer]              │    │   │
│  │  └──────────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ⚠️ Churn Risk Alert (23 customers)                │   │
│  │  Haven't visited in 60+ days                      │   │
│  │  Potential lost revenue: €3,450                   │   │
│  │  [Launch Win-Back Campaign]                       │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

#### **Backend Requirements**:

**New API Endpoint** (`/api/customer-intelligence`):
```javascript
GET /api/customer-intelligence?period=90

Response:
{
  summary: {
    total_active: 203,
    avg_ltv: 180.45,
    vip_count: 15,
    at_risk_count: 23
  },
  segments: {
    vip: { count: 15, total_revenue: 8450, avg_ltv: 563 },
    regular: { count: 42, total_revenue: 12600, avg_ltv: 300 },
    occasional: { count: 89, total_revenue: 13350, avg_ltv: 150 },
    new: { count: 34, total_revenue: 2040, avg_ltv: 60 },
    at_risk: { count: 23, total_revenue: 3450, avg_ltv: 150 }
  },
  top_customers: [
    {
      customer_id: "...",
      name: "Maria Garcia",
      total_visits: 18,
      ltv: 1240,
      avg_party_size: 4,
      last_visit: "2025-11-07",
      segment: "vip"
    }
  ],
  at_risk: [...],
  behavioral_insights: {
    visit_frequency: { weekly: 5, monthly: 35, quarterly: 45, yearly: 15 },
    party_sizes: { solo: 8, couples: 42, small_groups: 35, large: 15 },
    preferred_times: { ... }
  }
}
```

**Database Queries**:
```sql
-- Customer segmentation
WITH customer_metrics AS (
  SELECT
    customer_id,
    customer_name,
    total_visits,
    total_spent as ltv,
    average_party_size,
    last_visit_date,
    CASE
      WHEN total_spent >= 500 THEN 'vip'
      WHEN total_visits >= 8 THEN 'regular'
      WHEN total_visits >= 3 THEN 'occasional'
      WHEN total_visits < 3 THEN 'new'
    END as segment,
    CASE
      WHEN last_visit_date < NOW() - INTERVAL '60 days' THEN true
      ELSE false
    END as is_at_risk
  FROM customer_history
  WHERE last_visit_date > NOW() - INTERVAL '90 days'
)
SELECT
  segment,
  COUNT(*) as count,
  SUM(ltv) as total_revenue,
  AVG(ltv) as avg_ltv
FROM customer_metrics
WHERE NOT is_at_risk
GROUP BY segment;
```

---

## 💰 Dashboard 3: Revenue Optimization

### **Purpose**: Track revenue patterns, identify opportunities, optimize pricing

### **Current State**:
- ⚠️ PricingAnalytics component exists
- ⚠️ `/api/pricing` exists but unknown functionality
- ❌ No real pricing rules implementation

### **Redesign Plan**

#### **New Metrics & Features**:

**Hero Metrics**:
1. **Total Revenue** - This month vs last month
2. **Revenue Per Cover** - Average per diner
3. **Peak Revenue Hour** - Most profitable time slot
4. **Occupancy Revenue** - Rev per occupied seat

**Detailed Sections**:

1. **Revenue Trends**
   - Line graph: Daily revenue last 30 days
   - Comparison to previous period
   - Annotations for special events

2. **Time-Based Revenue Analysis**
   - **Day of Week Performance**:
     ```
     Mon: €1,240  (avg €45/cover)  ████░░░░
     Tue: €980    (avg €42/cover)  ███░░░░░
     Wed: €1,120  (avg €43/cover)  ████░░░░
     Thu: €1,890  (avg €52/cover)  ███████░
     Fri: €3,240  (avg €68/cover)  ████████
     Sat: €4,120  (avg €72/cover)  █████████
     Sun: €2,340  (avg €55/cover)  ████████
     ```

   - **Time Slot Performance**:
     - Lunch (12-3pm): €890/day avg
     - Dinner (7-10pm): €2,340/day avg
     - Late (10pm+): €120/day avg

3. **Capacity Utilization**
   - Heatmap showing occupied vs empty tables by hour
   - Identify underutilized time slots
   - Opportunity cost calculation

4. **Revenue Opportunities** (NEW)
   - **Low-Hanging Fruit**:
     - "Tuesday lunch only 30% occupied - run promotion?"
     - "Friday 9pm always full - test 10% surge pricing?"
     - "Weekend brunch untapped - add 11am slot?"

5. **Menu Performance** (FUTURE)
   - If menu data available from service records
   - Top revenue items
   - Profit margins

#### **UI/UX Design**:

```
┌─────────────────────────────────────────────────────────┐
│  Revenue Optimization                      This Month   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐          │
│  │  €45,230  │  │   €62     │  │  Friday   │          │
│  │   ↑ +12%  │  │ Per Cover │  │  8:00 PM  │          │
│  │ Total Rev │  │  Revenue  │  │ Peak Time │          │
│  └───────────┘  └───────────┘  └───────────┘          │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 📈 Revenue Trend (Last 30 Days)                   │   │
│  │ [Line Graph showing daily revenue]                │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 📅 Day of Week Performance                        │   │
│  │  Fri  €4,120  (€72/cover)  █████████  BEST       │   │
│  │  Sat  €4,120  (€72/cover)  █████████             │   │
│  │  Sun  €2,340  (€55/cover)  ████████              │   │
│  │  Thu  €1,890  (€52/cover)  ███████               │   │
│  │  Tue  €980    (€42/cover)  ███  OPPORTUNITY!     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 💡 Revenue Opportunities                          │   │
│  │  🎯 Tuesday lunch 30% occupied - test promotion  │   │
│  │  📊 Friday 8-9pm always 100% - try surge pricing │   │
│  │  ⏰ Add Sunday brunch slot (11am-2pm)            │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

#### **Backend Requirements**:

**New API** (`/api/revenue-optimization`):
```javascript
GET /api/revenue-optimization?period=30

Response:
{
  summary: {
    total_revenue: 45230,
    revenue_per_cover: 62,
    peak_day: "Friday",
    peak_time: "8:00 PM"
  },
  daily_trend: [
    { date: "2025-11-01", revenue: 1245, covers: 23 },
    ...
  ],
  day_of_week: {
    monday: { revenue: 1240, avg_per_cover: 45, occupancy: 0.45 },
    ...
  },
  time_slots: {
    lunch: { revenue: 890, occupancy: 0.35 },
    dinner: { revenue: 2340, occupancy: 0.82 },
    late: { revenue: 120, occupancy: 0.15 }
  },
  opportunities: [
    {
      type: "low_occupancy",
      message: "Tuesday lunch only 30% occupied",
      suggestion: "Run weekday lunch special",
      potential_revenue: 450
    }
  ]
}
```

**Database Queries**:
```sql
-- Revenue by day of week
SELECT
  EXTRACT(DOW FROM seated_at) as day_of_week,
  COUNT(*) as covers,
  SUM(estimated_revenue) as total_revenue,
  AVG(estimated_revenue) as avg_per_cover,
  COUNT(*)::float / (SELECT COUNT(*) FROM tables WHERE is_active = true) as occupancy
FROM service_records
WHERE
  seated_at > NOW() - INTERVAL '30 days'
  AND departed_at IS NOT NULL
GROUP BY day_of_week
ORDER BY total_revenue DESC;

-- Hourly revenue patterns
SELECT
  EXTRACT(HOUR FROM seated_at) as hour,
  COUNT(*) as covers,
  SUM(estimated_revenue) as revenue
FROM service_records
WHERE seated_at > NOW() - INTERVAL '30 days'
GROUP BY hour
ORDER BY revenue DESC;
```

---

## 🚀 Implementation Roadmap

### **Phase 1: Data Foundation** (Week 1)
- [ ] Audit all database tables for required data
- [ ] Create missing columns in `service_records` (estimated_revenue)
- [ ] Write and test all SQL queries
- [ ] Build 3 new API endpoints with real data

### **Phase 2: Backend APIs** (Week 1-2)
- [ ] `/api/ml-performance` - Full implementation
- [ ] `/api/customer-intelligence` - Segmentation + LTV
- [ ] `/api/revenue-optimization` - Revenue analytics
- [ ] Test all endpoints with Postman/curl
- [ ] Add error handling and validation

### **Phase 3: UI Components** (Week 2-3)
- [ ] Create reusable chart components (Line, Bar, Heatmap)
- [ ] Build metric card components with trends
- [ ] Create data table components with sorting/filtering
- [ ] Design color system and component library
- [ ] Build loading and empty states

### **Phase 4: Dashboard Pages** (Week 3-4)
- [ ] Rebuild MLPerformancePage with new design
- [ ] Create CustomerIntelligencePage (merge LTV + DNA)
- [ ] Create RevenueOptimizationPage
- [ ] Add real-time data refresh (30s polling)
- [ ] Test responsive design (mobile/tablet/desktop)

### **Phase 5: Polish & Testing** (Week 4)
- [ ] Add animations and micro-interactions
- [ ] Test with real production data
- [ ] Add helpful tooltips and guides
- [ ] Optimize performance (lazy loading, caching)
- [ ] User acceptance testing

### **Phase 6: Cleanup** (Week 4)
- [ ] Remove old dashboards (Pricing Rules, DNA, Segovia, etc.)
- [ ] Update sidebar navigation
- [ ] Update plan restrictions
- [ ] Update documentation
- [ ] Deploy to production

---

## 📐 Design System

### **Typography**:
- **Hero Numbers**: 3xl-4xl font, bold, colored
- **Section Headers**: xl font, bold, with icon
- **Metrics Labels**: sm font, muted color
- **Body Text**: base font, regular

### **Spacing**:
- Card padding: 6 (24px)
- Section gaps: 6-8 (24-32px)
- Component gaps: 3-4 (12-16px)

### **Components Library**:

1. **MetricCard**
   ```tsx
   <MetricCard
     value="€45,230"
     label="Total Revenue"
     trend={+12}
     icon={<DollarSign />}
     color="emerald"
   />
   ```

2. **TrendChart**
   ```tsx
   <TrendChart
     data={dailyRevenue}
     xAxis="date"
     yAxis="revenue"
     showGrid
     showTooltip
   />
   ```

3. **ProgressBar**
   ```tsx
   <ProgressBar
     value={82}
     max={100}
     label="Occupancy"
     color="blue"
     showPercentage
   />
   ```

4. **DataTable**
   ```tsx
   <DataTable
     columns={customerColumns}
     data={topCustomers}
     sortable
     filterable
     exportable
   />
   ```

---

## 🎯 Success Metrics

### **How We'll Know It's Working**:

1. **Data Accuracy**: 100% of metrics pulling from real database
2. **Load Time**: < 2 seconds for dashboard initial load
3. **User Engagement**: Restaurant owners check daily
4. **Actionability**: Recommendations lead to measurable improvements
5. **Visual Appeal**: Modern, professional, easy to understand

---

## 📝 Next Steps

**Immediate Actions**:
1. Review and approve this plan
2. Decide if we need Revenue Optimization or can start with 2 dashboards
3. I'll start with Phase 1 (Data Foundation) immediately
4. Build and test APIs before touching UI

**Questions for You**:
1. Do you track revenue per service record in the database?
2. Should Revenue Optimization be Professional or Enterprise plan?
3. Any specific metrics you want to see that I missed?
4. Timeline preference - 2 weeks or 4 weeks?

Ready to start building! 🚀
