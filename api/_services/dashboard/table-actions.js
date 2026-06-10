const {
  updateTable,
} = require('../../_lib/supabase');

async function handleMarkTableClean(req, res) {
  const restaurantId = req.user.restaurant_id;
  const { table_id } = req.body;

  if (!table_id) {
    return res.status(400).json({
      success: false,
      error: 'Table ID is required'
    });
  }

  const updateResult = await updateTable(restaurantId, table_id, {
    status: 'available'
  });

  if (!updateResult.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to mark table as clean'
    });
  }

  return res.status(200).json({
    success: true,
    message: `Table ${updateResult.data.table_number} is now available`
  });
}

async function handleUpdateTableStatus(req, res) {
  const restaurantId = req.user.restaurant_id;
  const { table_id, status } = req.body;

  if (!table_id || !status) {
    return res.status(400).json({
      success: false,
      error: 'Table ID and status are required'
    });
  }

  // Validate status (case-insensitive) and map to database enum values
  const statusMap = {
    'available': 'available',
    'occupied': 'occupied',
    'reserved': 'reserved',
    'being cleaned': 'being_cleaned',  // Frontend uses space, DB uses underscore
    'being_cleaned': 'being_cleaned',
    'out_of_service': 'out_of_service'
  };
  const normalizedStatus = status.toLowerCase();
  const dbStatus = statusMap[normalizedStatus];

  if (!dbStatus) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Must be one of: ${Object.keys(statusMap).join(', ')}`
    });
  }

  const updateResult = await updateTable(restaurantId, table_id, {
    status: dbStatus
  });

  if (!updateResult.success) {
    return res.status(500).json({
      success: false,
      error: 'Failed to update table status'
    });
  }

  return res.status(200).json({
    success: true,
    message: `Table ${updateResult.data.table_number} status updated to ${normalizedStatus}`,
    table: {
      id: table_id,
      table_number: updateResult.data.table_number,
      status: normalizedStatus
    }
  });
}

module.exports = {
  handleMarkTableClean,
  handleUpdateTableStatus
};
