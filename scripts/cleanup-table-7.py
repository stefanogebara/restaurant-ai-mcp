#!/usr/bin/env python3
"""
Clean up Table 7 - Remove stale service_id reference
"""
import os
import requests
import json

AIRTABLE_API_KEY = os.getenv('AIRTABLE_API_KEY')
BASE_ID = 'appm7zo5vOf3c3rqm'
TABLES_TABLE_ID = 'tbl0r7fkhuoasis56'

# Step 1: Find Table 7
filter_formula = "{table_number} = '7'"
url = f'https://api.airtable.com/v0/{BASE_ID}/{TABLES_TABLE_ID}?filterByFormula={filter_formula}'
headers = {'Authorization': f'Bearer {AIRTABLE_API_KEY}'}

print("Step 1: Finding Table 7...")
response = requests.get(url, headers=headers)
data = response.json()

if 'error' in data:
    print(f"ERROR: {data['error']}")
    exit(1)

records = data.get('records', [])
print(f"Found {len(records)} record(s)\n")

if not records:
    print("ERROR: Table 7 not found!")
    exit(1)

table_record = records[0]
print(f"Table 7 (Airtable ID: {table_record['id']})")
print(f"Current fields:")
print(json.dumps(table_record['fields'], indent=2))

# Step 2: Check if it needs cleaning
current_service_id = table_record['fields'].get('current_service_id')
status = table_record['fields'].get('status', 'Unknown')

print(f"\nCurrent service_id: {current_service_id}")
print(f"Current status: {status}")

if not current_service_id or current_service_id == '':
    print("\nSUCCESS: Table 7 is already clean! No service_id set.")
    exit(0)

# Step 3: Clean it up
print(f"\nCleaning up Table 7...")
print(f"   - Removing service_id: {current_service_id}")
print(f"   - Setting status to 'Available'")

update_url = f'https://api.airtable.com/v0/{BASE_ID}/{TABLES_TABLE_ID}/{table_record["id"]}'
update_data = {
    'fields': {
        'current_service_id': '',  # Clear the service ID
        'status': 'Available'       # Reset to available
    }
}

update_response = requests.patch(update_url, headers=headers, json=update_data)

if update_response.status_code == 200:
    print("\nSUCCESS! Table 7 has been cleaned up.")
    print(f"Updated fields:")
    print(json.dumps(update_response.json()['fields'], indent=2))
else:
    print(f"\nFAILED to update Table 7")
    print(f"Status: {update_response.status_code}")
    print(f"Response: {update_response.text}")
