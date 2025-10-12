# Airtable Table IDs

Quick reference for environment variables:

```env
# Existing tables
RESERVATIONS_TABLE_ID=tbloL2huXFYQluomn
RESTAURANT_INFO_TABLE_ID=tblI0DfPZrZbLC8fz
MENU_ITEMS_TABLE_ID=tblEcqE5b5kSYzlaf

# New tables for table management
TABLES_TABLE_ID=tbl0r7fkhuoasis56
SERVICE_RECORDS_TABLE_ID=tblEEHaoicXQA7NcL
```

## Vercel Environment Variables to Add

Add these two new variables in Vercel dashboard:

1. `TABLES_TABLE_ID` = `tbl0r7fkhuoasis56`
2. `SERVICE_RECORDS_TABLE_ID` = `tblEEHaoicXQA7NcL`

## Table URLs

- **Tables**: https://airtable.com/appm7zo5vOf3c3rqm/tbl0r7fkhuoasis56
- **Service Records**: https://airtable.com/appm7zo5vOf3c3rqm/tblEEHaoicXQA7NcL

## Next Steps

1. ✅ Add environment variables to Vercel
2. ⏳ Configure table fields according to AIRTABLE-SETUP-GUIDE.md
3. ⏳ Add sample data for testing
4. ⏳ Test API endpoints
