import re

with open('predict.py', 'r') as f:
    content = f.read()

# Find the extract_features function and replace it completely
start_pattern = r'def extract_features\(reservation_data\):'
end_pattern = r'return np\.array\(features, dtype=np\.float32\)\.reshape\(1, -1\)'

# Find start and end positions
start_match = re.search(start_pattern, content)
end_match = re.search(end_pattern, content)

if start_match and end_match:
    # Replace the entire function
    new_function = '''def extract_features(reservation_data):
    """Extract 16 features matching model training data"""
    reservation_date = datetime.fromisoformat(reservation_data['reservation_date'].replace('Z', '+00:00'))
    booking_date = datetime.fromisoformat(reservation_data.get('booking_date', datetime.now().isoformat()).replace('Z', '+00:00'))
    
    lead_time_hours = (reservation_date - booking_date).total_seconds() / 3600
    month_num = reservation_date.month
    day_of_week = reservation_date.weekday()
    hour = reservation_date.hour
    is_weekend = 1 if day_of_week >= 4 else 0
    is_prime_time = 1 if 18 <= hour <= 21 else 0
    party_size = reservation_data.get('party_size', 2)
    special_requests = reservation_data.get('special_requests', '')
    has_special_requests = 1 if special_requests else 0
    special_request_count = len(special_requests.split(',')) if special_requests else 0
    
    feature_names = ['booking_lead_time_hours', 'month_num', 'is_weekend', 'is_prime_time',
                     'party_size', 'is_tourist', 'is_travel_agency', 'is_repeat_customer',
                     'customer_no_show_rate', 'has_special_requests', 'special_request_count',
                     'booking_changes_count', 'has_deposit', 'has_waiting_list',
                     'stays_in_weekend_nights', 'stays_in_week_nights']
    
    feature_values = [lead_time_hours, month_num, is_weekend, is_prime_time, party_size,
                      0, 0, 0, 0.37, has_special_requests, special_request_count, 0, 0, 0, 0, 0]
    
    return np.array([feature_values], dtype=np.float32), feature_names'''
    
    content_new = content[:start_match.start()] + new_function + content[end_match.end():]
    
    # Also fix the call site
    content_new = content_new.replace('features = extract_features(body)', 'features, feature_names = extract_features(body)')
    content_new = content_new.replace('model.predict(xgb.DMatrix(features))', 'model.predict(xgb.DMatrix(features, feature_names=feature_names))')
    
    with open('predict.py', 'w') as f:
        f.write(content_new)
    print("Fixed!")
else:
    print("Pattern not found")
