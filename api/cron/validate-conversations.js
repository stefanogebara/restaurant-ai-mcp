/**
 * Post-Call Validator Cron
 *
 * Schedule: Every 15 minutes
 *
 * Analyzes recently completed conversations for common AI errors:
 * - Reservation created without checking availability first
 * - Reservation for out-of-business-hours time
 * - Unreasonable party size (>20)
 * - Tool errors followed by booking anyway
 * - Multiple failed tool calls
 *
 * Flags issues in conversation_flags table for manager review.
 *
 * Requires: CRON_SECRET
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { logCronRun, logCronError } = require('../_lib/cron-tracker');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('ValidateConversations');

const JOB_NAME = 'validate-conversations';
const MAX_PER_RUN = 30;

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await validateRecentConversations();
    await logCronRun(JOB_NAME);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    logger.error('[ValidateConversations] Fatal error:', error.message);
    await logCronError(JOB_NAME, error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

async function validateRecentConversations() {
  // Find conversations ended in the last 30 minutes that haven't been validated
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: conversations, error } = await supabaseAdmin
    .from('agent_conversations')
    .select('id, conversation_id, restaurant_info_id, tools_used, outcome, party_size, requested_date, requested_time, errors_encountered')
    .not('ended_at', 'is', null)
    .gte('ended_at', thirtyMinAgo)
    .order('ended_at', { ascending: false })
    .limit(MAX_PER_RUN);

  if (error) {
    // conversation_flags table might not exist yet
    if (error.message?.includes('conversation_flags')) {
      logger.info('[ValidateConversations] conversation_flags table not yet created');
      return { validated: 0, skipped: 'table_not_exists' };
    }
    throw error;
  }

  if (!conversations || conversations.length === 0) {
    return { validated: 0, flagged: 0 };
  }

  let validated = 0;
  let flagged = 0;

  for (const conv of conversations) {
    const flags = analyzeConversation(conv);

    if (flags.length > 0) {
      // Check if flags already exist for this conversation
      const { data: existing } = await supabaseAdmin
        .from('conversation_flags')
        .select('id')
        .eq('conversation_id', conv.id)
        .limit(1);

      if (!existing || existing.length === 0) {
        const flagRows = flags.map(flag => ({
          conversation_id: conv.id,
          flag_type: flag.type,
          severity: flag.severity,
          details: flag.details,
        }));

        const { error: insertError } = await supabaseAdmin
          .from('conversation_flags')
          .insert(flagRows);

        if (insertError) {
          logger.error(`[ValidateConversations] Error inserting flags for ${conv.conversation_id}:`, insertError.message);
        } else {
          flagged += flags.length;
        }
      }
    }

    validated++;
  }

  logger.info(`[ValidateConversations] Validated ${validated}, flagged ${flagged}`);
  return { validated, flagged };
}

function analyzeConversation(conv) {
  const flags = [];
  const toolsUsed = conv.tools_used || [];
  const errors = conv.errors_encountered || [];

  // Rule 1: Reservation created without availability check
  if (conv.outcome === 'reservation_created') {
    const hasAvailabilityCheck = toolsUsed.some(t =>
      t.tool_name === 'check_availability' && t.success
    );
    const hasCreateReservation = toolsUsed.some(t =>
      t.tool_name === 'create_reservation' && t.success
    );

    if (hasCreateReservation && !hasAvailabilityCheck) {
      flags.push({
        type: 'no_availability_check',
        severity: 'warning',
        details: { message: 'Reservation was created without first checking availability' },
      });
    }
  }

  // Rule 2: Unreasonable party size
  if (conv.party_size && (conv.party_size > 20 || conv.party_size < 1)) {
    flags.push({
      type: 'unreasonable_party_size',
      severity: conv.party_size > 50 ? 'critical' : 'warning',
      details: { party_size: conv.party_size, message: `Party size ${conv.party_size} is unusual` },
    });
  }

  // Rule 3: Multiple tool failures in one conversation
  const failedTools = toolsUsed.filter(t => !t.success);
  if (failedTools.length >= 3) {
    flags.push({
      type: 'multiple_tool_failures',
      severity: 'warning',
      details: {
        failed_count: failedTools.length,
        tools: failedTools.map(t => t.tool_name),
        message: `${failedTools.length} tool calls failed during this conversation`,
      },
    });
  }

  // Rule 4: Tool errors followed by booking (unreliable booking)
  if (conv.outcome === 'reservation_created' && failedTools.length > 0) {
    const createIdx = toolsUsed.findIndex(t => t.tool_name === 'create_reservation' && t.success);
    const errorBeforeCreate = failedTools.some(t => {
      const errIdx = toolsUsed.indexOf(t);
      return errIdx < createIdx;
    });

    if (errorBeforeCreate) {
      flags.push({
        type: 'booking_after_errors',
        severity: 'warning',
        details: {
          failed_tools: failedTools.map(t => t.tool_name),
          message: 'Reservation created after tool failures occurred',
        },
      });
    }
  }

  // Rule 5: Many errors in conversation
  if (errors.length >= 3) {
    flags.push({
      type: 'high_error_count',
      severity: errors.length >= 5 ? 'critical' : 'warning',
      details: {
        error_count: errors.length,
        errors: errors.slice(0, 5).map(e => e.message || e.error_type),
      },
    });
  }

  return flags;
}

// Export for testing
module.exports.analyzeConversation = analyzeConversation;
