/**
 * Conversation Logger Service
 *
 * Logs all ElevenLabs AI agent conversations to Supabase for tracking and analysis.
 * Stores transcripts, outcomes, tool usage, and performance metrics.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { extractMemoriesFromConversation } = require('./memoryExtractor');

const logger = createSecureLogger('ConversationLogger');

/**
 * Start logging a new conversation
 * @param {Object} conversationData - Initial conversation data from ElevenLabs
 * @returns {Promise<Object>} Created conversation record
 */
async function startConversation(conversationData) {
  const {
    conversation_id,
    caller_phone,
    called_phone,
    language = 'en',
    agent_version,
    restaurant_info_id,
    agent_id
  } = conversationData;

  try {
    // Check if conversation already exists to prevent duplicates
    const { data: existing } = await supabaseAdmin
      .from('agent_conversations')
      .select('id')
      .eq('conversation_id', conversation_id)
      .maybeSingle();

    if (existing) {
      logger.info(`[ConversationLogger] Conversation ${conversation_id} already exists, skipping insert`);
      return existing;
    }

    const insertData = {
      conversation_id,
      caller_phone,
      called_phone,
      language,
      started_at: new Date().toISOString(),
      agent_version,
      transcript: [],
      tools_used: [],
      errors_encountered: []
    };

    // Include restaurant_info_id if provided
    if (restaurant_info_id) {
      insertData.restaurant_info_id = restaurant_info_id;
    }
    if (agent_id) {
      insertData.agent_id = agent_id;
    }

    const { data, error } = await supabaseAdmin
      .from('agent_conversations')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      logger.error('[ConversationLogger] Error starting conversation:', error);
      throw error;
    }

    logger.info(`✅ [ConversationLogger] Started conversation ${conversation_id}`);
    return data;

  } catch (error) {
    logger.error('[ConversationLogger] Exception starting conversation:', error);
    // Don't throw - we don't want to break the webhook if logging fails
    return null;
  }
}

/**
 * Log a tool call (action) during the conversation
 * @param {string} conversationId - ElevenLabs conversation ID
 * @param {Object} toolData - Tool call details
 */
async function logToolCall(conversationId, toolData) {
  const {
    tool_name,
    parameters,
    success,
    result,
    error_message
  } = toolData;

  try {
    // Get existing conversation
    const { data: conversation, error: fetchError } = await supabaseAdmin
      .from('agent_conversations')
      .select('tools_used, errors_encountered')
      .eq('conversation_id', conversationId)
      .single();

    if (fetchError) {
      logger.error('[ConversationLogger] Error fetching conversation for tool log:', fetchError);
      return;
    }

    // Append new tool call
    const toolsUsed = conversation.tools_used || [];
    toolsUsed.push({
      tool_name,
      parameters,
      success,
      result: success ? result : undefined,
      timestamp: new Date().toISOString()
    });

    // If tool failed, also log error
    const errorsEncountered = conversation.errors_encountered || [];
    if (!success && error_message) {
      errorsEncountered.push({
        error_type: 'tool_failure',
        tool_name,
        message: error_message,
        timestamp: new Date().toISOString()
      });
    }

    // Update conversation
    const { error: updateError } = await supabaseAdmin
      .from('agent_conversations')
      .update({
        tools_used: toolsUsed,
        errors_encountered: errorsEncountered,
        updated_at: new Date().toISOString()
      })
      .eq('conversation_id', conversationId);

    if (updateError) {
      logger.error('[ConversationLogger] Error logging tool call:', updateError);
    } else {
      logger.info(`✅ [ConversationLogger] Logged tool call: ${tool_name} (success: ${success})`);
    }

  } catch (error) {
    logger.error('[ConversationLogger] Exception logging tool call:', error);
  }
}

/**
 * End conversation and log final outcome
 * @param {string} conversationId - ElevenLabs conversation ID
 * @param {Object} outcomeData - Final conversation outcome
 */
async function endConversation(conversationId, outcomeData) {
  const {
    outcome, // 'reservation_created', 'information_only', 'error', 'abandoned'
    reservation_id,
    customer_name,
    customer_email,
    party_size,
    requested_date,
    requested_time,
    successful_booking,
    required_human_handoff,
    customer_sentiment,
    transcript,
    summary,
    duration_seconds
  } = outcomeData;

  try {
    const { error } = await supabaseAdmin
      .from('agent_conversations')
      .update({
        ended_at: new Date().toISOString(),
        duration_seconds,
        outcome,
        reservation_id,
        customer_name,
        customer_email,
        party_size,
        requested_date,
        requested_time,
        successful_booking,
        required_human_handoff,
        customer_sentiment,
        transcript,
        summary,
        updated_at: new Date().toISOString()
      })
      .eq('conversation_id', conversationId);

    if (error) {
      logger.error('[ConversationLogger] Error ending conversation:', error);
      throw error;
    }

    logger.info(`✅ [ConversationLogger] Ended conversation ${conversationId} (outcome: ${outcome})`);

    // Fire-and-forget memory extraction (don't block the response)
    extractMemoriesFromConversation(conversationId).catch(err => {
      logger.error('[ConversationLogger] Memory extraction failed:', err.message);
    });

  } catch (error) {
    logger.error('[ConversationLogger] Exception ending conversation:', error);
  }
}

/**
 * Log a transcript message during the conversation
 * @param {string} conversationId - ElevenLabs conversation ID
 * @param {Object} message - Message data
 */
async function logMessage(conversationId, message) {
  const {
    role, // 'user' or 'assistant'
    content,
    timestamp
  } = message;

  try {
    // Get existing transcript
    const { data: conversation, error: fetchError } = await supabaseAdmin
      .from('agent_conversations')
      .select('transcript')
      .eq('conversation_id', conversationId)
      .single();

    if (fetchError) {
      logger.error('[ConversationLogger] Error fetching conversation for message log:', fetchError);
      return;
    }

    // Append new message
    const transcript = conversation.transcript || [];
    transcript.push({
      role,
      content,
      timestamp: timestamp || new Date().toISOString()
    });

    // Update conversation
    const { error: updateError } = await supabaseAdmin
      .from('agent_conversations')
      .update({
        transcript,
        updated_at: new Date().toISOString()
      })
      .eq('conversation_id', conversationId);

    if (updateError) {
      logger.error('[ConversationLogger] Error logging message:', updateError);
    }

  } catch (error) {
    logger.error('[ConversationLogger] Exception logging message:', error);
  }
}

/**
 * Update conversation metadata (e.g., customer details discovered during call)
 * @param {string} conversationId - ElevenLabs conversation ID
 * @param {Object} updates - Fields to update
 */
async function updateConversation(conversationId, updates) {
  try {
    const { error } = await supabaseAdmin
      .from('agent_conversations')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('conversation_id', conversationId);

    if (error) {
      logger.error('[ConversationLogger] Error updating conversation:', error);
      throw error;
    }

    logger.info(`✅ [ConversationLogger] Updated conversation ${conversationId}`);

  } catch (error) {
    logger.error('[ConversationLogger] Exception updating conversation:', error);
  }
}

module.exports = {
  startConversation,
  logToolCall,
  endConversation,
  logMessage,
  updateConversation
};
