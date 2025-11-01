const airtable = require('./_lib/supabase');
const twilio = require('twilio'); // Force redeploy to fix Vercel dependency bundling
const { Resend } = require('resend');
const { validateWaitlistEntry, sanitizeInput } = require('./_lib/validation');

/**
 * Waitlist Management API
 *
 * Endpoints:
 * - GET /api/waitlist - Get all waitlist entries (optionally filtered by status)
 * - POST /api/waitlist - Add new customer to waitlist
 * - PATCH /api/waitlist/:id - Update waitlist entry (status, estimated wait, etc.)
 * - DELETE /api/waitlist/:id - Remove from waitlist
 *
 * Status Mapping:
 * Airtable field uses default options (Todo, In progress, Done)
 * API translates to proper waitlist terminology:
 * - Todo → Waiting
 * - In progress → Notified
 * - Done → Seated
 */

// Status mapping helpers
const STATUS_TO_AIRTABLE = {
  'Waiting': 'Todo',
  'Notified': 'In progress',
  'Seated': 'Done',
  'Cancelled': 'Cancelled',
  'No Show': 'No Show'
};

const STATUS_FROM_AIRTABLE = {
  'Todo': 'Waiting',
  'In progress': 'Notified',
  'Done': 'Seated',
  'Cancelled': 'Cancelled',
  'No Show': 'No Show'
};

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
      // Active = Waiting (Todo or empty) or Notified (In progress)
      // Note: Empty status is treated as 'Waiting' (Todo)
      filterFormula = "OR({Status}='Todo', {Status}='In progress', {Status}=BLANK())";
    } else if (status) {
      // Translate API status to Airtable status
      const airtableStatus = STATUS_TO_AIRTABLE[status] || status;
      if (status === 'Waiting') {
        // Waiting matches both 'Todo' and empty status
        filterFormula = "OR({Status}='Todo', {Status}=BLANK())";
      } else {
        filterFormula = `{Status}='${airtableStatus}'`;
      }
    }

    const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${tableId}`;
    const params = new URLSearchParams();

    // Add sort parameters (Airtable format: sort[0][field]=Priority&sort[0][direction]=asc)
    params.append('sort[0][field]', 'Priority');
    params.append('sort[0][direction]', 'asc');

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
    const waitlist = data.records.map(record => {
      const airtableStatus = record.fields['Status'] || 'Todo';
      const apiStatus = STATUS_FROM_AIRTABLE[airtableStatus] || airtableStatus;

      return {
        id: record.id,
        waitlist_id: record.fields['Waitlist ID'],
        customer_name: record.fields['Customer Name'],
        customer_phone: record.fields['Customer Phone'],
        customer_email: record.fields['Customer Email'],
        party_size: record.fields['Party Size'],
        added_at: record.fields['Added At'],
        estimated_wait: record.fields['Estimated Wait'],
        status: apiStatus,
        priority: record.fields['Priority'],
        special_requests: record.fields['Special Requests'],
        notified_at: record.fields['Notified At'],
      };
    });

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

  // Comprehensive validation using centralized utility
  const validation = validateWaitlistEntry({
    customer_name,
    customer_phone,
    customer_email,
    party_size
  });

  if (!validation.valid) {
    return res.status(400).json({
      error: 'Validation failed',
      details: validation.errors
    });
  }

  // Sanitize inputs to prevent injection attacks
  const sanitizedName = sanitizeInput(customer_name);
  const sanitizedPhone = sanitizeInput(customer_phone);
  const sanitizedEmail = customer_email ? sanitizeInput(customer_email) : '';
  const sanitizedRequests = special_requests ? sanitizeInput(special_requests) : '';

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
          'Customer Name': sanitizedName,
          'Customer Phone': sanitizedPhone,
          'Customer Email': sanitizedEmail,
          'Party Size': parseInt(party_size),
          'Estimated Wait': calculatedWait,
          'Status': 'Todo',  // Using existing option name (will need to rename in Airtable UI)
          'Priority': nextPriority,
          'Special Requests': sanitizedRequests,
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
    // If notifying customer, fetch their details first for SMS
    let customerDetails = null;
    if (status === 'Notified') {
      const getUrl = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${tableId}/${recordId}`;
      const getResponse = await fetch(getUrl, {
        headers: {
          'Authorization': `Bearer ${process.env.AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (getResponse.ok) {
        const recordData = await getResponse.json();
        customerDetails = {
          name: recordData.fields['Customer Name'],
          phone: recordData.fields['Customer Phone'],
          partySize: recordData.fields['Party Size'],
          email: recordData.fields['Customer Email'],
        };
      }
    }

    const fields = {};

    if (status) {
      const validStatuses = ['Waiting', 'Notified', 'Seated', 'Cancelled', 'No Show'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
        });
      }

      // Translate API status to Airtable status
      const airtableStatus = STATUS_TO_AIRTABLE[status] || status;
      fields['Status'] = airtableStatus;

      // If status is Notified, record the notification time and send notifications
      if (status === 'Notified') {
        fields['Notified At'] = new Date().toISOString();

        // Send notifications (don't block on failure)
        if (customerDetails) {
          // Prefer email notification (free and unlimited)
          if (customerDetails.email) {
            sendEmailNotification(
              customerDetails.name,
              customerDetails.email,
              customerDetails.partySize
            ).catch(err => console.error('Email notification failed:', err));
          }

          // Also send SMS if phone number provided (costs money with Twilio)
          if (customerDetails.phone) {
            sendSMSNotification(
              customerDetails.name,
              customerDetails.phone,
              customerDetails.partySize
            ).catch(err => console.error('SMS notification failed:', err));
          }
        }
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

    const airtableStatus = data.fields['Status'];
    const apiStatus = STATUS_FROM_AIRTABLE[airtableStatus] || airtableStatus;

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
        status: apiStatus,
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

/**
 * Helper: Send SMS notification to customer
 *
 * @param {string} customerName - Customer's name
 * @param {string} customerPhone - Customer's phone number
 * @param {number} partySize - Number of guests
 * @returns {Promise<boolean>} - True if SMS sent successfully
 */
async function sendSMSNotification(customerName, customerPhone, partySize) {
  // Skip if Twilio credentials not configured
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    console.warn('Twilio credentials not configured - SMS notification skipped');
    return false;
  }

  try {
    // Initialize Twilio client with environment variables
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const message = `Hi ${customerName}! Your table for ${partySize} ${partySize === 1 ? 'person' : 'people'} is ready! Please come to the host stand. See you soon!`;

    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: customerPhone,
    });

    console.log(`SMS sent to ${customerPhone} for ${customerName}`);
    return true;
  } catch (error) {
    console.error('Failed to send SMS:', error);
    // Don't throw error - we don't want SMS failure to break the API
    return false;
  }
}

/**
 * Helper: Send EMAIL notification to customer (FREE alternative to SMS)
 *
 * @param {string} customerName - Customer's name
 * @param {string} customerEmail - Customer's email address
 * @param {number} partySize - Number of guests
 * @returns {Promise<boolean>} - True if email sent successfully
 */
async function sendEmailNotification(customerName, customerEmail, partySize) {
  // Skip if Resend API key not configured
  if (!process.env.RESEND_API_KEY) {
    console.warn('Resend API key not configured - email notification skipped');
    return false;
  }

  // Skip if no email provided
  if (!customerEmail) {
    console.warn('No email provided - email notification skipped');
    return false;
  }

  try {
    // Initialize Resend client
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Create professional HTML email
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Table is Ready!</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); overflow: hidden;">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 600;">🍽️ Your Table is Ready!</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 20px; font-size: 18px; color: #333333; line-height: 1.6;">
                Hi <strong>${customerName}</strong>,
              </p>

              <p style="margin: 0 0 20px; font-size: 16px; color: #555555; line-height: 1.6;">
                Great news! Your table for <strong>${partySize} ${partySize === 1 ? 'person' : 'people'}</strong> is now ready.
              </p>

              <div style="background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 30px 0; border-radius: 4px;">
                <p style="margin: 0; font-size: 16px; color: #333333; font-weight: 500;">
                  ⏰ Please come to the host stand to be seated
                </p>
              </div>

              <p style="margin: 0 0 10px; font-size: 16px; color: #555555; line-height: 1.6;">
                We're looking forward to serving you!
              </p>

              <p style="margin: 0; font-size: 16px; color: #555555; line-height: 1.6;">
                See you soon! 👋
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8f9fa; padding: 30px; text-align: center; border-top: 1px solid #e9ecef;">
              <p style="margin: 0 0 10px; font-size: 14px; color: #6c757d;">
                Thank you for dining with us
              </p>
              <p style="margin: 0; font-size: 12px; color: #adb5bd;">
                This is an automated notification from our waitlist system
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Plain text fallback
    const textContent = `Hi ${customerName}!\n\nYour table for ${partySize} ${partySize === 1 ? 'person' : 'people'} is ready!\n\nPlease come to the host stand to be seated.\n\nSee you soon!`;

    // Send email
    const { data, error } = await resend.emails.send({
      from: 'Restaurant Waitlist <onboarding@resend.dev>', // Will be updated after domain verification
      to: [customerEmail],
      subject: `🍽️ Your Table for ${partySize} is Ready!`,
      html: htmlContent,
      text: textContent,
    });

    if (error) {
      console.error('Failed to send email via Resend:', error);
      return false;
    }

    console.log(`Email sent to ${customerEmail} for ${customerName} - Message ID: ${data?.id}`);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    // Don't throw error - we don't want email failure to break the API
    return false;
  }
}
