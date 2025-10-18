# Waitlist Table Setup Guide

## Overview
This guide will walk you through setting up the Waitlist table in Airtable to enable the waitlist management feature.

## Step 1: Create the Waitlist Table

1. Go to your Airtable base: https://airtable.com/appm7zo5vOf3c3rqm
2. Click **"Add or import"** → **"Create empty table"**
3. Name it: **"Waitlist"**

## Step 2: Configure Table Fields

Add the following fields to the Waitlist table:

### Required Fields

| Field Name | Field Type | Configuration |
|------------|-----------|---------------|
| **Waitlist ID** | Single line text | Primary field |
| **Customer Name** | Single line text | Required |
| **Customer Phone** | Phone number | Required |
| **Customer Email** | Email | Optional |
| **Party Size** | Number | Integer, Required |
| **Priority** | Number | Integer (1, 2, 3...) |
| **Estimated Wait** | Number | Integer (minutes) |
| **Added At** | Created time | Auto-set on creation |
| **Notified At** | Date | Include time |
| **Status** | Single select | See options below |
| **Special Requests** | Long text | Optional |

### Status Field Options

Configure the **Status** field with these options:

1. **Todo** (Blue) - Maps to "Waiting" in API
2. **In progress** (Yellow) - Maps to "Notified" in API
3. **Done** (Green) - Maps to "Seated" in API
4. **Cancelled** (Red) - Customer cancelled
5. **No Show** (Gray) - Customer didn't show up

> **Note:** The API automatically translates between user-friendly names (Waiting/Notified/Seated) and Airtable's default select options (Todo/In progress/Done).

## Step 3: Get the Table ID

1. Click on the Waitlist table
2. Look at the URL: https://airtable.com/appm7zo5vOf3c3rqm/tbl__________
3. Copy the table ID (starts with tbl)
4. Example: tblXYZ123ABC456DEF

## Step 4: Add to Vercel Environment Variables

1. Go to Vercel: https://vercel.com/stefanogebaras-projects/restaurant-ai-mcp/settings/environment-variables
2. Add new variable:
   - **Name**: WAITLIST_TABLE_ID
   - **Value**: tbl__________ (your table ID from step 3)
   - **Environments**: Production, Preview, Development
3. **Redeploy** after adding the variable

