/**
 * Agent Conversations API
 *
 * Provides endpoints for fetching and analyzing ElevenLabs AI agent conversation history.
 * Used by the Call Tracking Dashboard.
 *
 * @vercel
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const action = req.query.action;

    switch (action) {
      case 'list':
        return await handleListConversations(req, res);

      case 'get':
        return await handleGetConversation(req, res);

      case 'stats':
        return await handleGetStats(req, res);

      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action',
          message: 'Action must be one of: list, get, stats'
        });
    }

  } catch (error) {
    console.error('[AgentConversations] Error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};

/**
 * List all conversations with filtering and pagination
 * GET /api/agent-conversations?action=list&date_from=2025-01-01&outcome=reservation_created&limit=50
 */
async function handleListConversations(req, res) {
  const {
    date_from,
    date_to,
    outcome,
    language,
    restaurant_id,
    limit = 50,
    offset = 0,
    order_by = 'started_at',
    order_direction = 'desc'
  } = req.query;

  try {
    let query = supabase
      .from('agent_conversations')
      .select('*', { count: 'exact' });

    // Filter by restaurant (required for multi-tenant)
    if (restaurant_id && restaurant_id !== 'default') {
      query = query.eq('restaurant_info_id', restaurant_id);
    }

    // Apply filters
    if (date_from) {
      query = query.gte('started_at', date_from);
    }
    if (date_to) {
      query = query.lte('started_at', date_to);
    }
    if (outcome) {
      query = query.eq('outcome', outcome);
    }
    if (language) {
      query = query.eq('language', language);
    }

    // Apply ordering
    query = query.order(order_by, { ascending: order_direction === 'asc' });

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[AgentConversations] List error:', error);
      return res.status(500).json({
        success: false,
        error: 'Database error',
        message: error.message
      });
    }

    return res.status(200).json({
      success: true,
      conversations: data,
      pagination: {
        total: count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        has_more: count > (parseInt(offset) + parseInt(limit))
      }
    });

  } catch (error) {
    console.error('[AgentConversations] List exception:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal error',
      message: error.message
    });
  }
}

/**
 * Get single conversation details
 * GET /api/agent-conversations?action=get&id=uuid
 */
async function handleGetConversation(req, res) {
  const { id, conversation_id } = req.query;

  if (!id && !conversation_id) {
    return res.status(400).json({
      success: false,
      error: 'Missing parameter',
      message: 'Either id or conversation_id is required'
    });
  }

  try {
    let query = supabase.from('agent_conversations').select('*');

    if (id) {
      query = query.eq('id', id);
    } else {
      query = query.eq('conversation_id', conversation_id);
    }

    const { data, error } = await query.single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({
          success: false,
          error: 'Not found',
          message: 'Conversation not found'
        });
      }

      console.error('[AgentConversations] Get error:', error);
      return res.status(500).json({
        success: false,
        error: 'Database error',
        message: error.message
      });
    }

    return res.status(200).json({
      success: true,
      conversation: data
    });

  } catch (error) {
    console.error('[AgentConversations] Get exception:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal error',
      message: error.message
    });
  }
}

/**
 * Get aggregate statistics
 * GET /api/agent-conversations?action=stats&period=7d
 */
async function handleGetStats(req, res) {
  const { period = '7d', date_from, date_to, restaurant_id } = req.query;

  try {
    // Calculate date range
    let startDate;
    if (date_from) {
      startDate = new Date(date_from);
    } else {
      startDate = new Date();
      const days = period.endsWith('d') ? parseInt(period) : 7;
      startDate.setDate(startDate.getDate() - days);
    }

    const endDate = date_to ? new Date(date_to) : new Date();

    // Build query with restaurant filter
    let query = supabase
      .from('agent_conversations')
      .select('*')
      .gte('started_at', startDate.toISOString())
      .lte('started_at', endDate.toISOString());

    // Filter by restaurant (required for multi-tenant)
    if (restaurant_id && restaurant_id !== 'default') {
      query = query.eq('restaurant_info_id', restaurant_id);
    }

    const { data: conversations, error } = await query;

    if (error) {
      console.error('[AgentConversations] Stats error:', error);
      return res.status(500).json({
        success: false,
        error: 'Database error',
        message: error.message
      });
    }

    // Calculate statistics
    const totalCalls = conversations.length;
    const successfulBookings = conversations.filter(c => c.successful_booking).length;
    const averageDuration = conversations.reduce((sum, c) => sum + (c.duration_seconds || 0), 0) / totalCalls || 0;

    // Outcome breakdown
    const outcomeBreakdown = {};
    conversations.forEach(c => {
      outcomeBreakdown[c.outcome] = (outcomeBreakdown[c.outcome] || 0) + 1;
    });

    // Language breakdown
    const languageBreakdown = {};
    conversations.forEach(c => {
      languageBreakdown[c.language] = (languageBreakdown[c.language] || 0) + 1;
    });

    // Success rate
    const successRate = totalCalls > 0 ? (successfulBookings / totalCalls * 100).toFixed(1) : 0;

    // Daily call volume (for chart)
    const dailyVolume = {};
    conversations.forEach(c => {
      const date = new Date(c.started_at).toISOString().split('T')[0];
      dailyVolume[date] = (dailyVolume[date] || 0) + 1;
    });

    return res.status(200).json({
      success: true,
      stats: {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          days: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))
        },
        overview: {
          total_calls: totalCalls,
          successful_bookings: successfulBookings,
          success_rate: parseFloat(successRate),
          average_duration_seconds: Math.round(averageDuration),
          average_duration_formatted: formatDuration(averageDuration)
        },
        breakdowns: {
          by_outcome: outcomeBreakdown,
          by_language: languageBreakdown,
          by_day: dailyVolume
        },
        top_errors: getTopErrors(conversations)
      }
    });

  } catch (error) {
    console.error('[AgentConversations] Stats exception:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal error',
      message: error.message
    });
  }
}

/**
 * Helper: Format duration in human-readable format
 */
function formatDuration(seconds) {
  if (!seconds) return '0s';

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Helper: Get top recurring errors
 */
function getTopErrors(conversations) {
  const errorCounts = {};

  conversations.forEach(c => {
    if (c.errors_encountered && Array.isArray(c.errors_encountered)) {
      c.errors_encountered.forEach(err => {
        const key = err.error_type || 'unknown';
        errorCounts[key] = (errorCounts[key] || 0) + 1;
      });
    }
  });

  // Convert to array and sort by count
  return Object.entries(errorCounts)
    .map(([type, count]) => ({ error_type: type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5); // Top 5 errors
}
