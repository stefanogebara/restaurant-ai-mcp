const airtable = require('../services/airtable');

/**
 * Waitlist Management API
 *
 * Endpoints:
 * - GET /api/waitlist - Get all waitlist entries (optionally filtered by status)
 * - POST /api/waitlist - Add new customer to waitlist
 * - PATCH /api/waitlist/:id - Update waitlist entry (status, estimated wait, etc.)
 * - DELETE /api/waitlist/:id - Remove from waitlist
 */

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const method = req.method;
  const { id } = req.query;

  try {
    switch (method) {
      case 'GET':
        return await handleGetWaitlist(req, res);
      case 'POST':
        return await handleAddToWaitlist(req, res);
      case 'PATCH':
        if (!id) {
          return res.status(400).json({ error: 'Waitlist ID required for update' });
        }
        return await handleUpdateWaitlist(req, res, id);
      case 'DELETE':
        if (!id) {
          return res.status(400).json({ error: 'Waitlist ID required for deletion' });
        }
        return await handleRemoveFromWaitlist(req, res, id);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Waitlist API error:', error);
    return res.status(500).json({
      error: error.message,
      details: error.toString()
    });
  }
};

/**
 * GET /api/waitlist
 * Get all waitlist entries, optionally filtered by status
 *
 * Query params:
 * - status: Filter by status (Waiting, Notified, Seated, Cancelled, No Show)
 * - active: Boolean - if true, only return Waiting and Notified entries
 */
async function handleGetWaitlist(req, res) {
  const { status, active } = req.query;

  const tableId = process.env.WAITLIST_TABLE_ID;
  if (!tableId) {
    return res.status(500).json({ error: 'WAITLIST_TABLE_ID not configured' });
  }

  try {
    // Build filter formula for Airtable
    let filterFormula = '';
    if (active === 'true') {
      filterFormula = "OR({Status}='Waiting', {Status}='Notified')";
    } else if (status) {
      filterFormula = `{Status}='${status}'`;
    }

    const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${tableId}`;
    const params = new URLSearchParams({
      sort: JSON.stringify([
        { field: 'Priority', direction: 'asc' },
        { field: 'Added At', direction: 'asc' }
      ])
    });

    if (filterFormula) {
      params.append('filterByFormula', filterFormula);
    }

    const response = await fetch(`${url}?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Transform Airtable records to our format
    const waitlist = data.records.map(record => ({
      id: record.id,
      waitlist_id: record.fields['Waitlist ID'],
      customer_name: record.fields['Customer Name'],
      customer_phone: record.fields['Customer Phone'],
      customer_email: record.fields['Customer Email'],
      party_size: record.fields['Party Size'],
      added_at: record.fields['Added At'],
      estimated_wait: record.fields['Estimated Wait'],
      status: record.fields['Status'] || 'Waiting',
      priority: record.fields['Priority'],
      special_requests: record.fields['Special Requests'],
      notified_at: record.fields['Notified At'],
    }));

    return res.status(200).json({
      success: true,
      count: waitlist.length,
      waitlist,
    });

  } catch (error) {
    console.error('Get waitlist error:', error);
    return res.status(500).json({
      error: 'Failed to retrieve waitlist',
      details: error.message
    });
  }
}

/**
 * POST /api/waitlist
 * Add new customer to waitlist
 *
 * Body:
 * - customer_name: string (required)
 * - customer_phone: string (required)
 * - customer_email: string (optional)
 * - party_size: number (required, 1-20)
 * - special_requests: string (optional)
 * - estimated_wait: number (optional, in minutes)
 */
async function handleAddToWaitlist(req, res) {
  const {
    customer_name,
    customer_phone,
    customer_email,
    party_size,
    special_requests,
    estimated_wait
  } = req.body;

  // Validation
  if (!customer_name || !customer_phone || !party_size) {
    return res.status(400).json({
      error: 'Missing required fields: customer_name, customer_phone, party_size'
    });
  }

  if (party_size < 1 || party_size > 20) {
    return res.status(400).json({
      error: 'Party size must be between 1 and 20'
    });
  }

  const tableId = process.env.WAITLIST_TABLE_ID;
  if (!tableId) {
    return res.status(500).json({ error: 'WAITLIST_TABLE_ID not configured' });
  }

  try {
    // Get current waitlist to calculate next priority
    const currentWaitlist = await getCurrentWaitlist();
    const nextPriority = currentWaitlist.length + 1;

    // Generate unique waitlist ID
    const timestamp = Date.now();
    const waitlist_id = `WAIT-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${timestamp}`;

    // Calculate estimated wait if not provided
    let calculatedWait = estimated_wait;
    if (!calculatedWait) {
      calculatedWait = await calculateEstimatedWait(party_size, currentWaitlist.length);
    }

    // Create Airtable record
    const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${tableId}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: {
          'Waitlist ID': waitlist_id,
          'Customer Name': customer_name,
          'Customer Phone': customer_phone,
          'Customer Email': customer_email || '',
          'Party Size': party_size,
          'Estimated Wait': calculatedWait,
          'Status': 'Waiting',
          'Priority': nextPriority,
          'Special Requests': special_requests || '',
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    return res.status(201).json({
      success: true,
      message: 'Customer added to waitlist',
      waitlist_entry: {
        id: data.id,
        waitlist_id,
        customer_name,
        customer_phone,
        customer_email,
        party_size,
        estimated_wait: calculatedWait,
        status: 'Waiting',
        priority: nextPriority,
        special_requests,
        added_at: data.fields['Added At'],
      },
    });

  } catch (error) {
    console.error('Add to waitlist error:', error);
    return res.status(500).json({
      error: 'Failed to add to waitlist',
      details: error.message
    });
  }
}

/**
 * PATCH /api/waitlist/:id
 * Update waitlist entry
 *
 * Body (all optional):
 * - status: string (Waiting, Notified, Seated, Cancelled, No Show)
 * - estimated_wait: number (minutes)
 * - special_requests: string
 * - priority: number (for manual queue reordering)
 */
async function handleUpdateWaitlist(req, res, recordId) {
  const { status, estimated_wait, special_requests, priority } = req.body;

  if (!status && !estimated_wait && !special_requests && !priority) {
    return res.status(400).json({
      error: 'At least one field must be provided for update'
    });
  }

  const tableId = process.env.WAITLIST_TABLE_ID;
  if (!tableId) {
    return res.status(500).json({ error: 'WAITLIST_TABLE_ID not configured' });
  }

  try {
    const fields = {};

    if (status) {
      const validStatuses = ['Waiting', 'Notified', 'Seated', 'Cancelled', 'No Show'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }
      fields['Status'] = status;

      // If status is Notified, record the notification time
      if (status === 'Notified') {
        fields['Notified At'] = new Date().toISOString();
      }
    }

    if (estimated_wait !== undefined) {
      fields['Estimated Wait'] = estimated_wait;
    }

    if (special_requests !== undefined) {
      fields['Special Requests'] = special_requests;
    }

    if (priority !== undefined) {
      fields['Priority'] = priority;
    }

    const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${tableId}/${recordId}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    return res.status(200).json({
      success: true,
      message: 'Waitlist entry updated',
      waitlist_entry: {
        id: data.id,
        waitlist_id: data.fields['Waitlist ID'],
        customer_name: data.fields['Customer Name'],
        customer_phone: data.fields['Customer Phone'],
        customer_email: data.fields['Customer Email'],
        party_size: data.fields['Party Size'],
        estimated_wait: data.fields['Estimated Wait'],
        status: data.fields['Status'],
        priority: data.fields['Priority'],
        special_requests: data.fields['Special Requests'],
        added_at: data.fields['Added At'],
        notified_at: data.fields['Notified At'],
      },
    });

  } catch (error) {
    console.error('Update waitlist error:', error);
    return res.status(500).json({
      error: 'Failed to update waitlist entry',
      details: error.message
    });
  }
}

/**
 * DELETE /api/waitlist/:id
 * Remove customer from waitlist
 */
async function handleRemoveFromWaitlist(req, res, recordId) {
  const tableId = process.env.WAITLIST_TABLE_ID;
  if (!tableId) {
    return res.status(500).json({ error: 'WAITLIST_TABLE_ID not configured' });
  }

  try {
    const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${tableId}/${recordId}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Airtable API error: ${response.status} - ${errorText}`);
    }

    return res.status(200).json({
      success: true,
      message: 'Customer removed from waitlist',
      deleted_id: recordId,
    });

  } catch (error) {
    console.error('Remove from waitlist error:', error);
    return res.status(500).json({
      error: 'Failed to remove from waitlist',
      details: error.message
    });
  }
}

/**
 * Helper: Get current active waitlist
 */
async function getCurrentWaitlist() {
  const tableId = process.env.WAITLIST_TABLE_ID;
  const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${tableId}`;

  const params = new URLSearchParams({
    filterByFormula: "OR({Status}='Waiting', {Status}='Notified')",
  });

  const response = await fetch(`${url}?${params.toString()}`, {
    headers: {
      'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  return data.records || [];
}

/**
 * Helper: Calculate estimated wait time
 *
 * Algorithm:
 * - Base wait: 15 minutes per party ahead in queue
 * - Adjust for party size matching (larger parties wait longer)
 * - Round to nearest 5 minutes
 */
async function calculateEstimatedWait(partySize, queuePosition) {
  const baseWaitPerParty = 15; // minutes
  let estimatedWait = queuePosition * baseWaitPerParty;

  // Add extra time for larger parties (harder to seat)
  if (partySize >= 6) {
    estimatedWait += 10;
  } else if (partySize >= 4) {
    estimatedWait += 5;
  }

  // Round to nearest 5 minutes
  estimatedWait = Math.ceil(estimatedWait / 5) * 5;

  // Minimum wait time
  if (estimatedWait < 10) {
    estimatedWait = 10;
  }

  return estimatedWait;
}
