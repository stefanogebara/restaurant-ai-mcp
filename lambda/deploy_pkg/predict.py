"""
AWS Lambda function for restaurant no-show prediction using XGBoost
Trained on 119K hotel booking records with 0.8600 ROC AUC
"""
import json
import os
from datetime import datetime
import xgboost as xgb
import numpy as np

MODEL_PATH = '/opt/ml_models/restaurant_noshow_xgboost.json'
FALLBACK_MODEL_PATH = '/var/task/ml_models/restaurant_noshow_xgboost.json'
_model = None

def load_model():
    global _model
    if _model is None:
        model_path = MODEL_PATH if os.path.exists(MODEL_PATH) else FALLBACK_MODEL_PATH
        _model = xgb.Booster()
        _model.load_model(model_path)
    return _model

def extract_features(reservation_data):
    reservation_date = datetime.fromisoformat(reservation_data['reservation_date'].replace('Z', '+00:00'))
    booking_date = datetime.fromisoformat(reservation_data.get('booking_date', datetime.now().isoformat()).replace('Z', '+00:00'))
    
    features = [
        (reservation_date - booking_date).total_seconds() / 3600,
        reservation_date.month,
        1 if reservation_date.weekday() >= 5 else 0,
        1 if 18 <= reservation_date.hour <= 21 else 0,
        reservation_data.get('party_size', 2),
        0, 0, 0, 0.37,
        1 if reservation_data.get('special_requests') else 0,
        len(reservation_data.get('special_requests', '').split(',')) if reservation_data.get('special_requests') else 0,
        0, 0, 0, 0, 0
    ]
    return np.array([features], dtype=np.float32)

def get_risk_level(p):
    if p >= 0.7: return 'CRITICAL'
    elif p >= 0.5: return 'HIGH'
    elif p >= 0.3: return 'MEDIUM'
    return 'LOW'

def get_recommendations(level, p):
    recs = {
        'CRITICAL': ["🔴 URGENT: Call customer 24h before", "Request credit card guarantee", "Consider overbooking"],
        'HIGH': ["⚠️ Send SMS confirmation 24h before", "Request reconfirmation", "Have backup plan"],
        'MEDIUM': ["📧 Send email reminder 24h before", "Enable SMS option"],
        'LOW': ["✅ Standard confirmation", "Send courtesy reminder"]
    }
    return recs.get(level, recs['LOW'])

def lambda_handler(event, context):
    try:
        http_method = event.get('httpMethod') or (event.get('requestContext', {}).get('http', {}).get('method'))
        
        if http_method == 'GET':
            load_model()
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({
                    'success': True,
                    'model_version': 'v2.0-xgboost-hotel-trained',
                    'status': 'ready',
                    'roc_auc_score': 0.86,
                    'message': 'XGBoost model ready'
                })
            }
        
        body = json.loads(event.get('body', '{}')) if http_method == 'POST' else event
        if 'reservation_date' not in body or 'party_size' not in body:
            return {'statusCode': 400, 'headers': {'Access-Control-Allow-Origin': '*'}, 'body': json.dumps({'error': 'Missing required fields'})}
        
        model = load_model()
        features = extract_features(body)
        probability = float(model.predict(xgb.DMatrix(features))[0])
        risk_score = round(probability * 100, 2)
        risk_level = get_risk_level(probability)
        
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({
                'success': True,
                'prediction': {'risk_score': risk_score, 'risk_level': risk_level, 'probability': probability, 'will_show': probability < 0.5},
                'recommendations': get_recommendations(risk_level, probability),
                'model_version': 'v2.0-xgboost-hotel-trained'
            })
        }
    except Exception as e:
        return {'statusCode': 500, 'headers': {'Access-Control-Allow-Origin': '*'}, 'body': json.dumps({'error': str(e)})}
