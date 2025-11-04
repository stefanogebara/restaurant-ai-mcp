"""
ML Model Training Script - Restaurant No-Show Prediction
Using Hotel Booking Demand dataset (119K records) as training data
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, roc_auc_score, confusion_matrix
import xgboost as xgb
import joblib
import json
from datetime import datetime

print("=" * 80)
print("RESTAURANT NO-SHOW PREDICTION MODEL TRAINING")
print("Dataset: Hotel Booking Demand (119,390 records)")
print("Model: XGBoost Classifier")
print("=" * 80)

# Load dataset
print("\n[1/8] Loading hotel booking dataset...")
df = pd.read_csv('hotel_bookings.csv')
print(f"[OK] Loaded {len(df):,} records with {len(df.columns)} features")

# Feature engineering - Map hotel features to restaurant context
print("\n[2/8] Engineering features for restaurant context...")

# Target variable: is_canceled → no_show (1=no_show, 0=showed_up)
df['no_show'] = df['is_canceled']

# Party size calculation
df['party_size'] = df['adults'] + df['children'].fillna(0) + df['babies'].fillna(0)
df['party_size'] = df['party_size'].clip(1, 10)  # Limit to reasonable range

# Lead time in hours (convert days to hours)
df['booking_lead_time_hours'] = df['lead_time'] * 24

# Customer type mapping
# Transient/Transient-Party → Tourist (temporary visitors)
# Contract/Group → Local (long-term contracts, corporate)
df['is_tourist'] = df['customer_type'].isin(['Transient', 'Transient-Party']).astype(int)

# Market segment indicates tourism
df['is_travel_agency'] = df['market_segment'].isin(['Online TA', 'Offline TA/TO']).astype(int)

# Repeated guest (customer history)
df['is_repeat_customer'] = df['is_repeated_guest']

# Calculate customer no-show rate from history
df['customer_no_show_rate'] = df['previous_cancellations'] / (
    df['previous_cancellations'] + df['previous_bookings_not_canceled'] + 1
)

# Weekend booking (higher risk)
df['is_weekend'] = (df['stays_in_weekend_nights'] > 0).astype(int)

# Special requests (reduces risk)
df['has_special_requests'] = (df['total_of_special_requests'] > 0).astype(int)
df['special_request_count'] = df['total_of_special_requests']

# Booking changes (indicates uncertainty)
df['booking_changes_count'] = df['booking_changes']

# Deposit type (commitment level)
df['has_deposit'] = (df['deposit_type'] != 'No Deposit').astype(int)

# Day of week from arrival date
month_to_num = {'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6,
                'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12}
df['month_num'] = df['arrival_date_month'].map(month_to_num)

# Prime time booking (dinner hours equivalent - weekday arrivals)
df['is_prime_time'] = ((df['arrival_date_day_of_month'] % 7).between(1, 5)).astype(int)

# Days in waiting list (urgency)
df['has_waiting_list'] = (df['days_in_waiting_list'] > 0).astype(int)

# Select features for model
feature_cols = [
    # Time features
    'booking_lead_time_hours',
    'month_num',
    'is_weekend',
    'is_prime_time',

    # Customer features
    'party_size',
    'is_tourist',
    'is_travel_agency',
    'is_repeat_customer',
    'customer_no_show_rate',

    # Booking features
    'has_special_requests',
    'special_request_count',
    'booking_changes_count',
    'has_deposit',
    'has_waiting_list',

    # Stay features
    'stays_in_weekend_nights',
    'stays_in_week_nights',
]

# Remove rows with missing values in features
print(f"[OK] Engineered {len(feature_cols)} features")
df_clean = df[feature_cols + ['no_show']].dropna()
print(f"[OK] Clean dataset: {len(df_clean):,} records ({len(df_clean)/len(df)*100:.1f}% retained)")

# Split data
print("\n[3/8] Splitting data (80% train, 20% test)...")
X = df_clean[feature_cols]
y = df_clean['no_show']

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)
print(f"[OK] Train: {len(X_train):,} | Test: {len(X_test):,}")
print(f"[OK] Train no-show rate: {y_train.mean()*100:.1f}% | Test: {y_test.mean()*100:.1f}%")

# Train XGBoost model
print("\n[4/8] Training XGBoost model...")
model = xgb.XGBClassifier(
    n_estimators=200,
    max_depth=6,
    learning_rate=0.1,
    subsample=0.8,
    colsample_bytree=0.8,
    random_state=42,
    eval_metric='logloss',
    use_label_encoder=False
)

model.fit(
    X_train, y_train,
    eval_set=[(X_test, y_test)],
    verbose=False
)
print("[OK] Model trained successfully")

# Evaluate model
print("\n[5/8] Evaluating model performance...")
y_pred = model.predict(X_test)
y_pred_proba = model.predict_proba(X_test)[:, 1]

# Classification metrics
print("\nClassification Report:")
print(classification_report(y_test, y_pred, target_names=['Showed Up', 'No-Show']))

# ROC AUC
roc_auc = roc_auc_score(y_test, y_pred_proba)
print(f"\nROC AUC Score: {roc_auc:.4f}")

# Confusion matrix
cm = confusion_matrix(y_test, y_pred)
print("\nConfusion Matrix:")
print(f"True Negatives (Correctly predicted show-ups): {cm[0][0]:,}")
print(f"False Positives (False alarms): {cm[0][1]:,}")
print(f"False Negatives (Missed no-shows): {cm[1][0]:,}")
print(f"True Positives (Correctly predicted no-shows): {cm[1][1]:,}")

# Feature importance
print("\n[6/8] Analyzing feature importance...")
feature_importance = pd.DataFrame({
    'feature': feature_cols,
    'importance': model.feature_importances_
}).sort_values('importance', ascending=False)

print("\nTop 10 Most Important Features:")
for idx, row in feature_importance.head(10).iterrows():
    print(f"  {row['feature']:30s} {row['importance']:.4f}")

# Save model
print("\n[7/8] Saving trained model...")
model_path = 'ml_models/restaurant_noshow_xgboost.json'
import os
os.makedirs('ml_models', exist_ok=True)

# Save as XGBoost JSON format
model.save_model(model_path)
print(f"[OK] Model saved to: {model_path}")

# Save feature importance
feature_importance.to_csv('ml_models/feature_importance.csv', index=False)
print(f"[OK] Feature importance saved to: ml_models/feature_importance.csv")

# Save metadata
metadata = {
    'model_version': 'v2.0-xgboost-hotel-trained',
    'training_date': datetime.now().isoformat(),
    'dataset_size': len(df_clean),
    'train_size': len(X_train),
    'test_size': len(X_test),
    'no_show_rate': float(y.mean()),
    'roc_auc_score': float(roc_auc),
    'features': feature_cols,
    'top_features': feature_importance.head(10)[['feature', 'importance']].to_dict('records')
}

with open('ml_models/model_metadata.json', 'w') as f:
    json.dump(metadata, f, indent=2)
print(f"[OK] Metadata saved to: ml_models/model_metadata.json")

# Generate deployment info
print("\n[8/8] Generating deployment instructions...")
deployment_info = f"""
================================================================
           ML MODEL TRAINING COMPLETE!
================================================================

TRAINING SUMMARY:
  • Dataset: Hotel Booking Demand (119K records)
  • Training samples: {len(X_train):,}
  • Test samples: {len(X_test):,}
  • No-show rate: {y.mean()*100:.1f}%
  • Model: XGBoost Classifier

PERFORMANCE METRICS:
  • ROC AUC Score: {roc_auc:.4f}
  • Accuracy: {(y_pred == y_test).mean()*100:.1f}%
  • Precision (No-Show): {cm[1][1]/(cm[1][1]+cm[0][1])*100:.1f}%
  • Recall (No-Show): {cm[1][1]/(cm[1][1]+cm[1][0])*100:.1f}%

TOP 3 PREDICTIVE FEATURES:
  1. {feature_importance.iloc[0]['feature']}
  2. {feature_importance.iloc[1]['feature']}
  3. {feature_importance.iloc[2]['feature']}

SAVED FILES:
  • ml_models/restaurant_noshow_xgboost.json
  • ml_models/feature_importance.csv
  • ml_models/model_metadata.json

NEXT STEPS:
  1. Create API endpoint to serve predictions
  2. Replace heuristic model with trained XGBoost
  3. A/B test: heuristic vs XGBoost
  4. Monitor real-world performance

================================================================
"""

print(deployment_info)

# Save deployment info
with open('ml_models/TRAINING_REPORT.txt', 'w') as f:
    f.write(deployment_info)

print("[SUCCESS] Training complete! Ready for deployment.")
