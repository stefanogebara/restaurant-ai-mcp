#!/usr/bin/env python3
"""
Find and delete old active service record with Service ID: SVC-20251025-5888
"""
import os
import requests
from datetime import datetime, timezone
import json

AIRTABLE_API_KEY = os.getenv('AIRTABLE_API_KEY')
BASE_ID = 'appm7zo5vOf3c3rqm'
SERVICE_RECORDS_TABLE_ID = 'tblEEHaoicXQA7NcL'

# Step 1: Find the record with filter
filter_formula = "{Status} = 'Active'"
url = f'https://api.airtable.com/v0/{BASE_ID}/{SERVICE_RECORDS_TABLE_ID}?filterByFormula={filter_formula}'
headers = {'Authorization': f'Bearer {AIRTABLE_API_KEY}'}

print("Step 1: Finding active service records...")
response = requests.get(url, headers=headers)
data = response.json()

records = data.get('records', [])
print(f"Found {len(records)} active service records\n")

# Step 2: Identify old test records
now = datetime.now(timezone.utc)
records_to_delete = []

for r in records:
    service_id = r['fields'].get('Service ID', 'N/A')
    customer_name = r['fields'].get('Customer Name', 'N/A')
    seated_at = r['fields'].get('Seated At', '')
    status = r['fields'].get('Status', 'N/A')

    print(f"\nRecord ID: {r['id']}")
    print(f"Service ID: {service_id}")
    print(f"Customer: {customer_name}")
    print(f"Status: {status}")
    print(f"Seated At: {seated_at}")

    # Calculate age
    hours_ago = 0
    if seated_at:
        try:
            seated_time = datetime.fromisoformat(seated_at.replace('Z', '+00:00'))
            hours_ago = (now - seated_time).total_seconds() / 3600
            print(f"Age: {round(hours_ago, 1)} hours ago")
        except:
            pass

    # Determine if should delete (test customer OR old)
    should_delete = False
    reason = []

    if 'Test' in customer_name:
        should_delete = True
        reason.append("Test customer")

    if hours_ago > 12:
        should_delete = True
        reason.append(f"Old record ({round(hours_ago, 1)}h)")

    if should_delete:
        print(f"🔴 SHOULD DELETE: {', '.join(reason)}")
        records_to_delete.append({
            'airtable_id': r['id'],
            'service_id': service_id,
            'customer_name': customer_name,
            'reason': ', '.join(reason)
        })
    else:
        print("✅ Keep this record")

# Step 3: Confirm and delete
if records_to_delete:
    print(f"\n{'='*60}")
    print(f"Found {len(records_to_delete)} record(s) to delete:")
    for rec in records_to_delete:
        print(f"  - {rec['service_id']} ({rec['customer_name']}): {rec['reason']}")

    print(f"\n{'='*60}")
    print("Proceeding with deletion...")

    for rec in records_to_delete:
        delete_url = f'https://api.airtable.com/v0/{BASE_ID}/{SERVICE_RECORDS_TABLE_ID}/{rec["airtable_id"]}'
        delete_response = requests.delete(delete_url, headers=headers)

        if delete_response.status_code == 200:
            print(f"✅ Deleted: {rec['service_id']} ({rec['customer_name']})")
        else:
            print(f"❌ Failed to delete {rec['service_id']}: {delete_response.text}")

    print(f"\n{'='*60}")
    print("Cleanup complete!")
else:
    print("\n✅ No old/test records found to delete!")
