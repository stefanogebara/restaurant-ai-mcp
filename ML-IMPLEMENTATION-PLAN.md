# Full ML Implementation Plan - Restaurant Predictive Analytics

**Start Date**: 2025-10-25
**Target Completion**: 4-6 weeks
**Goal**: 70% → 87% prediction accuracy with production ML system
**Expected ROI**: $16,896/year

---

## 🏗️ How The ML System Will Work

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      ML PREDICTION FLOW                          │
└─────────────────────────────────────────────────────────────────┘

1. NEW RESERVATION CREATED
   ↓
   User books → Airtable Reservations Table

2. FEATURE EXTRACTION
   ↓
   api/ml/feature-engineering.js
   - Calculates booking_lead_time_hours
   - Looks up customer history (repeat vs. new)
   - Extracts time features (hour, day of week, is_weekend)
   - Adds special occasion flags
   - Creates 20+ features total

3. ML PREDICTION
   ↓
   api/ml/predict.js
   - Loads trained XGBoost model from Google Cloud Storage
   - Runs prediction on feature vector
   - Returns probability score (0.00 to 1.00)

4. EXPLAINABILITY
   ↓
   api/ml/explain.js (SHAP values)
   - Calculates which features contributed most
   - Example: "Booking lead time (+25%), New customer (+18%)"

5. STORE PREDICTION
   ↓
   Updates Airtable with:
   - ML Risk Score: 0.43 (43% probability)
   - ML Risk Level: "medium"
   - ML Confidence: 0.91 (91% confident)
   - ML Top Factors: ["Same-day booking (+25%)", "New customer (+18%)"]

6. DISPLAY IN DASHBOARD
   ↓
   Analytics Dashboard shows predictions with explanations
   Host can take action (call customer, require deposit, etc.)

7. LEARNING LOOP (Daily)
   ↓
   Cron Job at 3 AM:
   - Collects yesterday's actual outcomes (showed up vs. no-show)
   - Compares predictions vs. reality
   - Adds to training dataset
   - Retrains model if accuracy improves
   - Deploys new model automatically
```

### Data Flow Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                    TRAINING PHASE (One-time)                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Export Historical Data (6-12 months)                         │
│     ┌────────────────────────────────────┐                      │
│     │ Airtable Reservations              │                      │
│     │ - 1000+ past reservations          │                      │
│     │ - Status: completed/no-show        │                      │
│     └────────────────┬───────────────────┘                      │
│                      ▼                                            │
│  2. Feature Engineering                                          │
│     ┌────────────────────────────────────┐                      │
│     │ Create 20+ features per reservation│                      │
│     │ - booking_lead_time_hours          │                      │
│     │ - is_repeat_customer               │                      │
│     │ - hour_of_day, day_of_week         │                      │
│     │ - party_size_category              │                      │
│     │ - is_special_occasion              │                      │
│     │ - customer_no_show_history         │                      │
│     │ + 15 more engineered features      │                      │
│     └────────────────┬───────────────────┘                      │
│                      ▼                                            │
│  3. Train/Test Split                                             │
│     ┌────────────────────────────────────┐                      │
│     │ 80% Training (800 reservations)    │                      │
│     │ 20% Testing  (200 reservations)    │                      │
│     └────────────────┬───────────────────┘                      │
│                      ▼                                            │
│  4. Model Training                                               │
│     ┌────────────────────────────────────┐                      │
│     │ XGBoost Classifier                 │                      │
│     │ - 100 decision trees               │                      │
│     │ - Learning rate: 0.1               │                      │
│     │ - Max depth: 6                     │                      │
│     │ - Train for 1000 iterations        │                      │
│     └────────────────┬───────────────────┘                      │
│                      ▼                                            │
│  5. Model Evaluation                                             │
│     ┌────────────────────────────────────┐                      │
│     │ Test on 20% holdout set            │                      │
│     │ - AUC-ROC: 0.87 (target: >0.80)    │                      │
│     │ - Accuracy: 87% (target: >85%)     │                      │
│     │ - Precision: 82% (avoid false alarms)│                    │
│     │ - Recall: 89% (catch no-shows)     │                      │
│     └────────────────┬───────────────────┘                      │
│                      ▼                                            │
│  6. Save Model                                                   │
│     ┌────────────────────────────────────┐                      │
│     │ Google Cloud Storage               │                      │
│     │ gs://restaurant-ml/models/         │                      │
│     │   noshow_predictor_v1.0.pkl        │                      │
│     └────────────────────────────────────┘                      │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│                 PREDICTION PHASE (Production)                     │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  New Reservation Created                                         │
│     ┌────────────────────────────────────┐                      │
│     │ POST /api/reservations             │                      │
│     │ {                                  │                      │
│     │   customer_name: "John Smith",     │                      │
│     │   party_size: 4,                   │                      │
│     │   date: "2025-10-30",              │                      │
│     │   time: "19:00"                    │                      │
│     │ }                                  │                      │
│     └────────────────┬───────────────────┘                      │
│                      ▼                                            │
│  Feature Engineering (real-time)                                 │
│     ┌────────────────────────────────────┐                      │
│     │ Calculate features:                │                      │
│     │ - booking_lead_time: 120 hours     │                      │
│     │ - is_repeat_customer: false        │                      │
│     │ - hour_of_day: 19                  │                      │
│     │ - is_weekend: false                │                      │
│     │ - is_prime_time: true              │                      │
│     │ ... (20+ total features)           │                      │
│     └────────────────┬───────────────────┘                      │
│                      ▼                                            │
│  Load Model & Predict                                            │
│     ┌────────────────────────────────────┐                      │
│     │ Load from GCS:                     │                      │
│     │   noshow_predictor_v1.0.pkl        │                      │
│     │                                    │                      │
│     │ Predict probability:               │                      │
│     │   no_show_probability = 0.23       │                      │
│     │   (23% chance of no-show)          │                      │
│     └────────────────┬───────────────────┘                      │
│                      ▼                                            │
│  Calculate SHAP Explanations                                     │
│     ┌────────────────────────────────────┐                      │
│     │ SHAP TreeExplainer                 │                      │
│     │                                    │                      │
│     │ Top contributing factors:          │                      │
│     │ 1. booking_lead_time: +8% risk     │                      │
│     │ 2. is_new_customer: +12% risk      │                      │
│     │ 3. is_prime_time: -5% risk         │                      │
│     └────────────────┬───────────────────┘                      │
│                      ▼                                            │
│  Save to Airtable                                                │
│     ┌────────────────────────────────────┐                      │
│     │ Update reservation record:         │                      │
│     │ - ML Risk Score: 23.0              │                      │
│     │ - ML Risk Level: "medium"          │                      │
│     │ - ML Confidence: 0.89              │                      │
│     │ - ML Top Factors: [                │                      │
│     │     "New customer (+12%)",         │                      │
│     │     "5-day lead time (+8%)",       │                      │
│     │     "Prime time (-5%)"             │                      │
│     │   ]                                │                      │
│     └────────────────┬───────────────────┘                      │
│                      ▼                                            │
│  Display in Dashboard                                            │
│     ┌────────────────────────────────────┐                      │
│     │ Host sees prediction card:         │                      │
│     │                                    │                      │
│     │ ⚠️ Medium Risk (23%)               │                      │
│     │                                    │                      │
│     │ Why this prediction?               │                      │
│     │ • New customer (+12%)              │                      │
│     │ • Booked 5 days ahead (+8%)        │                      │
│     │ • Prime time slot (-5%)            │                      │
│     │                                    │                      │
│     │ Recommended actions:               │                      │
│     │ ☐ Send SMS reminder 24h before    │                      │
│     │ ☐ Confirm via email 48h before    │                      │
│     └────────────────────────────────────┘                      │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│               CONTINUOUS LEARNING (Daily at 3 AM)                 │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Collect Yesterday's Outcomes                                 │
│     ┌────────────────────────────────────┐                      │
│     │ Query Airtable:                    │                      │
│     │ - Reservations from yesterday      │                      │
│     │ - Actual status: completed/no-show │                      │
│     │ - ML prediction: risk score        │                      │
│     └────────────────┬───────────────────┘                      │
│                      ▼                                            │
│  2. Compare Predictions vs. Reality                              │
│     ┌────────────────────────────────────┐                      │
│     │ Prediction Accuracy Check:         │                      │
│     │                                    │                      │
│     │ Reservation A:                     │                      │
│     │   Predicted: 0.15 (low risk)       │                      │
│     │   Actual: showed up ✅             │                      │
│     │                                    │                      │
│     │ Reservation B:                     │                      │
│     │   Predicted: 0.65 (high risk)      │                      │
│     │   Actual: no-show ✅               │                      │
│     │                                    │                      │
│     │ Reservation C:                     │                      │
│     │   Predicted: 0.20 (low risk)       │                      │
│     │   Actual: no-show ❌ (missed!)     │                      │
│     └────────────────┬───────────────────┘                      │
│                      ▼                                            │
│  3. Append to Training Dataset                                   │
│     ┌────────────────────────────────────┐                      │
│     │ Add yesterday's data to:           │                      │
│     │ gs://restaurant-ml/training/       │                      │
│     │   training_data_incremental.csv    │                      │
│     └────────────────┬───────────────────┘                      │
│                      ▼                                            │
│  4. Retrain Model                                                │
│     ┌────────────────────────────────────┐                      │
│     │ Train new XGBoost model            │                      │
│     │ - Include yesterday's data         │                      │
│     │ - Use same hyperparameters         │                      │
│     │ - Validate on holdout set          │                      │
│     └────────────────┬───────────────────┘                      │
│                      ▼                                            │
│  5. Evaluate New Model                                           │
│     ┌────────────────────────────────────┐                      │
│     │ Compare metrics:                   │                      │
│     │                                    │                      │
│     │ Current model: AUC 0.87            │                      │
│     │ New model: AUC 0.88 ✅             │                      │
│     │                                    │                      │
│     │ Decision: Deploy new model         │                      │
│     └────────────────┬───────────────────┘                      │
│                      ▼                                            │
│  6. Deploy if Better                                             │
│     ┌────────────────────────────────────┐                      │
│     │ Save to GCS:                       │                      │
│     │   noshow_predictor_v1.1.pkl        │                      │
│     │                                    │                      │
│     │ Update API to use v1.1             │                      │
│     │                                    │                      │
│     │ Log deployment:                    │                      │
│     │ "✅ v1.1 deployed - AUC improved   │                      │
│     │  from 0.87 to 0.88"                │                      │
│     └────────────────────────────────────┘                      │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 📅 Week-by-Week Implementation Plan

### **WEEK 1: Foundation - Customer History & Data Tracking**

**Goal**: Set up customer history tracking and add ML fields to database

#### Day 1-2: Database Schema Design
- [ ] Design Customer History table structure
- [ ] Define all new Reservations fields for ML
- [ ] Create migration plan for historical data
- [ ] Document field definitions and constraints

#### Day 3-4: Airtable Configuration
- [ ] Create Customer History table in Airtable
- [ ] Add 15+ new fields to Reservations table:
  ```
  - Booking Created At (datetime)
  - Booking Lead Time Hours (number)
  - Customer Email (email)
  - Customer Phone (phone)
  - Previous Visit Count (number)
  - Previous No Show Count (number)
  - Is Special Occasion (checkbox)
  - Confirmation Sent At (datetime)
  - Confirmation Clicked (checkbox)
  - ML Risk Score (number, 0-100)
  - ML Risk Level (single select: low/medium/high)
  - ML Confidence (number, 0-1)
  - ML Model Version (text)
  - ML Top Factors (long text, JSON)
  - ML Prediction Timestamp (datetime)
  ```

#### Day 5-7: Customer History Tracking System
- [ ] Create `api/_lib/customer-history.js`
  - Functions: `findOrCreateCustomer()`, `updateCustomerHistory()`, `getCustomerStats()`
- [ ] Integrate with reservation creation flow
- [ ] Backfill historical customer data (past 6-12 months)
- [ ] Test customer lookup and stats calculation

**Deliverables**:
- ✅ Customer History table with 500+ customer records
- ✅ All reservations have customer history linked
- ✅ Automated tracking on new reservations

---

### **WEEK 2: Feature Engineering Pipeline**

**Goal**: Build robust feature extraction system for ML

#### Day 8-10: Feature Engineering Service
- [ ] Create `api/ml/features.js`
- [ ] Implement 20+ feature extraction functions:

```javascript
// Temporal Features
- booking_lead_time_hours
- hour_of_day
- day_of_week (0-6)
- is_weekend (boolean)
- is_prime_time (boolean)
- month_of_year (1-12)
- days_until_reservation

// Customer Features
- is_repeat_customer (boolean)
- customer_visit_count (number)
- customer_no_show_rate (0-1)
- customer_avg_party_size (number)
- days_since_last_visit (number)
- customer_lifetime_value (if tracking spend)

// Reservation Features
- party_size (number)
- party_size_category (small/medium/large)
- is_large_party (boolean, >= 6)
- is_special_occasion (boolean)
- has_special_requests (boolean)

// Engagement Features
- confirmation_sent (boolean)
- confirmation_clicked (boolean)
- hours_since_confirmation_sent (number)

// Calculated Features
- historical_no_show_rate_for_day (0-1)
- historical_no_show_rate_for_time (0-1)
- occupancy_rate_for_slot (0-1)
```

#### Day 11-12: Feature Testing & Validation
- [ ] Write unit tests for each feature
- [ ] Test edge cases (missing data, new customers, etc.)
- [ ] Validate feature ranges (no negative values, proper normalization)
- [ ] Create feature documentation

#### Day 13-14: Historical Data Export
- [ ] Export 6-12 months of historical reservations
- [ ] Apply feature engineering to historical data
- [ ] Create training dataset CSV with features + labels
- [ ] Split into train (80%) / test (20%) sets

**Deliverables**:
- ✅ Feature engineering pipeline tested and working
- ✅ 1000+ historical reservations with 20+ features each
- ✅ Training dataset ready: `training_data.csv`

---

### **WEEK 3: ML Model Training & Evaluation**

**Goal**: Train high-accuracy XGBoost model

#### Day 15-17: Model Training Pipeline
- [ ] Set up Python environment:
  ```bash
  pip install xgboost scikit-learn pandas numpy joblib
  pip install shap matplotlib seaborn
  ```

- [ ] Create `ml-training/train_model.py`:
  ```python
  import xgboost as xgb
  from sklearn.model_selection import train_test_split
  from sklearn.metrics import roc_auc_score, accuracy_score

  # Load data
  df = pd.read_csv('training_data.csv')

  # Features and target
  X = df.drop(['no_show', 'reservation_id'], axis=1)
  y = df['no_show']  # 1 = no-show, 0 = showed up

  # Train/test split
  X_train, X_test, y_train, y_test = train_test_split(
      X, y, test_size=0.2, random_state=42
  )

  # Train XGBoost
  model = xgb.XGBClassifier(
      n_estimators=100,
      max_depth=6,
      learning_rate=0.1,
      subsample=0.8,
      colsample_bytree=0.8,
      objective='binary:logistic',
      random_state=42
  )

  model.fit(X_train, y_train)

  # Evaluate
  y_pred_proba = model.predict_proba(X_test)[:, 1]
  auc = roc_auc_score(y_test, y_pred_proba)
  accuracy = accuracy_score(y_test, y_pred > 0.5)

  print(f"AUC: {auc:.3f}")
  print(f"Accuracy: {accuracy:.3f}")

  # Save model
  import joblib
  joblib.dump(model, 'noshow_predictor_v1.0.pkl')
  ```

#### Day 18-19: Model Evaluation & Tuning
- [ ] Evaluate on test set
- [ ] Calculate metrics: AUC, accuracy, precision, recall, F1
- [ ] Analyze feature importance
- [ ] Tune hyperparameters if needed
- [ ] Create performance visualizations (ROC curve, confusion matrix)

#### Day 20-21: Model Deployment to Google Cloud Storage
- [ ] Upload trained model to GCS:
  ```bash
  gsutil cp noshow_predictor_v1.0.pkl \
    gs://restaurant-ml/models/noshow_predictor_v1.0.pkl
  ```
- [ ] Set up model versioning system
- [ ] Create model metadata file (version, accuracy, features used)

**Deliverables**:
- ✅ Trained XGBoost model with 85-90% accuracy
- ✅ Model evaluation report with metrics
- ✅ Model deployed to Google Cloud Storage

---

### **WEEK 4: Production API Integration**

**Goal**: Deploy ML predictions to production API

#### Day 22-24: ML Prediction Endpoint
- [ ] Create `api/ml/predict.js`:
  ```javascript
  const { Storage } = require('@google-cloud/storage');
  const { spawn } = require('child_process');

  // Load model from GCS
  async function loadModel() {
    const storage = new Storage();
    const bucket = storage.bucket('restaurant-ml');
    const file = bucket.file('models/noshow_predictor_v1.0.pkl');

    await file.download({ destination: '/tmp/model.pkl' });
    return '/tmp/model.pkl';
  }

  // Predict using Python subprocess
  async function predictNoShow(features) {
    return new Promise((resolve, reject) => {
      const python = spawn('python3', ['predict.py', JSON.stringify(features)]);

      let result = '';
      python.stdout.on('data', (data) => { result += data; });
      python.on('close', (code) => {
        if (code === 0) {
          resolve(JSON.parse(result));
        } else {
          reject(new Error('Prediction failed'));
        }
      });
    });
  }

  module.exports = async (req, res) => {
    try {
      const { reservation } = req.body;

      // Extract features
      const features = await extractFeatures(reservation);

      // Predict
      const prediction = await predictNoShow(features);

      // Save to Airtable
      await updateReservation(reservation.id, {
        'ML Risk Score': prediction.probability * 100,
        'ML Risk Level': prediction.risk_level,
        'ML Confidence': prediction.confidence,
        'ML Top Factors': JSON.stringify(prediction.factors),
        'ML Model Version': 'v1.0',
        'ML Prediction Timestamp': new Date().toISOString()
      });

      return res.json({ success: true, prediction });
    } catch (error) {
      console.error('Prediction error:', error);
      return res.status(500).json({ error: 'Prediction failed' });
    }
  };
  ```

- [ ] Create `api/ml/predict.py` (Python prediction script):
  ```python
  import sys
  import json
  import joblib
  import pandas as pd

  # Load model
  model = joblib.load('/tmp/model.pkl')

  # Get features from input
  features_json = sys.argv[1]
  features = json.loads(features_json)

  # Convert to DataFrame
  X = pd.DataFrame([features])

  # Predict
  probability = model.predict_proba(X)[0][1]

  # Determine risk level
  if probability < 0.20:
      risk_level = 'low'
  elif probability < 0.40:
      risk_level = 'medium'
  else:
      risk_level = 'high'

  # Output result
  result = {
      'probability': float(probability),
      'risk_level': risk_level,
      'confidence': 0.90  # Placeholder, can calculate from model
  }

  print(json.dumps(result))
  ```

#### Day 25-26: SHAP Explainability
- [ ] Create `api/ml/explain.py`:
  ```python
  import shap
  import joblib
  import pandas as pd
  import json
  import sys

  # Load model
  model = joblib.load('/tmp/model.pkl')

  # Get features
  features = json.loads(sys.argv[1])
  X = pd.DataFrame([features])

  # Calculate SHAP values
  explainer = shap.TreeExplainer(model)
  shap_values = explainer.shap_values(X)

  # Get top 3 contributing factors
  feature_importance = list(zip(X.columns, shap_values[0]))
  feature_importance.sort(key=lambda x: abs(x[1]), reverse=True)

  top_factors = []
  for feature, impact in feature_importance[:3]:
      impact_pct = impact * 100
      direction = "+" if impact > 0 else ""
      top_factors.append(f"{feature} ({direction}{impact_pct:.1f}%)")

  print(json.dumps({'factors': top_factors}))
  ```

- [ ] Integrate SHAP explanations into prediction endpoint

#### Day 27-28: Integration Testing
- [ ] Test ML prediction on new reservations
- [ ] Verify Airtable updates with ML fields
- [ ] Test edge cases (missing data, new customers)
- [ ] Load testing (100+ predictions/min)
- [ ] Verify SHAP explanations are meaningful

**Deliverables**:
- ✅ Production ML prediction endpoint
- ✅ SHAP explainability working
- ✅ Airtable integration complete

---

### **WEEK 5: Dashboard Integration & Monitoring**

**Goal**: Show ML predictions in analytics dashboard

#### Day 29-31: Frontend Updates
- [ ] Update `client/src/components/analytics/NoShowPredictions.tsx`
- [ ] Show ML predictions instead of rule-based scores
- [ ] Display SHAP factor explanations
- [ ] Add confidence indicators
- [ ] Add "Why this prediction?" tooltips

#### Day 32-33: Prediction Logging System
- [ ] Create `Prediction_Log` table in Airtable:
  ```
  Fields:
  - Prediction ID (auto)
  - Reservation ID (link)
  - Predicted At (datetime)
  - Predicted Probability (number)
  - Predicted Risk Level (text)
  - Actual Outcome (single select: showed_up/no_show/cancelled)
  - Model Version (text)
  - Features Used (long text, JSON)
  - Correct Prediction (checkbox)
  ```

- [ ] Log all predictions for future analysis
- [ ] Create accuracy tracking dashboard

#### Day 34-35: Monitoring & Alerts
- [ ] Set up model performance monitoring
- [ ] Create daily accuracy report
- [ ] Alert if accuracy drops below 80%
- [ ] Monitor prediction latency (<200ms)

**Deliverables**:
- ✅ ML predictions visible in dashboard
- ✅ Prediction logging working
- ✅ Monitoring system active

---

### **WEEK 6: Continuous Learning & Production Rollout**

**Goal**: Automated daily retraining and full production deployment

#### Day 36-38: Daily Retraining Cron Job
- [ ] Create `api/cron/retrain-model.js`:
  ```javascript
  module.exports = async (req, res) => {
    console.log('[RETRAIN] Starting daily model retraining...');

    try {
      // 1. Fetch yesterday's predictions and outcomes
      const predictions = await getPredictionLog(yesterday);

      // 2. Calculate current model accuracy
      const currentAccuracy = calculateAccuracy(predictions);
      console.log(`Current model accuracy: ${currentAccuracy}%`);

      // 3. Export new training data
      await exportTrainingData();

      // 4. Trigger Python retraining script
      const newModel = await retrainModel();

      // 5. Evaluate new model
      const newAccuracy = newModel.test_accuracy;
      console.log(`New model accuracy: ${newAccuracy}%`);

      // 6. Deploy if better
      if (newAccuracy > currentAccuracy) {
        await deployModel(newModel);
        console.log('✅ New model deployed!');
      } else {
        console.log('⏭️ Keeping current model (no improvement)');
      }

      return res.json({
        success: true,
        current_accuracy: currentAccuracy,
        new_accuracy: newAccuracy,
        deployed: newAccuracy > currentAccuracy
      });
    } catch (error) {
      console.error('[RETRAIN] Error:', error);
      return res.status(500).json({ error: error.message });
    }
  };
  ```

- [ ] Add to `vercel.json`:
  ```json
  {
    "crons": [
      {
        "path": "/api/cron/check-late-reservations",
        "schedule": "*/5 * * * *"
      },
      {
        "path": "/api/cron/retrain-model",
        "schedule": "0 3 * * *"
      }
    ]
  }
  ```

#### Day 39-40: A/B Testing Framework
- [ ] Implement gradual rollout system
- [ ] 10% traffic → ML predictions
- [ ] 90% traffic → current system
- [ ] Monitor accuracy difference
- [ ] Increase to 50% if ML is better
- [ ] Full rollout at 100% if successful

#### Day 41-42: Final Testing & Documentation
- [ ] Full end-to-end testing
- [ ] Load testing (1000+ reservations/day)
- [ ] Edge case testing
- [ ] Create user documentation
- [ ] Create operations playbook
- [ ] Train restaurant staff on new predictions

**Deliverables**:
- ✅ Automated daily retraining
- ✅ A/B testing framework
- ✅ Full production deployment
- ✅ Complete documentation

---

## 📊 Success Metrics & Monitoring

### Week-by-Week Targets

| Week | Milestone | Success Criteria |
|------|-----------|------------------|
| Week 1 | Customer History | 500+ customers tracked, 80% of reservations linked |
| Week 2 | Feature Engineering | 20+ features extracted, training data exported |
| Week 3 | Model Training | AUC >0.85, Accuracy >85% on test set |
| Week 4 | Production API | <200ms prediction latency, 100% uptime |
| Week 5 | Dashboard | Predictions visible, explanations shown |
| Week 6 | Continuous Learning | Daily retraining working, accuracy improving |

### Production Monitoring Dashboards

1. **Model Performance Dashboard**:
   - Daily accuracy rate
   - AUC-ROC over time
   - Precision and recall trends
   - Model version history

2. **Prediction Analytics Dashboard**:
   - Total predictions made
   - Risk level distribution (low/medium/high)
   - Prediction latency (p50, p95, p99)
   - Error rate

3. **Business Impact Dashboard**:
   - No-shows prevented (estimated)
   - Revenue saved
   - Confirmation success rate
   - Deposit collection rate

---

## 🛠️ Technical Stack

### Backend
- **Node.js**: API endpoints, orchestration
- **Python 3.9+**: ML training and prediction
- **XGBoost**: Primary ML model
- **SHAP**: Model explainability
- **Google Cloud Storage**: Model storage
- **Airtable**: Database

### ML Libraries
```bash
# Python requirements.txt
xgboost==2.0.3
scikit-learn==1.4.0
pandas==2.1.4
numpy==1.26.3
joblib==1.3.2
shap==0.44.0
matplotlib==3.8.2
seaborn==0.13.1
```

### Infrastructure
- **Vercel**: API hosting
- **Google Cloud**: Model storage, Vertex AI
- **Vercel Cron**: Daily retraining jobs

---

## 💰 Cost Estimate

| Service | Monthly Cost |
|---------|-------------|
| Google Cloud Storage (models, data) | $5-$10 |
| Vertex AI API calls (if using Gemini insights) | $20-$50 |
| Python runtime on Vercel | $0 (included) |
| Additional Airtable records | $0 (within limits) |
| **Total** | **$25-$60/month** |

**ROI**: $16,896/year revenue saved - $720/year cost = **$16,176 net profit**
**Payback Period**: <1 month

---

## 🚨 Risk Mitigation

### Fallback Strategy
```javascript
async function predict(reservation) {
  try {
    // Try ML prediction first
    return await mlPredict(reservation);
  } catch (error) {
    console.error('ML prediction failed, using fallback:', error);
    // Fall back to rule-based system
    return await ruleBasedPredict(reservation);
  }
}
```

### Data Quality Checks
- Validate all features before prediction
- Handle missing data gracefully
- Alert if >10% of predictions fail
- Log all errors for debugging

### Model Validation
- Never deploy a model worse than current
- Require minimum AUC of 0.80
- Test on holdout set before deployment
- Manual approval for first 3 deployments

---

## 📋 Next Actions - Starting Right Now

1. **Create Customer History table** (30 min)
2. **Add ML fields to Reservations** (45 min)
3. **Build customer tracking system** (3 hours)
4. **Backfill historical data** (1 hour)
5. **Create feature engineering pipeline** (4 hours)

Ready to start? Which part should I tackle first?

---

**Implementation Plan Created**: 2025-10-25
**Status**: Ready to Start
**Next**: Begin Week 1, Day 1 - Database Schema Design
