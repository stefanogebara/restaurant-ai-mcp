import requests
import json

url = "https://api.airtable.com/v0/appm7zo5vOf3c3rqm/tbloL2huXFYQluomn"
headers = {
    "Authorization": "Bearer patAvc1iw5cPE146l.6450b0bd5b8ffa2186708971d294c23f29011e5e849d55124e1a0552753d07bf"
}
params = {
    "filterByFormula": "SEARCH('Test Family Chen', {Customer Name})"
}

response = requests.get(url, headers=headers, params=params)
data = response.json()

records = data.get('records', [])
if records:
    r = records[0]['fields']
    print('=' * 60)
    print('TEST RESERVATION CREATED SUCCESSFULLY')
    print('=' * 60)
    print(f"Customer: {r.get('Customer Name', 'N/A')}")
    print(f"Party Size: {r.get('Party Size', 'N/A')}")
    print(f"Date/Time: {r.get('Date', 'N/A')} at {r.get('Time', 'N/A')}")
    special = r.get('Special Requests', 'N/A')
    print(f"Special Requests: {special[:60]}...")
    print(f"Reservation ID: {r.get('Reservation ID', 'N/A')}")
    print(f"Status: {r.get('Status', 'N/A')}")
    print()
    print('=' * 60)
    print('ML PREDICTIONS')
    print('=' * 60)
    print(f"ML Risk Score: {r.get('ML Risk Score', 'NOT SET')}%")
    print(f"ML Risk Level: {r.get('ML Risk Level', 'NOT SET')}")
    print(f"ML Confidence: {r.get('ML Confidence', 'NOT SET')}%")
    print(f"ML Model Version: {r.get('ML Model Version', 'NOT SET')}")
    print()

    # Calculate expected risk based on features
    print('=' * 60)
    print('RISK ANALYSIS')
    print('=' * 60)
    party_size = r.get('Party Size', 0)
    has_special_requests = 1 if r.get('Special Requests') else 0

    print(f"Party Size: {party_size} (Large parties = higher risk)")
    print(f"Has Special Requests: {'Yes' if has_special_requests else 'No'} (Shows engagement = lower risk)")
    print(f"Is New Customer: Yes (First visit = higher risk)")

    # Expected risk calculation
    base_risk = 37.0  # Base rate from hotel data
    if has_special_requests:
        base_risk *= 0.7  # -30% for engagement
    if party_size >= 6:
        base_risk *= 1.1  # +10% for large party

    print(f"\nExpected Risk Range: {base_risk:.1f}% - {base_risk*1.2:.1f}%")

else:
    print('ERROR: NO RESERVATION FOUND')
    print('Response:', json.dumps(data, indent=2))
