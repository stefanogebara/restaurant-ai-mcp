# Onboarding Database Schema

## Airtable Tables Required

### 1. **Restaurants** (New Table - Customer Accounts)

This table stores each restaurant customer's configuration. One record per restaurant.

| Field Name | Field Type | Description | Example |
|------------|------------|-------------|---------|
| `Restaurant ID` | Formula | Auto-generated ID | `REST-20251030-1234` |
| `Customer Email` | Email | Owner's email (links to subscription) | `owner@restaurant.com` |
| `Restaurant Name` | Single line text | Business name | `La Bella Vista` |
| `Restaurant Type` | Single select | Type of establishment | `Fine Dining`, `Casual`, `Fast Casual`, `Cafe`, `Bar`, `Other` |
| `City` | Single line text | Location | `Madrid` |
| `Country` | Single line text | Country | `Spain` |
| `Phone Number` | Phone | Business phone | `+34 639 67 29 63` |
| `Email` | Email | Business email | `contact@labellavista.com` |
| `Website` | URL | Website (optional) | `https://labellavista.com` |
| `Average Dining Duration` | Number | Minutes per table turn | `90` |
| `Advance Booking Days` | Number | How far ahead bookings allowed | `30` |
| `Buffer Time` | Number | Minutes between reservations | `15` |
| `Cancellation Policy` | Long text | Policy description | `Free cancellation up to 2 hours before reservation` |
| `Special Notes` | Long text | Additional info | `Vegan options available, outdoor seating seasonal` |
| `Onboarding Completed` | Checkbox | Has finished setup | ✓ or ✗ |
| `Onboarding Step` | Number | Current step if incomplete | `3` |
| `Created At` | Date | When account created | `2025-10-30` |
| `Plan Name` | Single select | Current subscription plan | `basic`, `professional`, `enterprise` |
| `Status` | Single select | Account status | `active`, `trial`, `suspended`, `cancelled` |

**Purpose**: Central record for each restaurant customer account.

---

### 2. **Restaurant Areas** (New Table - Dining Zones)

Stores the different dining areas for each restaurant (Indoor, Patio, Bar, etc.)

| Field Name | Field Type | Description | Example |
|------------|------------|-------------|---------|
| `Area ID` | Formula | Auto-generated ID | `AREA-20251030-5678` |
| `Restaurant ID` | Link to Restaurants | Which restaurant | Link to `REST-20251030-1234` |
| `Area Name` | Single line text | Name of area | `Indoor`, `Patio`, `Bar`, `Private Room` |
| `Is Active` | Checkbox | Currently in use | ✓ |
| `Display Order` | Number | Sort order in UI | `1`, `2`, `3` |
| `Created At` | Date | When created | `2025-10-30` |

**Purpose**: Allows restaurants to organize tables by physical location.

---

### 3. **Update Existing: Tables**

Add these fields to your existing `Tables` table (`tbl0r7fkhuoasis56`):

| New Field Name | Field Type | Description | Example |
|----------------|------------|-------------|---------|
| `Restaurant ID` | Link to Restaurants | Which restaurant owns this table | Link to restaurant |
| `Area ID` | Link to Restaurant Areas | Which area (Indoor, Patio, etc.) | Link to area |

**Purpose**: Links tables to specific restaurants and areas.

---

### 4. **Restaurant Business Hours** (New Table)

Stores operating hours for each day of the week.

| Field Name | Field Type | Description | Example |
|------------|------------|-------------|---------|
| `Hours ID` | Formula | Auto-generated | `HOURS-001` |
| `Restaurant ID` | Link to Restaurants | Which restaurant | Link |
| `Day of Week` | Single select | Day | `Monday`, `Tuesday`, etc. |
| `Is Open` | Checkbox | Open this day? | ✓ |
| `Open Time` | Single line text | Opening time | `09:00` |
| `Close Time` | Single line text | Closing time | `22:00` |

**Purpose**: Flexible business hours configuration per restaurant.

---

### 5. **Team Members** (New Table - Staff Access)

Manages team member access for multi-user restaurants.

| Field Name | Field Type | Description | Example |
|------------|------------|-------------|---------|
| `Member ID` | Formula | Auto-generated | `MEMBER-001` |
| `Restaurant ID` | Link to Restaurants | Which restaurant | Link |
| `Email` | Email | Team member email | `manager@restaurant.com` |
| `Role` | Single select | Access level | `Owner`, `Manager`, `Host` |
| `Status` | Single select | Account status | `active`, `pending`, `disabled` |
| `Invited At` | Date | When invited | `2025-10-30` |
| `Joined At` | Date | When accepted invite | `2025-10-31` |

**Purpose**: Role-based access control for team collaboration (Pro+ feature).

---

## Setup Instructions

### For Existing Demo Restaurant (La Bella Vista)

1. **Create "Restaurants" table**
2. **Import existing Restaurant Info** (`tblI0DfPZrZbLC8fz`) into new Restaurants table
3. **Link existing Tables** to the demo restaurant record
4. **Create demo areas**: Indoor, Patio, Bar
5. **Link tables to areas**

### For New Customer Onboarding

1. After Stripe checkout completes
2. Create new record in Restaurants table
3. User goes through 5-step onboarding wizard
4. API creates:
   - Restaurant record
   - Business hours (7 records, one per day)
   - Areas (based on user input)
   - Tables (based on configuration)
5. Mark `Onboarding Completed = true`

---

## API Endpoints Needed

```
POST /api/onboarding/start
  - Creates initial restaurant record
  - Returns restaurant_id for subsequent steps

POST /api/onboarding/restaurant-info
  - Saves name, type, location, contact

POST /api/onboarding/business-hours
  - Saves operating hours

POST /api/onboarding/tables
  - Creates areas and tables
  - Checks plan limits (Basic: max 10 tables)

POST /api/onboarding/team
  - Invites team members (Pro+ only)

POST /api/onboarding/complete
  - Marks onboarding as complete
  - Redirects to dashboard
```

---

## Feature Limits Enforcement

### Basic Plan (€49.99/month)
- Max 10 tables ✓ Check in `/api/onboarding/tables`
- Max 1 team member ✓ Check in `/api/onboarding/team`

### Professional Plan (€99.99/month)
- Unlimited tables ✓
- Max 5 team members ✓ Check in `/api/onboarding/team`

### Enterprise Plan (€199.99/month)
- Unlimited everything ✓

---

## Migration Plan

1. ✅ Create new tables in Airtable (manual setup)
2. ✅ Add environment variables for new table IDs
3. ✅ Build API endpoints
4. ✅ Build React onboarding wizard
5. ✅ Link onboarding to subscription checkout
6. ✅ Migrate existing demo restaurant data
