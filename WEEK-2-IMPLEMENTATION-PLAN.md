# Week 2 Implementation Plan - Feature Engineering Pipeline

**Start Date**: 2025-10-26 (Today)
**Duration**: 7 days (Days 8-14 of ML Implementation)
**Goal**: Complete feature engineering pipeline and prepare training dataset
**Current Status**: Week 2 is 30% complete (features.js started, synthetic data created)

---

## 🎯 Week 2 Overview

**What We're Building**: A robust feature extraction system that transforms raw reservation data into 23 engineered features for ML model training.

**Why This Matters**: Feature engineering is the most critical step in ML. Research shows that well-engineered features can improve model accuracy from 70% to 95%+ with the same algorithm.

**Week 2 Deliverables**:
- ✅ Production-ready feature engineering service (23 features)
- ✅ Comprehensive feature tests and validation
- ✅ Real historical dataset exported from Airtable (1000+ reservations)
- ✅ Training/test split (80/20) ready for Week 3 model training
- ✅ Features integrated into reservation creation flow

---

## 📊 Current Status Assessment

### ✅ What's Already Done (30%)

**Week 1 - COMPLETE (100%)**:
- ✅ Customer History table created (tblqK1ajV5sqICWn2)
- ✅ Customer history service (`api/_lib/customer-history.js`) - 400+ lines
- ✅ 21 ML fields added to Reservations table
- ✅ Environment variable configured locally

**Week 2 - STARTED (30%)**:
- ✅ Feature engineering service started (`api/ml/features.js`) - 14KB
- ✅ Feature configuration defined (`api/ml/feature-config.js`) - 9KB
- ✅ Synthetic training data generated (`ml-training/synthetic_training_data.csv`)

### ❌ What's Remaining (70%)

**Critical Path Items**:
1. ❌ Complete feature engineering implementation (add remaining features)
2. ❌ Write comprehensive unit tests for all 23 features
3. ❌ Validate feature ranges and edge cases
4. ❌ Export REAL historical data from Airtable (not synthetic)
5. ❌ Apply feature engineering to historical dataset
6. ❌ Create proper train/test split with data quality checks
7. ❌ Integrate features into reservation creation flow
8. ❌ Add Vercel environment variable for production

---

## 📅 Day-by-Day Implementation Plan

### **Day 8 (Today - Oct 26): Complete Feature Engineering Service**

**Goal**: Finish implementing all 23 feature extraction functions

**Tasks**:
1. **Review existing features.js** (30 min)
   - Audit what's already implemented
   - Identify missing features
   - Check for bugs or incomplete functions

2. **Complete missing features** (2 hours)
   - Ensure all 23 features from feature-config.js are implemented
   - Add error handling for edge cases
   - Add JSDoc comments for each function

3. **Add main extraction function** (1 hour)
   ```javascript
   /**
    * Extract all 23 features for a reservation
    * @param {Object} reservation - Reservation data
    * @param {Object} customerHistory - Customer history data
    * @returns {Object} Feature vector with 23 features
    */
   async function extractAllFeatures(reservation, customerHistory) {
     return {
       // Temporal features (7)
       booking_lead_time_hours: calculateBookingLeadTimeHours(reservation),
       hour_of_day: calculateHourOfDay(reservation),
       day_of_week: calculateDayOfWeek(reservation),
       is_weekend: calculateIsWeekend(reservation),
       is_prime_time: calculateIsPrimeTime(reservation),
       month_of_year: calculateMonthOfYear(reservation),
       days_until_reservation: calculateDaysUntilReservation(reservation),

       // Customer features (6)
       is_repeat_customer: calculateIsRepeatCustomer(customerHistory),
       customer_visit_count: customerHistory?.total_reservations || 0,
       customer_no_show_rate: customerHistory?.no_show_rate || 0,
       customer_avg_party_size: customerHistory?.avg_party_size || 0,
       days_since_last_visit: calculateDaysSinceLastVisit(customerHistory),
       customer_lifetime_value: customerHistory?.total_spend || 0,

       // Reservation features (5)
       party_size: reservation.party_size,
       party_size_category: calculatePartySizeCategory(reservation),
       is_large_party: reservation.party_size >= 6 ? 1 : 0,
       is_special_occasion: reservation.is_special_occasion ? 1 : 0,
       has_special_requests: reservation.special_requests ? 1 : 0,

       // Engagement features (3)
       confirmation_sent: reservation.confirmation_sent_at ? 1 : 0,
       confirmation_clicked: reservation.confirmation_clicked ? 1 : 0,
       hours_since_confirmation: calculateHoursSinceConfirmation(reservation),

       // Historical patterns (2)
       historical_no_show_rate_day: 0.15, // TODO: Calculate from DB
       historical_no_show_rate_time: 0.12 // TODO: Calculate from DB
     };
   }
   ```

4. **Test feature extraction locally** (30 min)
   - Create test script to run feature extraction on sample data
   - Verify all features return expected types and ranges

**Deliverable**: Complete `api/ml/features.js` with all 23 features ✅

**Estimated Time**: 4 hours

---

### **Day 9 (Oct 27): Feature Testing & Validation**

**Goal**: Ensure features are robust and handle all edge cases

**Tasks**:
1. **Create feature test suite** (2 hours)
   - Create `api/ml/__tests__/features.test.js`
   - Write unit tests for each of the 23 features
   - Test normal cases, edge cases, and error conditions

   Example tests:
   ```javascript
   describe('Temporal Features', () => {
     test('booking_lead_time_hours handles same-day bookings', () => {
       const reservation = {
         booking_created_at: '2025-10-27T09:00:00',
         date: '2025-10-27',
         time: '19:00'
       };
       const leadTime = calculateBookingLeadTimeHours(reservation);
       expect(leadTime).toBe(10); // 10 hours lead time
     });

     test('booking_lead_time_hours handles week-ahead bookings', () => {
       const reservation = {
         booking_created_at: '2025-10-20T09:00:00',
         date: '2025-10-27',
         time: '19:00'
       };
       const leadTime = calculateBookingLeadTimeHours(reservation);
       expect(leadTime).toBe(178); // ~7 days
     });

     test('hour_of_day handles edge cases', () => {
       expect(calculateHourOfDay({ time: '00:00' })).toBe(0);
       expect(calculateHourOfDay({ time: '23:59' })).toBe(23);
       expect(calculateHourOfDay({ time: null })).toBe(19); // Default
     });
   });

   describe('Customer Features', () => {
     test('customer_no_show_rate handles new customers', () => {
       const customerHistory = null; // New customer
       expect(calculateCustomerNoShowRate(customerHistory)).toBe(0);
     });

     test('customer_no_show_rate calculates correctly', () => {
       const customerHistory = {
         total_reservations: 10,
         no_shows: 2
       };
       expect(calculateCustomerNoShowRate(customerHistory)).toBe(0.2);
     });
   });
   ```

2. **Validate feature ranges** (1 hour)
   - Ensure all numeric features are within expected bounds
   - Check boolean features return 0 or 1
   - Verify no null/undefined values

3. **Create feature validation utility** (1 hour)
   ```javascript
   function validateFeatureVector(features) {
     const errors = [];

     // Check all 23 features present
     const requiredFeatures = ALL_FEATURES.map(f => f.name);
     for (const feature of requiredFeatures) {
       if (!(feature in features)) {
         errors.push(`Missing feature: ${feature}`);
       }
     }

     // Validate ranges
     if (features.booking_lead_time_hours < 0) {
       errors.push('booking_lead_time_hours cannot be negative');
     }
     if (features.hour_of_day < 0 || features.hour_of_day > 23) {
       errors.push('hour_of_day must be 0-23');
     }
     if (features.customer_no_show_rate < 0 || features.customer_no_show_rate > 1) {
       errors.push('customer_no_show_rate must be 0-1');
     }

     return {
       valid: errors.length === 0,
       errors
     };
   }
   ```

4. **Document all features** (30 min)
   - Create `FEATURE_DOCUMENTATION.md`
   - List all 23 features with descriptions, types, ranges
   - Provide examples of each feature

**Deliverable**: Comprehensive test suite with 50+ test cases ✅

**Estimated Time**: 4.5 hours

---

### **Day 10 (Oct 28): Historical Data Export**

**Goal**: Export real reservation data from Airtable for training

**Tasks**:
1. **Create data export script** (2 hours)
   - Create `scripts/export-training-data.js`
   - Fetch all reservations from past 6-12 months
   - Include customer history for each reservation
   - Filter to only completed/no-show reservations (with known outcomes)

   ```javascript
   const axios = require('axios');
   const fs = require('fs');

   async function exportHistoricalData() {
     console.log('📊 Exporting historical reservations for ML training...');

     // 1. Fetch all reservations
     const reservations = await fetchAllReservations();
     console.log(`✅ Fetched ${reservations.length} reservations`);

     // 2. Filter to completed/no-show only (known outcomes)
     const labeled = reservations.filter(r =>
       r.status === 'completed' || r.status === 'no-show'
     );
     console.log(`✅ ${labeled.length} reservations with known outcomes`);

     // 3. Fetch customer history for each
     const enriched = await enrichWithCustomerHistory(labeled);

     // 4. Extract features for each
     const features = await extractFeaturesForAll(enriched);

     // 5. Save to CSV
     await saveToCSV(features, 'ml-training/historical_training_data.csv');

     console.log('✅ Export complete!');
     return features;
   }
   ```

2. **Validate exported data** (1 hour)
   - Check data quality (no nulls in critical fields)
   - Verify class balance (% no-shows vs. completed)
   - Ensure sufficient data volume (target: 1000+ records)

3. **Create data quality report** (30 min)
   ```javascript
   function generateDataQualityReport(data) {
     const report = {
       total_records: data.length,
       date_range: {
         earliest: Math.min(...data.map(r => new Date(r.date))),
         latest: Math.max(...data.map(r => new Date(r.date)))
       },
       class_distribution: {
         no_shows: data.filter(r => r.no_show === 1).length,
         showed_up: data.filter(r => r.no_show === 0).length,
         no_show_rate: data.filter(r => r.no_show === 1).length / data.length
       },
       missing_values: calculateMissingValues(data),
       feature_statistics: calculateFeatureStats(data)
     };

     return report;
   }
   ```

**Deliverable**: `historical_training_data.csv` with 1000+ labeled reservations ✅

**Estimated Time**: 3.5 hours

---

### **Day 11-12 (Oct 29-30): Feature Engineering on Historical Data**

**Goal**: Apply feature extraction to historical dataset and create train/test split

**Tasks**:

**Day 11 Tasks** (4 hours):
1. **Apply feature engineering to historical data** (2 hours)
   - Run feature extraction on all historical reservations
   - Handle missing customer history gracefully
   - Validate all feature vectors

2. **Create feature engineering pipeline** (1.5 hours)
   ```javascript
   async function applyFeatureEngineering(reservations) {
     const results = [];

     for (const reservation of reservations) {
       try {
         // 1. Fetch customer history
         const customerHistory = await getCustomerHistoryAtTime(
           reservation.customer_email,
           reservation.date // Get history BEFORE this reservation
         );

         // 2. Extract features
         const features = await extractAllFeatures(reservation, customerHistory);

         // 3. Add label (target variable)
         features.no_show = reservation.status === 'no-show' ? 1 : 0;
         features.reservation_id = reservation.reservation_id;

         // 4. Validate
         const validation = validateFeatureVector(features);
         if (validation.valid) {
           results.push(features);
         } else {
           console.warn(`⚠️ Invalid features for ${reservation.reservation_id}:`, validation.errors);
         }
       } catch (error) {
         console.error(`❌ Error processing ${reservation.reservation_id}:`, error);
       }
     }

     return results;
   }
   ```

3. **Save engineered dataset** (30 min)
   - Save to `ml-training/training_data_with_features.csv`
   - Include all 23 features + label + reservation_id

**Day 12 Tasks** (4 hours):
4. **Create train/test split** (1.5 hours)
   ```javascript
   function createTrainTestSplit(data, testRatio = 0.2) {
     // Shuffle data randomly
     const shuffled = data.sort(() => Math.random() - 0.5);

     // Calculate split point
     const testSize = Math.floor(data.length * testRatio);
     const trainSize = data.length - testSize;

     // Split
     const testSet = shuffled.slice(0, testSize);
     const trainSet = shuffled.slice(testSize);

     // Verify class balance in both sets
     const trainNoShowRate = trainSet.filter(r => r.no_show === 1).length / trainSet.length;
     const testNoShowRate = testSet.filter(r => r.no_show === 1).length / testSet.length;

     console.log(`✅ Train set: ${trainSize} records (${(trainNoShowRate * 100).toFixed(1)}% no-shows)`);
     console.log(`✅ Test set: ${testSize} records (${(testNoShowRate * 100).toFixed(1)}% no-shows)`);

     return { trainSet, testSet };
   }
   ```

5. **Save train and test sets** (30 min)
   - `ml-training/train.csv` (80% of data)
   - `ml-training/test.csv` (20% of data)
   - Ensure both sets maintain class balance

6. **Create dataset README** (1 hour)
   - Document dataset structure
   - List all features with descriptions
   - Provide statistics (record counts, no-show rates, date ranges)
   - Include usage examples

7. **Validate datasets** (1 hour)
   - Check for data leakage between train/test
   - Verify no duplicate reservation IDs
   - Confirm all features are present
   - Check for outliers and anomalies

**Deliverable**:
- ✅ `training_data_with_features.csv` (full dataset with features)
- ✅ `train.csv` (80% split)
- ✅ `test.csv` (20% split)
- ✅ Dataset documentation

**Estimated Time**: 8 hours total (4 hours per day)

---

### **Day 13 (Oct 31): Integration with Reservation Flow**

**Goal**: Auto-calculate features when new reservations are created

**Tasks**:
1. **Update reservation creation endpoint** (2 hours)
   - Modify `api/routes/reservations.js`
   - Add feature extraction after reservation creation
   - Store features in ML fields

   ```javascript
   // In POST /api/reservations endpoint
   const { extractAllFeatures } = require('../ml/features');
   const { findOrCreateCustomer } = require('../_lib/customer-history');

   async function handleCreateReservation(req, res) {
     const reservationData = req.body;

     // 1. Create reservation
     const reservation = await createReservation(reservationData);

     // 2. Get customer history
     const customerHistory = await findOrCreateCustomer(
       reservationData.customer_email,
       reservationData.customer_phone,
       reservationData.customer_name
     );

     // 3. Extract features
     const features = await extractAllFeatures(reservation, customerHistory);

     // 4. Update reservation with features
     await updateReservationFeatures(reservation.id, features);

     return res.json({ success: true, reservation, features });
   }
   ```

2. **Create feature storage function** (1 hour)
   ```javascript
   async function updateReservationFeatures(reservationId, features) {
     const fieldsToUpdate = {
       'Booking Lead Time Hours': features.booking_lead_time_hours,
       'Is Repeat Customer': features.is_repeat_customer,
       'Previous Visit Count': features.customer_visit_count,
       'Customer No Show Rate': features.customer_no_show_rate,
       'Is Special Occasion': features.is_special_occasion,
       // ... map all features to Airtable fields
     };

     await updateAirtableRecord('Reservations', reservationId, fieldsToUpdate);
   }
   ```

3. **Test integration locally** (1 hour)
   - Create test reservation
   - Verify features are calculated
   - Check Airtable fields are populated

4. **Add logging and monitoring** (30 min)
   - Log feature extraction time
   - Track errors and failures
   - Monitor feature calculation performance

**Deliverable**: Features auto-calculated on every new reservation ✅

**Estimated Time**: 4.5 hours

---

### **Day 14 (Nov 1): Production Deployment & Verification**

**Goal**: Deploy to production and verify everything works end-to-end

**Tasks**:
1. **Add environment variable to Vercel** (15 min)
   - Go to: https://vercel.com/stefanogebaras-projects/restaurant-ai-mcp/settings/environment-variables
   - Add `CUSTOMER_HISTORY_TABLE_ID=tblqK1ajV5sqICWn2`
   - Apply to: Production, Preview, Development

2. **Deploy to Vercel** (30 min)
   ```bash
   cd /c/Users/stefa/restaurant-ai-mcp
   git add .
   git commit -m "Week 2 complete: Feature engineering pipeline"
   git push origin main
   ```

3. **Verify deployment** (1 hour)
   - Check Vercel deployment logs
   - Test reservation creation in production
   - Verify features are calculated
   - Check Airtable fields are populated

4. **Create test dataset for Week 3** (1 hour)
   - Ensure train.csv and test.csv are ready
   - Verify data quality one final time
   - Create data dictionary for ML team

5. **Write Week 2 completion report** (1.5 hours)
   - Document what was accomplished
   - List all deliverables
   - Provide metrics (dataset size, feature count, etc.)
   - Identify any issues or blockers
   - Outline Week 3 readiness

**Deliverable**:
- ✅ Production deployment complete
- ✅ Week 2 completion report
- ✅ Ready for Week 3 (ML model training)

**Estimated Time**: 4 hours

---

## 📊 Success Metrics

### Technical Metrics
- ✅ All 23 features implemented and tested
- ✅ 50+ unit tests passing
- ✅ 1000+ historical reservations with features
- ✅ Train/test split created (80/20)
- ✅ Features integrated into reservation flow
- ✅ Zero errors in production deployment

### Data Quality Metrics
- ✅ No missing values in critical features
- ✅ Class balance maintained (15-25% no-show rate)
- ✅ Feature ranges validated (no outliers)
- ✅ No data leakage between train/test sets

### Business Metrics
- ✅ Feature extraction time < 200ms per reservation
- ✅ Zero impact on reservation creation UX
- ✅ 100% feature calculation success rate

---

## 🚨 Potential Blockers & Mitigation

### Blocker 1: Insufficient Historical Data
**Risk**: Airtable may have < 1000 historical reservations

**Mitigation**:
- Accept minimum of 500 reservations for Week 2
- Synthetic data can supplement if needed
- Week 3 model training can work with smaller dataset (lower accuracy)

### Blocker 2: Missing Customer History
**Risk**: Old reservations may not have customer history linked

**Mitigation**:
- Run backfill script to create customer history from old reservations
- Use default values for missing customer features
- Mark records with incomplete data for exclusion

### Blocker 3: Feature Calculation Errors
**Risk**: Edge cases may cause feature extraction to fail

**Mitigation**:
- Comprehensive error handling in feature functions
- Default values for all features
- Logging to identify problematic records

### Blocker 4: Vercel Deployment Issues
**Risk**: Environment variables may not propagate

**Mitigation**:
- Test locally before deploying
- Use Vercel CLI to verify environment variables
- Manual verification via Vercel dashboard

---

## 📁 Files Created This Week

| File | Purpose | Size | Status |
|------|---------|------|--------|
| `api/ml/features.js` | Feature engineering service | 15KB | ✅ Started |
| `api/ml/feature-config.js` | Feature definitions | 9KB | ✅ Complete |
| `api/ml/__tests__/features.test.js` | Feature unit tests | 10KB | ❌ To create |
| `scripts/export-training-data.js` | Data export script | 8KB | ❌ To create |
| `ml-training/historical_training_data.csv` | Raw historical data | Variable | ❌ To create |
| `ml-training/training_data_with_features.csv` | Engineered features | Variable | ❌ To create |
| `ml-training/train.csv` | Training set (80%) | Variable | ❌ To create |
| `ml-training/test.csv` | Test set (20%) | Variable | ❌ To create |
| `FEATURE_DOCUMENTATION.md` | Feature reference | 5KB | ❌ To create |
| `WEEK-2-PROGRESS.md` | Weekly progress report | 3KB | ❌ To create |

---

## 🎯 Week 2 Completion Checklist

### Feature Engineering (Days 8-9)
- [ ] Complete all 23 feature functions in `features.js`
- [ ] Add `extractAllFeatures()` main function
- [ ] Create comprehensive test suite (50+ tests)
- [ ] Validate feature ranges and types
- [ ] Document all features in `FEATURE_DOCUMENTATION.md`

### Data Export (Day 10)
- [ ] Create `export-training-data.js` script
- [ ] Export 1000+ historical reservations from Airtable
- [ ] Filter to completed/no-show only
- [ ] Generate data quality report

### Feature Engineering Pipeline (Days 11-12)
- [ ] Apply feature engineering to historical data
- [ ] Create `training_data_with_features.csv`
- [ ] Generate train/test split (80/20)
- [ ] Validate datasets (no leakage, balanced classes)
- [ ] Create dataset README

### Integration (Day 13)
- [ ] Update reservation creation endpoint
- [ ] Add automatic feature calculation
- [ ] Test locally with new reservations
- [ ] Add logging and error handling

### Production Deployment (Day 14)
- [ ] Add `CUSTOMER_HISTORY_TABLE_ID` to Vercel
- [ ] Deploy to production
- [ ] Verify end-to-end flow
- [ ] Write Week 2 completion report
- [ ] Prepare datasets for Week 3

---

## 🚀 Ready for Week 3

After completing Week 2, you will have:
- ✅ Production-ready feature engineering pipeline
- ✅ 1000+ historical reservations with 23 engineered features
- ✅ Clean train/test split for ML model training
- ✅ Features auto-calculated on every new reservation
- ✅ Comprehensive documentation and tests

**Week 3 Preview**: ML Model Training with XGBoost
- Train XGBoost classifier on your dataset
- Achieve 85-90% accuracy (target: 87%)
- Implement SHAP explainability
- Deploy model to Google Cloud Storage
- Create prediction API endpoint

---

**Document Version**: 1.0
**Created**: 2025-10-26
**Status**: 🚀 Ready to Execute
**Estimated Total Time**: 32 hours (4-5 hours per day)

🤖 Generated by Claude Code - Restaurant AI MCP Project
