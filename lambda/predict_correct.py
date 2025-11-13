"""AWS Lambda function for restaurant no-show prediction"""
import json, os
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

def extract_features(data):
    res_date = datetime.fromisoformat(data['reservation_date'].replace('Z', '+00:00'))
    book_date = datetime.fromisoformat(data.get('booking_date', datetime.now().isoformat()).replace('Z', '+00:00'))
    
    vals = [
        (res_date - book_date).total_seconds() / 3600, res_date.month,
        1 if res_date.weekday() >= 5 else 0, 1 if 18 <= res_date.hour <= 21 else 0,
        data.get('party_size', 2), 0, 0, 0, 0.37,
        1 if data.get('special_requests') else 0,
        len(data.get('special_requests', '').split(',')) if data.get('special_requests') else 0,
        0, 0, 0, 0, 0
    ]
    names = ['booking_lead_time_hours', 'month_num', 'is_weekend', 'is_prime_time', 'party_size',
             'is_tourist', 'is_travel_agency', 'is_repeat_customer', 'customer_no_show_rate',
             'has_special_requests', 'special_request_count', 'booking_changes_count',
             'has_deposit', 'has_waiting_list', 'stays_in_weekend_nights', 'stays_in_week_nights']
    return xgb.DMatrix(np.array([vals], dtype=np.float32), feature_names=names)

def lambda_handler(event, context):
    try:
        method = event.get('httpMethod') or (event.get('requestContext', {}).get('http', {}).get('method'))
        
        if method == 'GET':
            load_model()
            return {'statusCode': 200, 'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'success': True, 'model_version': 'v2.0', 'status': 'ready', 'roc_auc_score': 0.86})}
        
        body = json.loads(event.get('body', '{}')) if method == 'POST' else event
        if 'reservation_date' not in body or 'party_size' not in body:
            return {'statusCode': 400, 'body': json.dumps({'error': 'Missing fields'})}
        
        prob = float(load_model().predict(extract_features(body))[0])
        risk = round(prob * 100, 2)
        level = 'CRITICAL' if prob >= 0.7 else 'HIGH' if prob >= 0.5 else 'MEDIUM' if prob >= 0.3 else 'LOW'
        
        return {'statusCode': 200, 'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'success': True, 'prediction': {'risk_score': risk, 'risk_level': level, 'probability': prob, 'will_show': prob < 0.5},
                                   'recommendations': ['Call customer 24h before'] if level == 'CRITICAL' else ['Send SMS'] if level == 'HIGH' else ['Send email']})}
    except Exception as e:
        return {'statusCode': 500, 'headers': {'Access-Control-Allow-Origin': '*'}, 'body': json.dumps({'error': str(e)})}
