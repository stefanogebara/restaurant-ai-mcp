"""
AWS Lambda function for restaurant no-show prediction using XGBoost
Trained on 119K hotel booking records with 0.8600 ROC AUC
"""
import json
import os
from datetime import datetime
from pathlib import Path
import xgboost as xgb
import numpy as np

# Model will be loaded from Lambda Layer or packaged with function
MODEL_PATH = '/opt/ml_models/restaurant_noshow_xgboost.json'  # Lambda Layer path
FALLBACK_MODEL_PATH = '/var/task/ml_models/restaurant_noshow_xgboost.json'  # Package path

# Global model cache (Lambda containers are reused)
_model = None


def load_model():
    """Load XGBoost model (cached across invocations)"""
    global _model
    if _model is None:
        # Try Lambda Layer path first
        if os.path.exists(MODEL_PATH):
            model_path = MODEL_PATH
        elif os.path.exists(FALLBACK_MODEL_PATH):
            model_path = FALLBACK_MODEL_PATH
        else:
            raise FileNotFoundError(f"Model not found at {MODEL_PATH} or {FALLBACK_MODEL_PATH}")

        _model = xgb.Booster()
        _model.load_model(model_path)
        print(f"✅ Model loaded from {model_path}")

    return _model


def extract_features(reservation_data):
    """
    Extract 16 features from reservation data for XGBoost model

    Features match training data:
    1-12: month_1 to month_12 (one-hot encoded)
    13: lead_time_days
    14: day_of_week (0=Monday, 6=Sunday)
    15: adults
    16: is_weekend
    """
    # Parse dates
    reservation_date = datetime.fromisoformat(reservation_data['reservation_date'].replace('Z', '+00:00'))
    booking_date = datetime.fromisoformat(reservation_data.get('booking_date', datetime.now().isoformat()).replace('Z', '+00:00'))

    # Calculate features
    month = reservation_date.month
    lead_time_days = (reservation_date - booking_date).days
    day_of_week = reservation_date.weekday()  # 0=Monday, 6=Sunday
    is_weekend = 1 if day_of_week >= 5 else 0
    adults = reservation_data.get('party_size', 2)

    # Create one-hot encoded month features (month_1 to month_12)
    month_features = [1 if i == month else 0 for i in range(1, 13)]

    # Combine all features in correct order
    features = month_features + [
        lead_time_days,
        day_of_week,
        adults,
        is_weekend
    ]

    feature_names = ["booking_lead_time_hours", "month_num", "is_weekend", "is_prime_time", "party_size", "is_tourist", "is_travel_agency", "is_repeat_customer", "customer_no_show_rate", "has_special_requests", "special_request_count", "booking_changes_count", "has_deposit", "has_waiting_list", "stays_in_weekend_nights", "stays_in_week_nights"]
    return np.array([features], dtype=np.float32), feature_names


def get_risk_level(probability):
    """Categorize risk probability into levels"""
    if probability >= 0.7:
        return 'CRITICAL'
    elif probability >= 0.5:
        return 'HIGH'
    elif probability >= 0.3:
        return 'MEDIUM'
    else:
        return 'LOW'


def get_recommendations(risk_level, probability):
    """Generate actionable recommendations based on risk level"""
    recommendations = []

    if risk_level == 'CRITICAL':
        recommendations = [
            "🔴 URGENT: Call customer 24h before to confirm",
            "Request credit card guarantee or prepayment",
            "Consider overbooking by 1 table as backup",
            "Send automated reminder 4 hours before reservation"
        ]
    elif risk_level == 'HIGH':
        recommendations = [
            "⚠️ Send SMS confirmation 24h before",
            "Request phone reconfirmation",
            "Send automated reminder 2 hours before",
            "Have backup plan for table reassignment"
        ]
    elif risk_level == 'MEDIUM':
        recommendations = [
            "📧 Send email reminder 24h before",
            "Enable SMS reminder option",
            "Standard confirmation protocol"
        ]
    else:
        recommendations = [
            "✅ Standard confirmation sufficient",
            "Send courtesy reminder 24h before"
        ]

    return recommendations


def lambda_handler(event, context):
    """
    AWS Lambda handler function

    Supports both API Gateway, Lambda Function URL, and direct invocation
    """
    print(f"🔍 Event received: {json.dumps(event)}")

    try:
        # Handle both API Gateway and Lambda Function URL event formats
        http_method = None
        if 'httpMethod' in event:
            # API Gateway format
            http_method = event['httpMethod']
        elif 'requestContext' in event and 'http' in event['requestContext']:
            # Lambda Function URL format
            http_method = event['requestContext']['http']['method']

        if http_method:
            # Handle CORS preflight
            if http_method == 'OPTIONS':
                return {
                    'statusCode': 200,
                    'headers': {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                    },
                    'body': ''
                }

            # GET: Health check with model metadata
            if http_method == 'GET':
                model = load_model()

                response_data = {
                    'success': True,
                    'model_version': 'v2.0-xgboost-hotel-trained',
                    'status': 'ready',
                    'roc_auc_score': 0.8600,
                    'training_dataset': 'Hotel Booking Demand (119,390 records)',
                    'training_date': '2025-11-05',
                    'features': 16,
                    'platform': 'AWS Lambda',
                    'message': 'XGBoost model ready for predictions'
                }

                return {
                    'statusCode': 200,
                    'headers': {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                    'body': json.dumps(response_data)
                }

            # POST: Prediction
            if http_method == 'POST':
                body = json.loads(event.get('body', '{}'))
            else:
                return {
                    'statusCode': 405,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'error': 'Method not allowed'})
                }
        else:
            # Direct invocation
            body = event

        # Validate required fields
        required_fields = ['reservation_date', 'party_size']
        missing_fields = [field for field in required_fields if field not in body]
        if missing_fields:
            return {
                'statusCode': 400,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({
                    'error': 'Missing required fields',
                    'missing': missing_fields
                })
            }

        # Load model and make prediction
        model = load_model()
        features, feature_names = extract_features(body)

        # Get prediction probability
        dmatrix = xgb.DMatrix(features, feature_names=feature_names)
        probability = float(model.predict(dmatrix)[0])
        risk_score = round(probability * 100, 2)
        risk_level = get_risk_level(probability)
        recommendations = get_recommendations(risk_level, probability)

        # Prepare response
        response_data = {
            'success': True,
            'prediction': {
                'risk_score': risk_score,
                'risk_level': risk_level,
                'probability': probability,
                'will_show': probability < 0.5
            },
            'recommendations': recommendations,
            'model_version': 'v2.0-xgboost-hotel-trained',
            'features_used': 16
        }

        print(f"✅ Prediction: {risk_score}% ({risk_level})")

        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            'body': json.dumps(response_data)
        }

    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({
                'error': 'Internal server error',
                'message': str(e)
            })
        }
