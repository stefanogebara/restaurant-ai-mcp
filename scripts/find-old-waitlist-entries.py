#!/usr/bin/env python3
"""
Find old waitlist entries older than 24 hours
"""
import os
import sys
import requests
from datetime import datetime, timezone
import json

AIRTABLE_API_KEY = os.getenv('AIRTABLE_API_KEY')
BASE_ID = 'appm7zo5vOf3c3rqm'
WAITLIST_TABLE_ID = 'tblkpCGy1z2YbJbOa'

url = f'https://api.airtable.com/v0/{BASE_ID}/{WAITLIST_TABLE_ID}'
headers = {'Authorization': f'Bearer {AIRTABLE_API_KEY}'}

response = requests.get(url, headers=headers)
data = response.json()

records = data.get('records', [])
now = datetime.now(timezone.utc)
old_records = []

print(f"Total waitlist entries: {len(records)}")

for r in records:
    added_at = r['fields'].get('Added At', '')
    customer_name = r['fields'].get('Customer Name', 'N/A')
    status = r['fields'].get('Status', 'N/A')
    party_size = r['fields'].get('Party Size', 'N/A')

    if added_at:
        try:
            # Parse ISO format datetime
            added_time = datetime.fromisoformat(added_at.replace('Z', '+00:00'))
            hours_ago = (now - added_time).total_seconds() / 3600

            if hours_ago > 24:
                old_records.append({
                    'id': r['id'],
                    'name': customer_name,
                    'party_size': party_size,
                    'hours_ago': round(hours_ago, 1),
                    'status': status
                })
        except Exception as e:
            print(f"Error parsing date for {customer_name}: {e}", file=sys.stderr)

print(f"Old entries (>24h): {len(old_records)}\n")

if old_records:
    print("Old waitlist entries to delete:")
    for rec in old_records:
        print(f"  - ID: {rec['id']}")
        print(f"    Name: {rec['name']}")
        print(f"    Party: {rec['party_size']}")
        print(f"    Age: {rec['hours_ago']}h ago")
        print(f"    Status: {rec['status']}")
        print()

    # Output JSON for programmatic use
    print("\nJSON output:")
    print(json.dumps([r['id'] for r in old_records], indent=2))
else:
    print("No old waitlist entries found!")
