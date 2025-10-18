module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  return res.status(200).json({
    RESERVATIONS_TABLE_ID: process.env.RESERVATIONS_TABLE_ID,
    RESTAURANT_INFO_TABLE_ID: process.env.RESTAURANT_INFO_TABLE_ID,
    TABLES_TABLE_ID: process.env.TABLES_TABLE_ID,
    SERVICE_RECORDS_TABLE_ID: process.env.SERVICE_RECORDS_TABLE_ID,
    MENU_ITEMS_TABLE_ID: process.env.MENU_ITEMS_TABLE_ID,
    AIRTABLE_BASE_ID: process.env.AIRTABLE_BASE_ID
  });
};
