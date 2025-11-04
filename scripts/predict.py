"""
XGBoost Model Prediction Script
Loads trained model and provides real-time predictions for restaurant no-show risk
Reads features from stdin, outputs prediction to stdout as JSON
"""

import sys
import json
import xgboost as xgb
import numpy as np
from pathlib import Path

# Model path
MODEL_PATH = Path(__file__).parent.parent / 'ml_models' / 'restaurant_noshow_xgboost.json'

# Feature names in exact order expected by model
FEATURE_NAMES = [
    'booking_lead_time_hours',
    'month_num',
    'is_weekend',
    'is_prime_time',
    'party_size',
    'is_tourist',
    'is_travel_agency',
    'is_repeat_customer',
    'customer_no_show_rate',
    'has_special_requests',
    'special_request_count',
    'booking_changes_count',
    'has_deposit',
    'has_waiting_list',
    'stays_in_weekend_nights',
    'stays_in_week_nights'
]

def load_model():
    """Load trained XGBoost model"""
    try:
        model = xgb.XGBClassifier()
        model.load_model(str(MODEL_PATH))
        return model
    except Exception as e:
        raise RuntimeError(f"Failed to load model: {e}")

def prepare_features(feature_dict):
    """Convert feature dictionary to numpy array in correct order"""
    try:
        features = []
        for feature_name in FEATURE_NAMES:
            if feature_name not in feature_dict:
                raise ValueError(f"Missing required feature: {feature_name}")
            features.append(float(feature_dict[feature_name]))

        return np.array([features])
    except Exception as e:
        raise ValueError(f"Feature preparation failed: {e}")

def get_feature_contributions(model, features):
    """Get SHAP-style feature contributions for explainability"""
    try:
        # Get feature importance from model
        importance = model.feature_importances_

        # Create feature contributions dict
        contributions = {}
        for idx, feature_name in enumerate(FEATURE_NAMES):
            contributions[feature_name] = {
                'value': float(features[0][idx]),
                'importance': float(importance[idx])
            }

        # Sort by importance
        sorted_contributions = dict(
            sorted(contributions.items(), key=lambda x: x[1]['importance'], reverse=True)
        )

        return sorted_contributions
    except Exception as e:
        return None

def predict(model, features):
    """Generate prediction with probability"""
    try:
        # Get probability of no-show (class 1)
        probability = model.predict_proba(features)[0, 1]

        # Get binary prediction
        prediction = model.predict(features)[0]

        # Get feature contributions
        contributions = get_feature_contributions(model, features)

        return {
            'no_show_probability': float(probability),
            'show_probability': float(1 - probability),
            'predicted_class': int(prediction),
            'predicted_label': 'no-show' if prediction == 1 else 'show-up',
            'feature_contributions': contributions
        }
    except Exception as e:
        raise RuntimeError(f"Prediction failed: {e}")

def main():
    """Main prediction pipeline"""
    try:
        # Read features from stdin
        input_data = sys.stdin.read()
        feature_dict = json.loads(input_data)

        # Load model
        model = load_model()

        # Prepare features
        features = prepare_features(feature_dict)

        # Generate prediction
        result = predict(model, features)

        # Output result as JSON
        print(json.dumps(result))
        sys.exit(0)

    except Exception as e:
        error_result = {
            'error': str(e),
            'type': type(e).__name__
        }
        print(json.dumps(error_result), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
