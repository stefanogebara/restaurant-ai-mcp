#!/usr/bin/env python3
"""
Find old service records older than 12 hours
"""
import os
import sys
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
old_records = []

print(f"Total service records: {len(records)}")

for r in records:
    seated_at = r['fields'].get('Seated At', '')
    customer_name = r['fields'].get('Customer Name', 'N/A')
    status = r['fields'].get('Status', 'N/A')

    if seated_at:
        try:
            # Parse ISO format datetime
            seated_time = datetime.fromisoformat(seated_at.replace('Z', '+00:00'))
            hours_ago = (now - seated_time).total_seconds() / 3600

            if hours_ago > 12:
                old_records.append({
                    'id': r['id'],
                    'name': customer_name,
                    'hours_ago': round(hours_ago, 1),
                    'status': status
                })
        except Exception as e:
            print(f"Error parsing date for {customer_name}: {e}", file=sys.stderr)

print(f"Old records (>12h): {len(old_records)}\n")

if old_records:
    print("Old service records to delete:")
    for rec in old_records:
        print(f"  - ID: {rec['id']}")
        print(f"    Name: {rec['name']}")
        print(f"    Age: {rec['hours_ago']}h ago")
        print(f"    Status: {rec['status']}")
        print()

    # Output JSON for programmatic use
    print("\nJSON output:")
    print(json.dumps([r['id'] for r in old_records], indent=2))
else:
    print("No old service records found!")
