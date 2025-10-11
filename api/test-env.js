module.exports = async (req, res) => {
  res.status(200).json({
    hasAirtableApiKey: !!process.env.AIRTABLE_API_KEY,
    hasAirtableBaseId: !!process.env.AIRTABLE_BASE_ID,
    hasReservationsTableId: !!process.env.RESERVATIONS_TABLE_ID,
    hasRestaurantInfoTableId: !!process.env.RESTAURANT_INFO_TABLE_ID,
    reservationsTableIdValue: process.env.RESERVATIONS_TABLE_ID,
    restaurantInfoTableIdValue: process.env.RESTAURANT_INFO_TABLE_ID
  });
};
