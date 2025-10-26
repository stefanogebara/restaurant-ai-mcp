# ML Training Data Collection & Model Retraining Guide

## Overview

This system automatically collects reservation data and outcomes to build a custom machine learning model trained on YOUR restaurant's actual customer behavior patterns. Over time, this replaces the initial hotel-booking-trained model with one specifically optimized for your restaurant.

## Model Evolution Roadmap

### Phase 1: Hotel-Trained Model (v2.0.0) - CURRENT
- **Training Data**: 119,386 hotel booking records
- **Performance**: 85.3% ROC-AUC
- **Use Case**: Initial launch with no restaurant data available
- **Advantages**: Immediate production-ready predictions
- **Limitations**: Generic hospitality patterns, not restaurant-specific

### Phase 2: Fine-Tuned Model (v3.0.0) - AT 100+ SAMPLES
- **Training Data**: YOUR first 100-500 completed reservations
- **Performance**: Expected 90-92% ROC-AUC
- **Use Case**: Adapt to your specific customer base
- **Advantages**: Captures your restaurant's unique patterns
- **Trigger**: Run `retrain_custom_model.py` when 100+ completed reservations

### Phase 3: Fully Custom Model (v4.0.0) - AT 500+ SAMPLES
- **Training Data**: YOUR 500+ completed reservations
- **Performance**: Expected 93-95% ROC-AUC
- **Use Case**: Fully optimized for your operation
- **Advantages**: Maximum accuracy on your exact customer behavior
- **Trigger**: Re-run training script quarterly with growing dataset

## How Data Collection Works

### Automatic Logging Pipeline

Every reservation automatically goes through this lifecycle:

```
1. CREATION (reservations.js:175-181)
   → Log to CSV with ML prediction
   → Status: "pending"

2. OUTCOME (one of three paths):

   A. CUSTOMER SHOWS UP (host-dashboard.js:348-353)
      → Logged when service marked complete
      → Status: "showed_up"
      → Includes seated_at, completed_at timestamps

   B. CUSTOMER NO-SHOWS
      → Detected when reservation time passes without check-in
      → Status: "no_show"
      → TODO: Implement automated no-show detection

   C. CUSTOMER CANCELS (reservations.js:286-287)
      → Logged when cancellation requested
      → Status: "cancelled"
      → Includes cancellation timestamp
```

### Data Logged Per Reservation (20 Fields)

The system captures comprehensive feature data for ML training:

**Reservation Details:**
- reservation_id
- created_at
- reservation_date
- reservation_time
- customer_name
- customer_email
- customer_phone
- party_size
- special_requests

**ML Features:**
- booking_lead_time_hours (how far in advance booked)
- is_repeat_customer (0 or 1)
- customer_visit_count (total prior reservations)
- customer_no_show_rate (historical rate for this customer)
- days_since_last_visit (999 if new customer)

**ML Prediction (for comparison):**
- ml_predicted_probability (what v2.0.0 predicted)
- ml_predicted_risk_level (low/medium/high/very-high)

**Actual Outcome:**
- actual_outcome (pending → showed_up/no_show/cancelled)
- outcome_timestamp
- seated_at
- completed_at

## Training Data Location

All data is stored in CSV format for easy inspection and portability:

**File**: `ml-training-data/restaurant_training_data.csv`

**Format**:
```csv
reservation_id,created_at,reservation_date,reservation_time,customer_email,customer_phone,customer_name,party_size,special_requests,booking_lead_time_hours,is_repeat_customer,customer_visit_count,customer_no_show_rate,days_since_last_visit,ml_predicted_probability,ml_predicted_risk_level,actual_outcome,outcome_timestamp,seated_at,completed_at
RES-20251018-1234,2025-10-18T14:30:00Z,2025-10-20,19:00,john@example.com,555-1234,John Smith,2,"Dietary restrictions",52.5,0,0,0.15,999,0.312,medium,showed_up,2025-10-20T21:30:00Z,2025-10-20T19:05:00Z,2025-10-20T21:30:00Z
```

## Checking Training Progress

### API Endpoint: `/api/ml-training-status`

**Request**:
```bash
curl https://restaurant-ai-mcp.vercel.app/api/ml-training-status
```

**Response Example** (50 samples collected):
```json
{
  "success": true,
  "stats": {
    "totalSamples": 50,
    "showedUp": 38,
    "noShows": 7,
    "cancelled": 5,
    "pending": 0,
    "completedSamples": 50,
    "noShowRate": "14.0%",
    "readyForRetraining": false,
    "samplesNeeded": 50
  },
  "message": "📊 Collecting data... You need 50 more completed reservations (currently: 50/100)."
}
```

**Response Example** (100+ samples - READY):
```json
{
  "success": true,
  "stats": {
    "totalSamples": 120,
    "showedUp": 95,
    "noShows": 15,
    "cancelled": 10,
    "pending": 0,
    "completedSamples": 120,
    "noShowRate": "12.5%",
    "readyForRetraining": true,
    "samplesNeeded": 0
  },
  "message": "🎉 Ready to retrain! You have 120 completed reservations with outcomes."
}
```

### Manual Check (Local Development)

```bash
# Navigate to training data directory
cd ml-training-data

# View CSV file
cat restaurant_training_data.csv | wc -l  # Count lines (subtract 1 for header)

# Check completion status
grep -c "showed_up" restaurant_training_data.csv
grep -c "no_show" restaurant_training_data.csv
grep -c "cancelled" restaurant_training_data.csv
grep -c "pending" restaurant_training_data.csv
```

## Retraining Your Custom Model

### When to Retrain

**Minimum**: 100 completed reservations (showed_up + no_show + cancelled)
**Recommended**: 200+ for better accuracy
**Optimal**: 500+ for maximum performance

### Prerequisites

1. **Python 3.8+** installed
2. **Required libraries**:
   ```bash
   pip install pandas numpy scikit-learn xgboost
   ```
3. **Training data**: `restaurant_training_data.csv` exists with 100+ completed samples

### Retraining Steps

#### Step 1: Verify Data Readiness

```bash
# Check training status
curl https://restaurant-ai-mcp.vercel.app/api/ml-training-status

# Ensure readyForRetraining: true
```

#### Step 2: Run Retraining Script

```bash
# Navigate to training directory
cd ml-training-data

# Run custom model training
python retrain_custom_model.py
```

#### Step 3: Review Training Results

The script will output:

```
================================================================================
CUSTOM RESTAURANT MODEL TRAINING
Retraining on YOUR actual reservation data
================================================================================

Loading your restaurant training data...
   Total reservations logged: 120
   Completed reservations (with outcomes): 120
   - Showed up: 95
   - No-shows: 15
   - Cancelled: 10

Preparing features...
   YOUR no-show rate: 12.5% (15 / 120)
   Features: 8
   Samples: 120

Splitting dataset...
   Training: 96 samples (12.5% no-show rate)
   Testing: 24 samples (12.5% no-show rate)

Training YOUR custom XGBoost model...
   Model trained successfully!

Evaluating YOUR model...

================================================================================
CLASSIFICATION REPORT:
================================================================================
              precision    recall  f1-score   support

   Showed Up       0.92      0.95      0.93        21
     No-Show       0.67      0.50      0.57         3

    accuracy                           0.88        24
   macro avg       0.79      0.73      0.75        24
weighted avg       0.88      0.88      0.88        24

ROC-AUC Score: 0.9127

================================================================================
YOUR TOP PREDICTORS:
================================================================================
                       feature  importance
    customer_no_show_rate      0.521843
  booking_lead_time_hours      0.198472
   has_special_requests        0.134722
  customer_visit_count         0.087653
  days_since_last_visit        0.057310

Exporting YOUR custom model...
   Custom model saved to: ../api/ml/model-data.js
   Full XGBoost saved to: no_show_model_v3_custom.json

================================================================================
CUSTOM MODEL TRAINING COMPLETE!
================================================================================
Model Version: 3.0.0 (CUSTOM)
Training Samples: 120 YOUR reservations
ROC-AUC Score: 0.9127
Your No-Show Rate: 12.5%
Top Predictor: customer_no_show_rate
================================================================================

Your custom model is now LIVE!
Restart your server to use it: npm run server:dev
================================================================================
```

#### Step 4: Deploy Updated Model

**For Local Development**:
```bash
# Restart the backend server
npm run server:dev
```

**For Production**:
```bash
# Commit the updated model file
git add api/ml/model-data.js
git commit -m "Update to v3.0.0 custom model trained on 120 samples"
git push origin main

# Vercel will auto-deploy
```

#### Step 5: Verify New Model is Active

```bash
# Test a prediction to see model version
curl https://restaurant-ai-mcp.vercel.app/api/reservations?action=create \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-10-25",
    "time": "19:00",
    "party_size": 2,
    "customer_name": "Test Customer",
    "customer_phone": "555-0000",
    "customer_email": "test@example.com"
  }'

# Check logs for "ML Model Version: 3.0.0"
```

## Understanding Model Performance

### Key Metrics

**ROC-AUC Score** (0.5 to 1.0):
- **0.50**: Random guessing (useless)
- **0.70-0.80**: Acceptable performance
- **0.80-0.90**: Good performance (v2.0.0 hotel-trained: 85.3%)
- **0.90-0.95**: Excellent performance (v3.0.0 target)
- **0.95+**: Outstanding (rare, requires 1000+ samples)

**Precision vs Recall**:
- **Precision**: Of customers flagged as no-shows, what % actually no-showed?
- **Recall**: Of customers who no-showed, what % did we flag?
- Trade-off: High precision = fewer false alarms, high recall = catch more no-shows

### Feature Importance Analysis

The script tells you which factors most predict no-shows FOR YOUR RESTAURANT:

**Example from v2.0.0 (hotel-trained)**:
1. customer_no_show_rate: 43.3% - Customer's historical behavior
2. has_special_requests: 17.2% - Engagement indicator
3. hours_since_confirmation_sent: 6.1% - Time decay
4. booking_lead_time_hours: 4.5% - Advance booking time
5. days_since_last_visit: 4.3% - Recency

**Your v3.0.0 custom model may find DIFFERENT patterns**:
- Maybe party_size matters more for your restaurant
- Maybe booking_lead_time is your strongest signal
- Maybe day_of_week patterns emerge

This is the power of custom training!

## Best Practices

### Data Quality

**DO**:
- ✅ Ensure all reservations are logged (automatic via integration)
- ✅ Mark accurate outcomes (showed up, no-show, cancelled)
- ✅ Complete service records promptly to get accurate timestamps
- ✅ Wait for 100+ completed samples before retraining

**DON'T**:
- ❌ Manually edit the CSV (corrupts training data)
- ❌ Delete old reservations (more data = better model)
- ❌ Retrain too frequently (wait for significant new data)
- ❌ Skip outcome logging (creates incomplete training samples)

### Retraining Frequency

**First Retraining**: At 100-150 completed reservations (v3.0.0)
**Second Retraining**: At 500+ completed reservations (v4.0.0)
**Ongoing**: Every 3-6 months or when patterns change significantly

### Monitoring Model Drift

Signs your model needs retraining:
- Actual no-show rate diverges from predicted rate by >5%
- New customer segments emerge (e.g., event bookings)
- Seasonal patterns change
- Business hours or policies change

## Troubleshooting

### "Only X completed reservations! Need Y more"

**Cause**: Not enough reservations with outcomes (showed_up, no_show, cancelled)

**Solution**:
- Wait for more customers to complete their reservations
- Ensure service records are marked complete (triggers "showed_up")
- Verify cancellation flow is working (triggers "cancelled")

### "Reservation ID not found in training log"

**Cause**: Trying to update outcome for reservation that wasn't logged at creation

**Solution**:
- This is expected for reservations created before data collection was deployed
- Only new reservations (after Oct 26, 2025) will have outcomes
- Ignore this warning for old reservations

### CSV File Corrupted

**Cause**: Manual editing or file system error

**Solution**:
```bash
# Check for syntax errors
python -c "import pandas as pd; pd.read_csv('restaurant_training_data.csv')"

# If corrupted, restore from backup (if available)
# Or manually fix CSV formatting
```

### Model Performance Worse Than Expected

**Cause**:
- Not enough training samples (need 200+)
- Imbalanced data (e.g., 98% showed up, 2% no-show)
- Features not predictive for your restaurant

**Solution**:
- Collect more data (especially no-show examples)
- Wait until 500+ samples for stable model
- Examine feature importance to understand what matters
- Consider adding new features (e.g., day_of_week, time_of_day)

## Advanced: Adding New Features

### Current Features (8 total)

```javascript
const FEATURE_NAMES = [
  'booking_lead_time_hours',
  'party_size',
  'is_repeat_customer',
  'customer_visit_count',
  'customer_no_show_rate',
  'days_since_last_visit',
  'has_special_requests'
];
```

### To Add New Features

**Example: Add day_of_week feature**

1. **Update data-logger.js** to log new field:
```javascript
const row = [
  // ... existing fields ...
  new Date(reservation.date).getDay(), // 0=Sunday, 6=Saturday
  // ... rest of fields ...
];
```

2. **Update CSV header**:
```javascript
const headers = [
  // ... existing headers ...
  'day_of_week',
  // ... rest of headers ...
];
```

3. **Update retrain_custom_model.py**:
```python
FEATURE_NAMES = [
    'booking_lead_time_hours',
    'party_size',
    # ... existing features ...
    'day_of_week'  # New feature!
]

# Add feature engineering if needed
df['day_of_week'] = pd.to_datetime(df['reservation_date']).dt.dayofweek
```

4. **Retrain model** with new feature

5. **Update predict.js** to extract new feature when making predictions

## Support & Questions

### Viewing Raw Data

```bash
# See all reservations logged
cat ml-training-data/restaurant_training_data.csv

# Filter by outcome
grep "showed_up" ml-training-data/restaurant_training_data.csv
grep "no_show" ml-training-data/restaurant_training_data.csv
grep "cancelled" ml-training-data/restaurant_training_data.csv
grep "pending" ml-training-data/restaurant_training_data.csv
```

### Manual Data Export

```bash
# Convert CSV to JSON for analysis
python -c "
import pandas as pd
import json
df = pd.read_csv('restaurant_training_data.csv')
print(json.dumps(df.to_dict('records'), indent=2))
" > training_data.json
```

### Testing Predictions

```bash
# Test with various scenarios
node test-new-model.js

# Or via API
curl -X POST https://restaurant-ai-mcp.vercel.app/api/reservations?action=create \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-10-25","time":"19:00","party_size":2,"customer_name":"Test","customer_phone":"555-0000"}'
```

## Summary

This ML data collection system enables continuous improvement of no-show predictions:

1. **Automatic**: Every reservation is logged without manual intervention
2. **Comprehensive**: 20 fields captured per reservation
3. **Versioned**: Track model evolution (v2.0.0 → v3.0.0 → v4.0.0)
4. **Transparent**: CSV format allows easy inspection and portability
5. **Production-Ready**: Retrain script handles full pipeline from CSV to deployment

As you collect more data, your model becomes increasingly accurate at predicting YOUR specific customer behavior patterns!

---

**Last Updated**: 2025-10-26
**Current Model**: v2.0.0 (Hotel-trained, 85.3% AUC)
**Next Milestone**: v3.0.0 at 100 completed reservations
