# Phase 3 Implementation Roadmap
## Restaurant AI MCP - Advanced Features

**Created**: October 18, 2025
**Status**: Planning Phase
**Target Completion**: Q4 2025

---

## 🎯 Phase 3 Overview

With Phase 1 (Customer Reservation Bot) and Phase 2 (Host Dashboard) fully operational, Phase 3 focuses on advanced features that enhance operational efficiency, customer experience, and business intelligence.

### Core Objectives
1. **Waitlist Management** - Handle walk-ins when fully booked
2. **Customer Preferences & History** - Personalize dining experiences
3. **Analytics & Reporting** - Data-driven decision making
4. **Advanced Table Management** - Optimize floor operations

---

## 📋 Feature Breakdown

### 1. Waitlist Management System

**Priority**: HIGH
**Estimated Effort**: 3-4 weeks
**Dependencies**: None

#### Features
- **Waitlist Queue**
  - Add customers to waitlist when no tables available
  - Estimated wait time calculation based on current occupancy
  - SMS/email notifications when table becomes available
  - Priority queue (reservations vs walk-ins)

- **Waitlist Dashboard**
  - Real-time waitlist view in host dashboard
  - Drag-and-drop priority reordering
  - Customer contact info quick access
  - Remove/skip functionality

- **Smart Matching**
  - Auto-suggest next customer when table frees up
  - Match party size to optimal table
  - Consider wait time fairness

#### Technical Implementation

**Database Schema** (New Airtable Table):
```
Waitlist Table (tblWaitlist)
├── Waitlist ID (autonumber, primary)
├── Customer Name (text)
├── Customer Phone (text)
├── Customer Email (text, optional)
├── Party Size (number)
├── Added At (datetime)
├── Estimated Wait (number, minutes)
├── Status (single select: waiting, notified, seated, cancelled)
├── Priority (number)
├── Special Requests (text)
└── Notified At (datetime)
```

**API Endpoints**:
- `POST /api/waitlist` - Add to waitlist
- `GET /api/waitlist` - Get current waitlist
- `PATCH /api/waitlist/:id` - Update waitlist entry
- `DELETE /api/waitlist/:id` - Remove from waitlist
- `POST /api/waitlist/:id/notify` - Send notification

**Frontend Components**:
- `WaitlistPanel.tsx` - Main waitlist UI
- `WaitlistCard.tsx` - Individual waitlist entry
- `AddToWaitlistModal.tsx` - Add customer modal
- `NotifyCustomerModal.tsx` - Send notification UI

**Key Files to Create/Modify**:
- `api/routes/waitlist.js` - Waitlist endpoints
- `api/services/notifications.js` - SMS/Email service (Twilio/SendGrid)
- `client/src/components/host/WaitlistPanel.tsx`
- `client/src/services/waitlistAPI.ts`

#### User Stories
1. As a host, I want to add walk-in customers to a waitlist when no tables are available
2. As a host, I want to see estimated wait times for customers on the waitlist
3. As a host, I want to notify customers when their table is ready
4. As a customer, I want to receive a text message when my table is available
5. As a host, I want to remove customers who don't show up from the waitlist

---

### 2. Customer Preferences & History

**Priority**: MEDIUM
**Estimated Effort**: 4-5 weeks
**Dependencies**: None

#### Features
- **Customer Profiles**
  - Track repeat customers
  - Store seating preferences (window, quiet, patio)
  - Dietary restrictions and allergies
  - Favorite dishes/drinks
  - Special occasions (birthdays, anniversaries)

- **Visit History**
  - Past reservations and visits
  - Average spend per visit
  - Frequency analysis
  - No-show tracking

- **Smart Suggestions**
  - Recommend tables based on preferences
  - Suggest menu items based on history
  - Identify VIP customers
  - Flag potential no-shows

#### Technical Implementation

**Database Schema** (New Airtable Table):
```
Customers Table (tblCustomers)
├── Customer ID (autonumber, primary)
├── Name (text)
├── Phone (text, unique)
├── Email (text)
├── Seating Preferences (multiple select: window, quiet, patio, bar)
├── Dietary Restrictions (text)
├── Allergies (text)
├── Favorite Items (text)
├── Notes (long text)
├── Total Visits (number)
├── Last Visit (datetime)
├── Average Spend (currency)
├── No Show Count (number)
├── VIP Status (checkbox)
└── Created At (datetime)

Visit History Table (tblVisitHistory)
├── Visit ID (autonumber, primary)
├── Customer ID (linked to Customers)
├── Reservation ID (linked to Reservations)
├── Service ID (linked to Service Records)
├── Visit Date (datetime)
├── Party Size (number)
├── Table Numbers (text)
├── Spend Amount (currency, optional)
├── Items Ordered (text, optional)
└── Feedback Notes (text, optional)
```

**API Endpoints**:
- `GET /api/customers` - Search customers
- `GET /api/customers/:phone` - Get customer by phone
- `POST /api/customers` - Create/update customer profile
- `GET /api/customers/:id/history` - Get visit history
- `POST /api/customers/:id/preferences` - Update preferences

**Frontend Components**:
- `CustomerProfileModal.tsx` - View/edit customer profile
- `CustomerSearchBar.tsx` - Quick search for customers
- `VisitHistoryList.tsx` - Display past visits
- `PreferenceIndicators.tsx` - Show preferences on reservations

**Key Files to Create/Modify**:
- `api/routes/customers.js` - Customer endpoints
- `api/services/customerInsights.js` - Analytics logic
- `client/src/components/host/CustomerProfileModal.tsx`
- Update `WalkInModal.tsx` and `CheckInModal.tsx` to show customer history

#### User Stories
1. As a host, I want to see if a customer has dined with us before
2. As a host, I want to know a customer's seating preferences
3. As a host, I want to flag VIP customers for special attention
4. As a host, I want to see a customer's dietary restrictions
5. As a system, I want to track no-show patterns to improve predictions

---

### 3. Analytics & Reporting

**Priority**: MEDIUM
**Estimated Effort**: 3-4 weeks
**Dependencies**: Customer History (optional but recommended)

#### Features
- **Occupancy Analytics**
  - Peak hours identification
  - Day-of-week patterns
  - Seasonal trends
  - Average dining duration by party size

- **Revenue Insights**
  - Table turnover rates
  - Revenue per table
  - Average party size trends
  - Reservation vs walk-in ratio

- **Operational Metrics**
  - Service times
  - Wait time accuracy
  - No-show rates
  - Cancellation patterns

- **Reporting Dashboard**
  - Daily summary reports
  - Weekly/monthly trends
  - Exportable CSV/PDF reports
  - Custom date range selection

#### Technical Implementation

**Frontend Components**:
- `AnalyticsDashboard.tsx` - Main analytics page
- `OccupancyChart.tsx` - Line/bar charts for occupancy
- `RevenueMetrics.tsx` - Revenue insights cards
- `TrendChart.tsx` - Reusable chart component
- `ReportExport.tsx` - Export functionality

**Data Processing**:
- Use existing Service Records and Reservations data
- Aggregate queries for performance
- Cache daily summaries
- Background job for nightly report generation

**Charting Library**:
- **Recommendation**: Recharts or Chart.js
- Lightweight, React-friendly
- Good TypeScript support

**API Endpoints**:
- `GET /api/analytics/occupancy?start=YYYY-MM-DD&end=YYYY-MM-DD`
- `GET /api/analytics/revenue?start=YYYY-MM-DD&end=YYYY-MM-DD`
- `GET /api/analytics/peak-hours`
- `GET /api/analytics/no-show-rate`
- `POST /api/analytics/export` - Generate PDF/CSV

**Key Files to Create/Modify**:
- `api/routes/analytics.js` - Analytics endpoints
- `api/services/analyticsEngine.js` - Data aggregation logic
- `client/src/pages/AnalyticsDashboard.tsx`
- `client/src/components/analytics/` - Chart components

#### User Stories
1. As a manager, I want to see which hours are busiest
2. As a manager, I want to identify revenue-generating tables
3. As a manager, I want to track no-show patterns
4. As a manager, I want to export weekly reports
5. As a manager, I want to see average dining duration by party size

---

### 4. Advanced Table Management

**Priority**: LOW
**Estimated Effort**: 2-3 weeks
**Dependencies**: None

#### Features
- **Table Combining/Splitting**
  - Merge small tables for large parties
  - Split large tables for smaller groups
  - Visual drag-and-drop floor plan

- **Special Section Management**
  - Private dining rooms
  - Outdoor patio seasonality (open/close sections)
  - Bar vs dining room separate management

- **Table Assignment Rules**
  - VIP table preferences
  - Server section assignments
  - Accessibility requirements
  - Time-based availability

- **Floor Plan Visualization**
  - Interactive draggable floor plan
  - Real-time table status colors
  - Hover for table details
  - Quick actions on click

#### Technical Implementation

**Database Schema Updates**:
```
Tables Table (existing, add fields):
├── Can Combine With (linked to Tables, multiple)
├── Section Assignment (single select: main, patio, bar, private)
├── Server Assignment (text)
├── Accessibility (checkbox)
├── VIP Preferred (checkbox)
└── Seasonal (checkbox)

Table Combinations (new table):
├── Combination ID (autonumber)
├── Combined Tables (linked to Tables, multiple)
├── Total Capacity (rollup)
└── Currently Combined (checkbox)
```

**Frontend Components**:
- `FloorPlanEditor.tsx` - Drag-and-drop floor designer
- `TableCombineModal.tsx` - Combine/split tables
- `SectionManager.tsx` - Open/close sections
- `ServerAssignment.tsx` - Assign servers to sections

**Key Files to Create/Modify**:
- `api/routes/table-management.js` - Advanced table ops
- `client/src/components/host/FloorPlanEditor.tsx`
- Update `TableGrid.tsx` to support drag-and-drop

#### User Stories
1. As a host, I want to combine two 4-seat tables for a party of 8
2. As a manager, I want to close the patio section in bad weather
3. As a host, I want to assign tables to specific servers
4. As a host, I want to see which tables are wheelchair accessible
5. As a host, I want to reserve specific tables for VIP customers

---

## 🚀 Implementation Plan

### Phase 3.1: Waitlist (Weeks 1-4)
**Goal**: Basic waitlist functionality operational

**Week 1**: Database & API
- Create Waitlist table in Airtable
- Implement waitlist CRUD endpoints
- Add notification service (Twilio/SendGrid)

**Week 2**: Frontend UI
- Build WaitlistPanel component
- Add to host dashboard
- Implement add/remove functionality

**Week 3**: Smart Features
- Estimated wait time algorithm
- Auto-matching when table frees
- Priority queue logic

**Week 4**: Notifications & Testing
- SMS/Email integration
- End-to-end testing
- Production deployment

### Phase 3.2: Customer Profiles (Weeks 5-9)
**Goal**: Customer history and preferences tracking

**Week 5**: Database Design
- Create Customers and Visit History tables
- Link to existing Reservations/Service Records
- Migration script for existing data

**Week 6-7**: API & Backend
- Customer CRUD endpoints
- Visit history tracking
- Insights generation logic

**Week 8**: Frontend Integration
- Customer search in modals
- Profile display
- Preference indicators

**Week 9**: Testing & Refinement
- VIP identification
- No-show prediction
- Production deployment

### Phase 3.3: Analytics (Weeks 10-13)
**Goal**: Data visualization and reporting

**Week 10**: Data Aggregation
- Analytics endpoints
- Query optimization
- Caching strategy

**Week 11-12**: Dashboard UI
- Install charting library
- Build analytics page
- Charts for occupancy, revenue, trends

**Week 13**: Export & Polish
- PDF/CSV export
- Date range selection
- Production deployment

### Phase 3.4: Advanced Tables (Weeks 14-16)
**Goal**: Enhanced floor management

**Week 14**: Table Combinations
- Database schema updates
- Combine/split logic
- API endpoints

**Week 15**: Section Management
- Open/close sections
- Server assignments
- Accessibility flags

**Week 16**: Floor Plan UI
- Interactive floor plan
- Drag-and-drop (optional)
- Testing & deployment

---

## 📊 Success Metrics

### Waitlist
- 90%+ customers notified within 2 min of table availability
- <5 min average time from "table ready" to seated
- 80%+ waitlist customers successfully seated

### Customer Profiles
- 60%+ repeat customers identified automatically
- 50%+ reservations have preference data
- 15% reduction in no-shows via prediction

### Analytics
- Daily reports generated automatically
- <2 sec page load for analytics dashboard
- 100% data accuracy vs manual counts

### Advanced Tables
- 30% improvement in large party accommodation
- <1 min time to combine/split tables
- Zero double-bookings of combined tables

---

## 🔧 Technical Considerations

### Performance
- **Database Indexing**: Add indexes on frequently queried fields (phone, email, customer ID)
- **Caching**: Redis for analytics aggregations (optional)
- **Lazy Loading**: Load analytics data progressively

### Security
- **PII Protection**: Encrypt customer phone/email
- **RBAC**: Role-based access (manager vs host vs server)
- **Audit Logging**: Track who viewed customer profiles

### Scalability
- **Pagination**: All list endpoints (waitlist, customers, history)
- **Rate Limiting**: Protect notification APIs
- **Background Jobs**: Use Vercel Cron for nightly aggregations

### Third-Party Services

**Notifications** (Waitlist):
- **Twilio** (SMS): $0.0079/SMS, reliable, easy integration
- **SendGrid** (Email): Free tier 100/day, good for backup
- **Alternative**: Vonage, AWS SNS

**Analytics** (Optional):
- **Mixpanel/Amplitude**: User behavior tracking
- **Google Analytics**: Website traffic
- Not critical for Phase 3, but good for future

**Charting**:
- **Recharts**: Free, React-native, TypeScript support ✅
- **Chart.js**: Free, battle-tested
- **Victory**: Free, highly customizable

---

## 🎯 Quick Wins (Can Do First)

### 1. Basic Waitlist (1 week)
- Just add/remove from waitlist
- No notifications yet
- Simple FIFO queue
- **Value**: Immediate operational improvement

### 2. Customer Phone Lookup (3 days)
- Add phone search to check-in modal
- Show if customer has visited before
- Display last visit date
- **Value**: Personalization with minimal effort

### 3. Occupancy Chart (1 week)
- Simple line chart of occupancy % by hour
- Use existing Service Records data
- Single-day view
- **Value**: Insights with zero new data

---

## 📋 Dependencies & Prerequisites

### Environment Variables (New)
```env
# Notifications
TWILIO_ACCOUNT_SID=your-twilio-sid
TWILIO_AUTH_TOKEN=your-twilio-token
TWILIO_PHONE_NUMBER=+1234567890
SENDGRID_API_KEY=your-sendgrid-key
SENDGRID_FROM_EMAIL=noreply@yourrestaurant.com

# Analytics (Optional)
MIXPANEL_TOKEN=your-mixpanel-token
```

### Airtable Tables (New)
- Waitlist (`tblWaitlist`)
- Customers (`tblCustomers`)
- Visit History (`tblVisitHistory`)
- Table Combinations (`tblTableCombinations`)

### NPM Packages (New)
```bash
# Notifications
npm install twilio @sendgrid/mail

# Analytics & Charts
npm install recharts date-fns

# Export
npm install jspdf csv-export

# Optional
npm install redis mixpanel-browser
```

---

## 🚨 Risks & Mitigation

### Risk 1: Notification Costs
- **Issue**: High SMS volume could be expensive
- **Mitigation**: Start with email-only, add SMS as premium feature
- **Fallback**: Manual notification via host dashboard

### Risk 2: Data Privacy Compliance
- **Issue**: Storing customer data requires GDPR/CCPA compliance
- **Mitigation**: Add privacy policy, consent checkboxes, data deletion endpoints
- **Timeline**: Implement before customer profiles go live

### Risk 3: Analytics Performance
- **Issue**: Large date ranges could slow queries
- **Mitigation**: Pre-aggregate daily summaries, limit max date range to 90 days
- **Optimization**: Add database indexes, use Airtable formula fields

### Risk 4: Complexity Creep
- **Issue**: Phase 3 is ambitious, could delay timeline
- **Mitigation**: Focus on Quick Wins first, defer advanced features
- **Prioritization**: Waitlist > Customer Lookup > Analytics > Advanced Tables

---

## 📅 Revised Timeline (Agile Approach)

### Sprint 1 (2 weeks): Waitlist MVP
- Add/remove waitlist entries
- Basic UI in dashboard
- Manual notifications (no SMS yet)

### Sprint 2 (2 weeks): Waitlist Complete
- Automated SMS notifications
- Estimated wait time
- Auto-matching

### Sprint 3 (2 weeks): Customer Lookup
- Phone search in check-in modal
- Display visit history
- Preferences tracking

### Sprint 4 (2 weeks): Analytics MVP
- Occupancy chart
- Peak hours report
- Basic export

### Sprint 5+ (Ongoing): Refinement
- Customer profiles advanced features
- Advanced table management
- Additional analytics

---

## ✅ Definition of Done (Phase 3)

Phase 3 is considered complete when:

1. **Waitlist**:
   - ✅ Customers can be added to waitlist when no tables available
   - ✅ Host can notify customers via SMS/email
   - ✅ Wait time estimates are accurate (±10 min)
   - ✅ 90%+ customer satisfaction with notifications

2. **Customer Profiles**:
   - ✅ Phone lookup works in check-in modal
   - ✅ Visit history displays for repeat customers
   - ✅ Preferences can be saved and displayed
   - ✅ 50%+ reservations have customer data

3. **Analytics**:
   - ✅ Occupancy chart shows historical data
   - ✅ Peak hours identified automatically
   - ✅ Reports can be exported as PDF/CSV
   - ✅ Dashboard loads in <2 seconds

4. **Advanced Tables** (Optional):
   - ✅ Tables can be combined for large parties
   - ✅ Sections can be opened/closed
   - ✅ Floor plan is interactive

---

## 🎓 Learning Resources

- **Twilio SMS**: https://www.twilio.com/docs/sms
- **SendGrid Email**: https://docs.sendgrid.com
- **Recharts**: https://recharts.org/en-US
- **GDPR Compliance**: https://gdpr.eu
- **Airtable Advanced**: https://support.airtable.com/docs

---

**Next Steps**:
1. Review roadmap with stakeholders
2. Prioritize features based on business value
3. Set up Twilio/SendGrid accounts
4. Begin Sprint 1: Waitlist MVP

**Contact**: For questions or updates, see project GitHub issues or CLAUDE.md
