"""
Vercel Python Serverless Function - XGBoost ML Predictions
Native Python endpoint for restaurant no-show predictions
"""

from http.server import BaseHTTPRequestHandler
import json
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import xgboost as xgb
import numpy as np
from pathlib import Path

# Model path
MODEL_PATH = Path(__file__).parent.parent / 'ml_models' / 'restaurant_noshow_xgboost.json'

# Feature names in exact order
FEATURE_NAMES = [
    'booking_lead_time_hours', 'month_num', 'is_weekend', 'is_prime_time',
    'party_size', 'is_tourist', 'is_travel_agency', 'is_repeat_customer',
    'customer_no_show_rate', 'has_special_requests', 'special_request_count',
    'booking_changes_count', 'has_deposit', 'has_waiting_list',
    'stays_in_weekend_nights', 'stays_in_week_nights'
]

# Global model cache
_model = None

def load_model():
    """Load XGBoost model (cached)"""
    global _model
    if _model is None:
        _model = xgb.XGBClassifier()
        _model.load_model(str(MODEL_PATH))
    return _model

def extract_features(data):
    """Extract and order features from request data"""
    from datetime import datetime

    # Parse date/time
    res_date = datetime.fromisoformat(data.get('reservation_date', datetime.now().isoformat()).replace('Z', '+00:00'))
    res_time = data.get('reservation_time', '19:00')

    month_num = res_date.month
    is_weekend = 1 if res_date.weekday() >= 4 else 0  # Fri=4, Sat=5
    hour = int(res_time.split(':')[0])
    is_prime_time = 1 if 18 <= hour <= 21 else 0

    # Build feature array
    features = [
        float(data.get('booking_lead_time_hours', 24)),
        int(month_num),
        int(is_weekend),
        int(is_prime_time),
        int(data.get('party_size', 2)),
        int(data.get('is_tourist', 0)),
        int(data.get('is_travel_agency', 0)),
        int(data.get('is_repeat_customer', 0)),
        float(data.get('customer_no_show_rate', 0)),
        int(data.get('has_special_requests', 0)),
        int(data.get('special_request_count', 0)),
        int(data.get('booking_changes_count', 0)),
        int(data.get('has_deposit', 0)),
        0,  # has_waiting_list
        0,  # stays_in_weekend_nights
        0   # stays_in_week_nights
    ]

    return np.array([features])

def get_risk_level(probability):
    """Calculate risk level from probability"""
    if probability >= 0.7: return 'very-high'
    if probability >= 0.5: return 'high'
    if probability >= 0.3: return 'medium'
    return 'low'

def get_recommendations(risk_level):
    """Get recommendations based on risk level"""
    if risk_level == 'very-high':
        return [
            'URGENT: Call customer immediately to confirm',
            'Require credit card deposit or prepayment',
            'Add to priority monitoring list',
            'Have backup waitlist ready'
        ]
    elif risk_level == 'high':
        return [
            'Send confirmation reminder 24 hours before',
            'Require credit card deposit',
            'Call to confirm 2 hours before reservation'
        ]
    elif risk_level == 'medium':
        return [
            'Send automated SMS reminder 24h before',
            'Confirm via email 48 hours before'
        ]
    else:
        return ['Standard confirmation email']

class handler(BaseHTTPRequestHandler):
    """Vercel serverless function handler"""

    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        """Health check endpoint"""
        try:
            model = load_model()

            # Load metadata
            metadata_path = MODEL_PATH.parent / 'model_metadata.json'
            with open(metadata_path) as f:
                metadata = json.load(f)

            response = {
                'success': True,
                'model_version': 'v2.0-xgboost-hotel-trained',
                'status': 'ready',
                'roc_auc_score': metadata.get('roc_auc_score'),
                'training_date': metadata.get('training_date'),
                'dataset_size': metadata.get('dataset_size'),
                'features_count': len(FEATURE_NAMES),
                'endpoint': '/api/ml-predict',
                'methods': ['POST'],
                'description': 'XGBoost no-show prediction model - trained on 119K hotel bookings'
            }

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())

        except Exception as e:
            self.send_response(503)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            error_response = {
                'success': False,
                'status': 'unavailable',
                'error': str(e)
            }
            self.wfile.write(json.dumps(error_response).encode())

    def do_POST(self):
        """ML prediction endpoint"""
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode()
            data = json.loads(body)

            # Load model
            model = load_model()

            # Extract features
            features = extract_features(data)

            # Make prediction
            probability = float(model.predict_proba(features)[0, 1])
            risk_score = probability * 100
            risk_level = get_risk_level(probability)
            recommendations = get_recommendations(risk_level)

            # Load metadata
            metadata_path = MODEL_PATH.parent / 'model_metadata.json'
            with open(metadata_path) as f:
                metadata = json.load(f)

            response = {
                'success': True,
                'model_version': 'v2.0-xgboost-hotel-trained',
                'prediction': {
                    'no_show_probability': round(probability, 4),
                    'risk_score': round(risk_score, 1),
                    'risk_level': risk_level,
                    'show_probability': round(1 - probability, 4)
                },
                'recommendations': recommendations,
                'metadata': {
                    'model_accuracy': metadata.get('roc_auc_score'),
                    'training_date': metadata.get('training_date'),
                    'features_used': len(FEATURE_NAMES)
                }
            }

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(response).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            error_response = {
                'success': False,
                'error': 'Prediction failed',
                'message': str(e),
                'model_version': 'v2.0-xgboost-hotel-trained'
            }
            self.wfile.write(json.dumps(error_response).encode())
