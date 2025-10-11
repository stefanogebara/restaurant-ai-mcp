const { getReservations, getRestaurantInfo } = require('./_lib/airtable');

module.exports = async (req, res) => {
  try {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Get restaurant info
    const restaurantResult = await getRestaurantInfo();

    return res.status(200).json({
      success: true,
      test: "get-wait-time logic test",
      restaurantResult: restaurantResult
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: true,
      message: error.message,
      stack: error.stack
    });
  }
};
