#!/usr/bin/env python3
"""
Check ALL current service records
"""
import os
import requests
from datetime import datetime, timezone
import json

AIRTABLE_API_KEY = os.getenv('AIRTABLE_API_KEY')
BASE_ID = 'appm7zo5vOf3c3rqm'
SERVICE_RECORDS_TABLE_ID = 'tblEEHaoicXQA7NcL'

url = f'https://api.airtable.com/v0/{BASE_ID}/{SERVICE_RECORDS_TABLE_ID}'
headers = {'Authorization': f'Bearer {AIRTABLE_API_KEY}'}

response = requests.get(url, headers=headers)
data = response.json()

records = data.get('records', [])
now = datetime.now(timezone.utc)

print(f"Total service records in Airtable: {len(records)}\n")

if records:
    print("All service records:")
    for r in records:
        print(f"\n{'='*60}")
        print(f"Record ID: {r['id']}")
        print(f"Service ID: {r['fields'].get('Service ID', 'N/A')}")
        print(f"Customer: {r['fields'].get('Customer Name', 'N/A')}")
        print(f"Status: {r['fields'].get('Status', 'N/A')}")
        print(f"Seated At: {r['fields'].get('Seated At', 'N/A')}")
        print(f"Departed At: {r['fields'].get('Departed At', 'N/A')}")

        seated_at = r['fields'].get('Seated At', '')
        if seated_at:
            try:
                seated_time = datetime.fromisoformat(seated_at.replace('Z', '+00:00'))
                hours_ago = (now - seated_time).total_seconds() / 3600
                print(f"Age: {round(hours_ago, 1)} hours ago")
            except:
                pass

        # Check if this should be deleted
        is_test_customer = 'Test' in r['fields'].get('Customer Name', '')
        is_old = False
        if seated_at:
            try:
                seated_time = datetime.fromisoformat(seated_at.replace('Z', '+00:00'))
                hours_ago = (now - seated_time).total_seconds() / 3600
                is_old = hours_ago > 12
            except:
                pass

        if is_test_customer or is_old:
            print("🔴 SHOULD BE DELETED: " + ("Test customer" if is_test_customer else "") + (" Old record" if is_old else ""))
else:
    print("No service records in Airtable!")
    print("\nBut the dashboard API shows 1 active party...")
    print("This might be a caching issue or the data is coming from elsewhere.")
