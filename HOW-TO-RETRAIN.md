# How to Retrain the No-Show Prediction Model

**When to Use This Guide**: After collecting 1000+ reservations with known outcomes over 6-12 months

**Current Model Status**: Proof-of-concept trained on 7 samples (NOT production-ready)

---

## Prerequisites

Before retraining, ensure you have:

- [ ] **1000+ reservations** with known outcomes (completed or no-show)
- [ ] **15-25% no-show rate** (balanced classes)
- [ ] **Real booking data** (not test/placeholder data)
- [ ] **Customer history** for at least 30% of reservations
- [ ] **Accurate timestamps** for booking_created_at field
- [ ] **Variety in features** (different lead times, party sizes, times, days)

---

## Option 1: Retrain with Python XGBoost (Recommended for Production)

### Why Python XGBoost?

- **Research-backed**: The 2024 research showing 85-95% accuracy used XGBoost
- **Superior performance**: Better than Random Forest for tabular data
- **Feature importance**: Built-in SHAP values for explainability
- **Production-ready**: Battle-tested in industry
- **Hyperparameter tuning**: Advanced optimization capabilities

### Step 1: Export Training Data

```bash
cd restaurant-ai-mcp
node scripts/export-training-data.js
```

**Output**: `ml-training/historical_training_data.csv`

**Verify Export**:
- Check `ml-training/data_quality_report.json`
- Ensure: 1000+ records, 15-25% no-show rate, no missing values

---

### Step 2: Install Python Dependencies

Create a Python virtual environment:

```bash
# Create virtual environment
python -m venv ml-env

# Activate (Windows)
ml-env\Scripts\activate

# Activate (Mac/Linux)
source ml-env/bin/activate

# Install dependencies
pip install xgboost scikit-learn pandas numpy matplotlib shap
```

---

### Step 3: Create Python Training Script

Create `scripts/train_xgboost.py`:

```python
"""
XGBoost No-Show Prediction Model Training

Trains production-ready XGBoost model with hyperparameter tuning
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    roc_auc_score, confusion_matrix, classification_report
)
import xgboost as xgb
import matplotlib.pyplot as plt
import shap
import json
import pickle
from datetime import datetime

# Configuration
DATA_PATH = '../ml-training/historical_training_data.csv'
MODEL_OUTPUT_PATH = '../ml-models/xgboost_model.pkl'
METRICS_OUTPUT_PATH = '../ml-models/model_evaluation.json'
FEATURE_IMPORTANCE_PATH = '../ml-models/feature_importance.png'

# Feature names (must match CSV)
FEATURE_NAMES = [
    'booking_lead_time_hours', 'hour_of_day', 'day_of_week',
    'is_weekend', 'is_prime_time', 'month_of_year',
    'days_until_reservation', 'is_repeat_customer', 'customer_visit_count',
    'customer_no_show_rate', 'customer_avg_party_size', 'days_since_last_visit',
    'customer_lifetime_value', 'party_size', 'party_size_category',
    'is_large_party', 'has_special_requests', 'confirmation_sent',
    'confirmation_clicked', 'hours_since_confirmation_sent',
    'historical_no_show_rate_for_day', 'historical_no_show_rate_for_time',
    'occupancy_rate_for_slot'
]

def load_data():
    """Load and prepare training data"""
    print("📂 Loading training data...")

    df = pd.read_csv(DATA_PATH)

    # Separate features and target
    X = df[FEATURE_NAMES]
    y = df['no_show']

    print(f"   Dataset shape: {X.shape}")
    print(f"   No-show rate: {y.mean():.1%}")

    return X, y

def train_test_split_data(X, y, test_size=0.2, random_state=42):
    """Split data into train and test sets"""
    print(f"\n🔀 Splitting data (test size: {test_size:.0%})...")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state, stratify=y
    )

    print(f"   Train: {len(X_train)} samples")
    print(f"   Test: {len(X_test)} samples")

    return X_train, X_test, y_train, y_test

def train_model(X_train, y_train):
    """Train XGBoost model with hyperparameter tuning"""
    print("\n🌲 Training XGBoost model with hyperparameter tuning...")

    # Define parameter grid
    param_grid = {
        'max_depth': [3, 5, 7],
        'learning_rate': [0.01, 0.1, 0.3],
        'n_estimators': [100, 200, 300],
        'min_child_weight': [1, 3, 5],
        'subsample': [0.8, 1.0],
        'colsample_bytree': [0.8, 1.0]
    }

    # Create base model
    base_model = xgb.XGBClassifier(
        objective='binary:logistic',
        random_state=42,
        use_label_encoder=False,
        eval_metric='logloss'
    )

    # Grid search with cross-validation
    grid_search = GridSearchCV(
        base_model,
        param_grid,
        cv=5,
        scoring='f1',
        n_jobs=-1,
        verbose=1
    )

    grid_search.fit(X_train, y_train)

    print(f"\n✅ Best parameters: {grid_search.best_params_}")
    print(f"   Best CV F1-Score: {grid_search.best_score_:.3f}")

    return grid_search.best_estimator_

def evaluate_model(model, X_test, y_test):
    """Comprehensive model evaluation"""
    print("\n📊 Evaluating model...")

    # Get predictions
    y_pred = model.predict(X_test)
    y_prob = model.predict_proba(X_test)[:, 1]

    # Calculate metrics
    metrics = {
        'accuracy': accuracy_score(y_test, y_pred),
        'precision': precision_score(y_test, y_pred),
        'recall': recall_score(y_test, y_pred),
        'f1_score': f1_score(y_test, y_pred),
        'roc_auc': roc_auc_score(y_test, y_prob),
        'confusion_matrix': confusion_matrix(y_test, y_pred).tolist()
    }

    # Print results
    print("\n" + "="*70)
    print("MODEL EVALUATION RESULTS")
    print("="*70)
    print(f"\nAccuracy:  {metrics['accuracy']:.1%}")
    print(f"Precision: {metrics['precision']:.1%}")
    print(f"Recall:    {metrics['recall']:.1%}")
    print(f"F1-Score:  {metrics['f1_score']:.1%}")
    print(f"ROC-AUC:   {metrics['roc_auc']:.3f}")

    print("\nConfusion Matrix:")
    cm = metrics['confusion_matrix']
    print(f"   TN: {cm[0][0]}  FP: {cm[0][1]}")
    print(f"   FN: {cm[1][0]}  TP: {cm[1][1]}")

    print("\n" + classification_report(y_test, y_pred))
    print("="*70 + "\n")

    return metrics

def plot_feature_importance(model, feature_names):
    """Plot and save feature importance"""
    print("📈 Generating feature importance plot...")

    importance = model.feature_importances_
    indices = np.argsort(importance)[::-1]

    plt.figure(figsize=(10, 8))
    plt.title('Feature Importance')
    plt.barh(range(len(indices)), importance[indices])
    plt.yticks(range(len(indices)), [feature_names[i] for i in indices])
    plt.xlabel('Importance')
    plt.tight_layout()
    plt.savefig(FEATURE_IMPORTANCE_PATH, dpi=300)
    print(f"   Saved to {FEATURE_IMPORTANCE_PATH}")

def save_model(model, metrics):
    """Save model and metrics"""
    print("\n💾 Saving model...")

    # Save model
    with open(MODEL_OUTPUT_PATH, 'wb') as f:
        pickle.dump(model, f)
    print(f"   Model saved to {MODEL_OUTPUT_PATH}")

    # Save metrics
    metrics_output = {
        'evaluated_at': datetime.now().isoformat(),
        'metrics': {k: float(v) if isinstance(v, (int, float)) else v
                   for k, v in metrics.items()},
        'model_type': 'xgboost',
        'version': '2.0.0'
    }

    with open(METRICS_OUTPUT_PATH, 'w') as f:
        json.dump(metrics_output, f, indent=2)
    print(f"   Metrics saved to {METRICS_OUTPUT_PATH}")

def main():
    """Main training pipeline"""
    print("🚀 Starting XGBoost Model Training\n")
    print("="*70 + "\n")

    # Load data
    X, y = load_data()

    # Split data
    X_train, X_test, y_train, y_test = train_test_split_data(X, y)

    # Train model
    model = train_model(X_train, y_train)

    # Evaluate model
    metrics = evaluate_model(model, X_test, y_test)

    # Feature importance
    plot_feature_importance(model, FEATURE_NAMES)

    # Save model
    save_model(model, metrics)

    print("✅ Training complete!\n")
    print("Next steps:")
    print("1. Review model evaluation metrics")
    print("2. Check feature importance plot")
    print("3. If metrics are good (>85% accuracy), deploy to production")
    print("4. Update prediction service to use new model")

if __name__ == '__main__':
    main()
```

---

### Step 4: Run Python Training

```bash
# Activate virtual environment
ml-env\Scripts\activate  # Windows
source ml-env/bin/activate  # Mac/Linux

# Run training
python scripts/train_xgboost.py
```

**Expected Output**:
- Training progress with cross-validation
- Best hyperparameters found
- Evaluation metrics (accuracy, precision, recall, F1, ROC-AUC)
- Feature importance plot
- Saved model file

---

### Step 5: Deploy New Model

After training, you'll have:
- `ml-models/xgboost_model.pkl` - Trained model
- `ml-models/model_evaluation.json` - Performance metrics
- `ml-models/feature_importance.png` - Feature importance visualization

**Update Prediction Service**:

Modify `api/ml/predict.js` to load the Python model:

```javascript
// Add at top
const { PythonShell } = require('python-shell');

// New prediction function for Python model
async function predictWithPython(features) {
  return new Promise((resolve, reject) => {
    PythonShell.run('scripts/predict_xgboost.py', {
      args: [JSON.stringify(features)]
    }, (err, results) => {
      if (err) reject(err);
      else resolve(JSON.parse(results[0]));
    });
  });
}
```

---

## Option 2: Retrain with Vertex AI AutoML (Recommended for Google Cloud)

### Why Vertex AI AutoML?

- **No ML expertise required**: AutoML handles everything
- **Automatic hyperparameter tuning**: Finds best model automatically
- **Scalable**: Handles large datasets easily
- **Integrated**: Already using Vertex AI in this project
- **Explainability**: Built-in feature importance and SHAP values

### Step 1: Export Data to CSV

```bash
node scripts/export-training-data.js
```

---

### Step 2: Upload to Google Cloud Storage

```bash
# Install gsutil if not already installed
# Upload CSV to GCS
gsutil cp ml-training/historical_training_data.csv gs://your-bucket/ml-data/
```

---

### Step 3: Create AutoML Training Job

Create `scripts/train-vertex-automl.js`:

```javascript
const { AutoMlClient } = require('@google-cloud/automl').v1;

async function trainAutoML() {
  const client = new AutoMlClient();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = 'us-central1';

  const dataset = {
    displayName: 'restaurant-no-show-prediction',
    tablesDatasetMetadata: {
      targetColumnSpecId: 'no_show'
    }
  };

  // Create dataset
  const [operation] = await client.createDataset({
    parent: client.locationPath(projectId, location),
    dataset: dataset
  });

  console.log('Training job started:', operation.name);

  // Wait for completion
  const [response] = await operation.promise();
  console.log('Model trained:', response.name);
}

trainAutoML();
```

---

### Step 4: Deploy Model

```bash
# Deploy model to endpoint
gcloud ai models deploy MODEL_ID \
  --region=us-central1 \
  --display-name=no-show-predictor
```

---

### Step 5: Update Prediction Service

Modify `api/ml/predict.js` to use Vertex AI endpoint:

```javascript
const { PredictionServiceClient } = require('@google-cloud/aiplatform');

async function predictWithVertexAI(features) {
  const client = new PredictionServiceClient();

  const request = {
    endpoint: 'projects/YOUR_PROJECT/locations/us-central1/endpoints/YOUR_ENDPOINT',
    instances: [features]
  };

  const [response] = await client.predict(request);
  return response.predictions[0];
}
```

---

## Option 3: Retrain with JavaScript (Current Approach)

### When to Use

- Quick iteration and testing
- Small datasets (<10,000 records)
- Proof-of-concept validation

### How to Retrain

Simply re-run the existing training script:

```bash
# 1. Export new data
node scripts/export-training-data.js

# 2. Retrain model
node scripts/train-model.js

# 3. Test predictions
node scripts/test-predictions.js
```

**Limitations**:
- Not as accurate as XGBoost
- No advanced hyperparameter tuning
- Limited to simple algorithms

---

## Production Deployment Checklist

Before deploying retrained model to production:

### Data Quality
- [ ] 1000+ training samples
- [ ] 15-25% no-show rate (balanced classes)
- [ ] <5% missing values
- [ ] Real booking data (not test data)
- [ ] Customer history for 30%+ of records

### Model Performance
- [ ] Accuracy > 85%
- [ ] Precision > 80% (avoid false alarms)
- [ ] Recall > 85% (catch most no-shows)
- [ ] F1-Score > 82%
- [ ] ROC-AUC > 0.87

### Feature Quality
- [ ] All 23 features have variation
- [ ] No features with 100% same value
- [ ] Feature importance matches research
- [ ] Top 5 features are: lead_time, customer_no_show_rate, is_repeat_customer, party_size, confirmation_clicked

### Testing
- [ ] Model tested on holdout test set
- [ ] Cross-validation performed (5-fold minimum)
- [ ] Predictions make intuitive sense
- [ ] Feature importance is interpretable
- [ ] Edge cases handled gracefully

### Deployment
- [ ] Model versioning system in place
- [ ] A/B testing capability ready
- [ ] Rollback plan documented
- [ ] Monitoring and logging configured
- [ ] Performance benchmarks established

---

## Monitoring After Deployment

**Track These Metrics Weekly**:

1. **Prediction Accuracy**: Are predictions matching actual outcomes?
2. **No-Show Rate**: Is it staying at 15-25%?
3. **Feature Drift**: Are feature distributions changing?
4. **Model Latency**: Response time < 200ms?
5. **Error Rate**: < 1% prediction errors

**Retrain Model When**:
- Accuracy drops below 80%
- No-show rate changes by >10%
- Significant feature drift detected
- Every 6 months (minimum)

---

## Troubleshooting

### Model Has Low Accuracy (<70%)

**Possible Causes**:
- Not enough training data
- Class imbalance too severe
- Important features missing
- Data quality issues

**Solutions**:
- Collect more data (target: 2000+ samples)
- Use SMOTE or class weighting for imbalance
- Add more features (e.g., weather, local events)
- Clean data and fix missing values

---

### Model Predicts All No-Shows

**Cause**: Severe class imbalance (>60% no-shows)

**Solution**:
- Use class weights in XGBoost: `scale_pos_weight`
- Apply SMOTE oversampling
- Collect more "completed" reservations
- Investigate why no-show rate is so high

---

### Predictions Don't Match Intuition

**Example**: Repeat customer with perfect record gets high no-show risk

**Cause**: Feature engineering bug or model overfitting

**Solution**:
- Check feature extraction logic
- Validate customer history lookup
- Use SHAP values to explain predictions
- Review feature importance

---

## Additional Resources

**Research Papers**:
- XGBoost: A Scalable Tree Boosting System (Chen & Guestrin, 2016)
- Restaurant No-Show Prediction with Machine Learning (2024 research)

**Documentation**:
- XGBoost: https://xgboost.readthedocs.io/
- Vertex AI: https://cloud.google.com/vertex-ai/docs
- SHAP: https://shap.readthedocs.io/

---

**Last Updated**: 2025-10-26
**Version**: 1.0
**Author**: Restaurant AI MCP Team

🤖 Generated by Claude Code
