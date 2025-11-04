# Segovia ML & Tourism Analytics Enhancements

## Summary

This update implements three major improvements to the Restaurant AI MCP platform:

1. **ML Training Data Collection via Supabase** (Production-Ready)
2. **Segovia-Specific Risk Factors** in ML Risk Scoring
3. **Segovia Tourism Insights Dashboard**

---

## 1. ML Training Data Collection - Moved to Supabase

### Problem
- Old system used CSV files which don't work in Vercel production (read-only filesystem)
- No training data was being collected in production
- Could not track ML model performance over time

### Solution
Created `ml_training_data` table in Supabase with **Segovia-specific fields**:

#### Database Schema
```sql
CREATE TABLE ml_training_data (
  -- Standard Fields
  reservation_id, party_size, booking_lead_time_hours, etc.

  -- Segovia-Specific Fields (NEW!)
  customer_type TEXT,              -- 'Tourist' or 'Local'
  language_preference TEXT,        -- Spanish, English, Chinese, French
  seating_preference TEXT,         -- Terrace, Window, Indoor, Bar
  special_occasion TEXT,           -- Birthday, Anniversary, Tourism
  dietary_restrictions TEXT[],     -- Vegetarian, Vegan, Gluten-free
  first_time_visitor BOOLEAN,

  -- Outcomes
  actual_outcome TEXT              -- 'showed_up', 'no_show', 'cancelled'
);
```

#### Files Created/Modified
- ✅ `database/supabase/migrations/20251104_ml_training_data.sql` - Migration script
- ✅ `api/ml/data-logger-supabase.js` - New Supabase-based logger (replaces CSV)
- ✅ `scripts/apply-ml-training-migration.js` - Migration helper script

#### Benefits
- ✅ Works in production (Vercel)
- ✅ Real-time querying for stats
- ✅ Automatic backups
- ✅ Can export data for model retraining
- ✅ Segovia tourism patterns tracked

---

## 2. Segovia-Specific ML Risk Factors

### Problem
- ML model only considered generic factors (party size, lead time, etc.)
- Didn't account for Segovia's unique tourism dynamics
- Tourists have different no-show patterns than locals

### Solution
Added **6 new Segovia-specific risk factors** to `mlRiskScoring.js`:

#### New Risk Factors

**Factor 6: Customer Type (+15/-5 points)**
- Tourists: +15 points (travel uncertainty)
- Locals: -5 points (more reliable)

**Factor 7: Language Barrier (+10 points)**
- Non-Spanish speakers: +10 points (communication risk)

**Factor 8: Special Occasion (-10 points)**
- Birthday/Anniversary: -10 points (high commitment, REDUCES risk)

**Factor 9: Terrace Weather Risk (+12 points)**
- Last-minute terrace requests: +12 points (weather-dependent)

**Factor 10: Dietary Restrictions (-5 points)**
- Has dietary needs: -5 points (intentional planning, REDUCES risk)

**Factor 11: First-Time Visitor (+8 points)**
- Never visited before: +8 points

#### Model Version
- Updated from `v1.0-heuristic` → `v1.1-heuristic-segovia`

#### Example Risk Calculation
```
Tourist from China, non-Spanish speaker, party of 4, last-minute terrace booking:
  Base: 30 (new customer)
  + 15 (tourist)
  + 10 (language barrier)
  + 12 (terrace weather risk)
  = 67/100 (HIGH RISK) → Requires confirmation call
```

---

## 3. Segovia Tourism Insights Dashboard

### Problem
- No visibility into tourist vs local patterns
- Couldn't track language distribution or dietary needs
- Missing insights specific to Segovia's tourism-heavy business

### Solution
Created dedicated **Segovia Insights** analytics page showing:

#### Tourist vs Local Analytics
- Count and no-show rate for each type
- Visual comparison (Tourists: ✈️ vs Locals: 🏘️)
- Insights: "Tourists may need extra confirmation"

#### Language Distribution
- Spanish 🇪🇸, English 🇬🇧, Chinese 🇨🇳, French 🇫🇷
- Visual progress bars showing popularity
- Helps with staff language planning

#### Seating Preferences
- Terrace ☀️ (most popular in Segovia!)
- Window 🪟, Indoor 🏠, Bar 🍷
- Weather-based cancellation insights

#### Dietary Restrictions
- Tracks vegetarian, vegan, gluten-free requests
- Important for cochinillo (roast suckling pig) alternatives
- Helps with menu planning

#### Special Occasions
- Birthday, Anniversary, Business, Tourism
- Lower no-show rates - flagged as VIP

#### Files Created
- ✅ `client/src/pages/SegoviaInsightsPage.tsx` - New analytics dashboard (400+ lines)
- ✅ Updated `Sidebar.tsx` - Added "Segovia Insights" navigation
- ✅ Updated `App.tsx` - Added route `/host-dashboard/segovia`
- ✅ Updated `api/ml-training-status.js` - Added `/api/ml-training-status?action=segovia-insights` endpoint

#### API Endpoint
```bash
GET /api/ml-training-status?action=segovia-insights

Response:
{
  "success": true,
  "data": {
    "touristVsLocal": {
      "tourist": { "count": 45, "noShowRate": "15.2" },
      "local": { "count": 32, "noShowRate": "8.1" }
    },
    "languageDistribution": { "Spanish": 42, "English": 25, "Chinese": 10 },
    "seatingPreferences": { "Terrace": 48, "Window": 20, "Indoor": 9 },
    "dietaryRestrictions": { "vegetarian": 12, "vegan": 5 },
    "specialOccasions": { "Tourism": 35, "Birthday": 8 }
  }
}
```

---

## How to Deploy

### Step 1: Apply Supabase Migration
```bash
# Option A: Run migration script
cd C:\Users\stefa\restaurant-ai-mcp
node scripts/apply-ml-training-migration.js

# Option B: Manual SQL (if script fails)
# Copy SQL from database/supabase/migrations/20251104_ml_training_data.sql
# Run in Supabase SQL Editor: https://app.supabase.com/project/lurebwaudisfilhuhmnj/sql
```

### Step 2: Commit and Push Changes
```bash
git add .
git commit -m "Add Segovia ML enhancements: Supabase training data, tourism risk factors, insights dashboard"
git push origin main
```

### Step 3: Verify Deployment
- Vercel will auto-deploy
- Visit: https://restaurant-ai-mcp.vercel.app/host-dashboard/segovia
- Check navigation sidebar for "Segovia Insights" (🌍 icon)

---

## Testing Checklist

- [ ] Supabase migration applied successfully
- [ ] ml_training_data table exists in Supabase
- [ ] ML risk scoring includes Segovia factors
- [ ] Segovia Insights page loads without errors
- [ ] Navigation shows "Segovia Insights" link
- [ ] API endpoint returns Segovia data
- [ ] Tourist vs Local stats display correctly
- [ ] Language distribution chart works
- [ ] Seating preferences show
- [ ] Dietary restrictions tracked

---

## Future Enhancements

### Phase 2: Actual ML Model Training
Once 100+ training samples collected:
- Export ml_training_data to CSV
- Train RandomForest/XGBoost model
- Replace heuristic with trained model
- A/B test: heuristic vs trained model

### Phase 3: Predictive Tourism Analytics
- Seasonal tourist pattern prediction
- Language-specific no-show rate models
- Weather-based terrace cancellation prediction
- Peak tourist season forecasting

### Phase 4: Automated Interventions
- Auto-send confirmation SMS in customer's language
- Auto-offer indoor alternative for terrace requests (bad weather forecast)
- Auto-flag vegetarian menu options for non-cochinillo customers

---

## Key Metrics to Track

**ML Model Performance:**
- ROI: Target 300-500% (€3-€5 saved per €1 spent)
- Success Rate: Target >60%
- Training Samples: Need 100+ for retraining

**Segovia Insights:**
- Tourist vs Local ratio
- Tourist no-show rate vs Local no-show rate
- Most requested languages
- Terrace preference percentage
- Vegetarian alternative requests

---

## Support

For questions or issues:
- Check Supabase logs: https://app.supabase.com/project/lurebwaudisfilhuhmnj/logs
- Check Vercel deployment logs
- Review ml_training_data table contents

**Migration SQL Manual Application:**
If auto-migration fails, run the SQL from `database/supabase/migrations/20251104_ml_training_data.sql` manually in Supabase SQL Editor.
