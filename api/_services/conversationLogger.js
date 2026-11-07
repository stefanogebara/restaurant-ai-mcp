/**
 * Conversation Logger Service
 *
 * Logs all ElevenLabs AI agent conversations to Supabase for tracking and analysis.
 * Stores transcripts, outcomes, tool usage, and performance metrics.
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { extractMemoriesFromConversation } = require('./memoryExtractor');
const { getRestaurantByAgentId } = require('../_lib/restaurant-loader');

const logger = createSecureLogger('ConversationLogger');

function inRestaurant(query, restaurantId) {
  return restaurantId === undefined ? query : query.eq('restaurant_info_id', restaurantId);
}

/**
 * Start logging a new conversation
 * @param {Object} conversationData - Initial conversation data from ElevenLabs
 * @returns {Promise<Object>} Created conversation record
 */
async function startConversation(conversationData, restaurantId) {
  const {
    conversation_id,
    caller_phone,
    called_phone,
    language = 'en',
    agent_version,
    restaurant_info_id,
    agent_id,
    started_at
  } = conversationData;

  try {
    // Check if conversation already exists to prevent duplicates
    const { data: existing, error: lookupError } = await inRestaurant(supabaseAdmin
      .from('agent_conversations')
      .select('id')
      .eq('conversation_id', conversation_id), restaurantId).maybeSingle();
    if (lookupError) throw lookupError;

    if (existing) {
      logger.info(`[ConversationLogger] Conversation ${conversation_id} already exists, skipping insert`);
      return existing;
    }

    const insertData = {
      conversation_id,
      caller_phone,
      called_phone,
      language,
      started_at: started_at || new Date().toISOString(),
      agent_version,
      transcript: [],
      tools_used: [],
      errors_encountered: []
    };

    // Include restaurant_info_id if provided
    if (restaurantId !== undefined || restaurant_info_id) {
      insertData.restaurant_info_id = restaurantId ?? restaurant_info_id;
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
async function logToolCall(conversationId, toolData, restaurantId) {
  const {
    tool_name,
    parameters,
    success,
    result,
    error_message
  } = toolData;

  try {
    // Get existing conversation
    const { data: conversation, error: fetchError } = await inRestaurant(supabaseAdmin
      .from('agent_conversations')
      .select('tools_used, errors_encountered')
      .eq('conversation_id', conversationId), restaurantId).single();

    if (fetchError || !conversation) {
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
    const { error: updateError } = await inRestaurant(supabaseAdmin
      .from('agent_conversations')
      .update({
        tools_used: toolsUsed,
        errors_encountered: errorsEncountered,
        updated_at: new Date().toISOString()
      })
      .eq('conversation_id', conversationId), restaurantId);

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

    // Memory extraction. Awaited (with 8s ceiling) so the ElevenLabs
    // post-call webhook doesn't race Lambda shutdown — without this,
    // every voice call that wrapped fast enough to return before the
    // memory extractor finished was silently losing its memories.
    await Promise.race([
      extractMemoriesFromConversation(conversationId).catch(err => {
        logger.error('[ConversationLogger] Memory extraction failed:', err.message);
      }),
      new Promise(resolve => setTimeout(resolve, 8000)),
    ]);

  } catch (error) {
    logger.error('[ConversationLogger] Exception ending conversation:', error);
  }
}

/** Persist a completed provider call once, whether it arrived via webhook or polling. */
async function ingestCompletedConversation(provider, { restaurantId } = {}) {
  const { conversation_id: conversationId, agent_id: agentId, status } = provider;
  if (!conversationId || !agentId || !['done', 'failed'].includes(status)) {
    throw new Error('Invalid completed conversation');
  }

  const find = () => supabaseAdmin.from('agent_conversations')
    .select('id, restaurant_info_id, agent_id, reservation_id, outcome, summary, caller_phone, called_phone, elevenlabs_fetched_at')
    .eq('conversation_id', conversationId).maybeSingle();
  let { data: existing, error: readError } = await find();
  if (readError) throw readError;
  if (existing?.elevenlabs_fetched_at) return { ingested: false };
  if (existing?.agent_id && existing.agent_id !== agentId) throw new Error('Agent mismatch');
  if (restaurantId && existing?.restaurant_info_id && restaurantId !== existing.restaurant_info_id) {
    throw new Error('Restaurant mismatch');
  }

  // Bind every provider agent to its restaurant before writing call data.
  const restaurant = await getRestaurantByAgentId(agentId);
  if ((restaurantId && restaurant.id !== restaurantId) ||
      (existing?.restaurant_info_id && existing.restaurant_info_id !== restaurant.id)) {
    throw new Error('Agent restaurant mismatch');
  }
  restaurantId = restaurant.id;
  const start = Number(provider.metadata?.start_time_unix_secs);
  const providerStartedAt = Number.isFinite(start) && start > 0 && start * 1000 <= 8.64e15
    ? new Date(start * 1000).toISOString() : null;
  const phoneCall = provider.metadata?.phone_call;
  const externalNumber = typeof phoneCall?.external_number === 'string' && /^\+\d{7,15}$/.test(phoneCall.external_number)
    ? phoneCall.external_number : null;
  const agentNumber = typeof phoneCall?.agent_number === 'string' && /^\+\d{7,15}$/.test(phoneCall.agent_number)
    ? phoneCall.agent_number : null;
  if (!existing) {
    const created = await startConversation({
      conversation_id: conversationId,
      restaurant_info_id: restaurantId,
      agent_id: agentId,
      started_at: providerStartedAt,
      caller_phone: externalNumber,
      called_phone: agentNumber,
    });
    if (!created) throw new Error('Conversation insert failed');
    ({ data: existing, error: readError } = await find());
    if (readError || !existing) throw new Error('Conversation read failed');
  }

  const transcript = Array.isArray(provider.transcript)
    ? provider.transcript.filter(turn => ['agent', 'user'].includes(turn.role)).map(turn => ({
      role: turn.role === 'agent' ? 'assistant' : 'user',
      content: String(turn.message || ''),
      timestamp: turn.time_in_call_secs ?? null,
    }))
    : [];
  const duration = Number(provider.metadata?.call_duration_secs);
  const now = new Date().toISOString();
  const endedAt = providerStartedAt && Number.isFinite(duration) && duration >= 0
    ? new Date((start + duration) * 1000).toISOString() : now;
  const update = {
    ended_at: endedAt,
    elevenlabs_fetched_at: now,
    updated_at: now,
    outcome: existing.reservation_id ? 'reservation_created' : status === 'failed' ? 'error' : 'information_only',
    successful_booking: !!existing.reservation_id,
    agent_id: agentId,
    restaurant_info_id: restaurantId,
  };
  if (providerStartedAt) update.started_at = providerStartedAt;
  if (!existing.caller_phone && externalNumber) update.caller_phone = externalNumber;
  if (!existing.called_phone && agentNumber) update.called_phone = agentNumber;
  if (Array.isArray(provider.transcript)) update.transcript = transcript;
  if (transcript.length) {
    // Give the inline analysis a chance to finish before the hourly retry job.
    update.post_call_analysis_next_at = new Date(Date.now() + 5 * 60_000).toISOString();
  } else {
    update.post_call_analysis_done_at = now;
  }
  if (Number.isFinite(duration) && duration >= 0) update.duration_seconds = Math.round(duration);
  if (typeof provider.analysis?.transcript_summary === 'string') update.summary = provider.analysis.transcript_summary;
  if (typeof provider.recording_url === 'string' && /^https:\/\//.test(provider.recording_url)) {
    update.recording_url = provider.recording_url;
  }
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('agent_conversations').update(update)
    .eq('id', existing.id).is('elevenlabs_fetched_at', null).select('id');
  if (updateError) throw updateError;
  if (!updated?.length) return { ingested: false };

  // Completion is durable before optional enrichment starts. The webhook must
  // acknowledge a completed call even if the LLM or memory service stalls.
  // Limitation: elevenlabs_fetched_at suppresses duplicate delivery, so work
  // that misses this deadline is best-effort and will not be retried. A durable
  // enrichment cursor would require its own state and idempotent memory writes.
  let acceptingEnrichment = true;
  const tasks = [];
  if (transcript.length) {
    tasks.push(analyzeTranscript(transcript).then(async analysis => {
      if (!acceptingEnrichment) return;
      const enrichment = {};
      if (!update.summary && analysis.summary) enrichment.summary = analysis.summary;
      if (analysis.sentiment) {
        enrichment.customer_sentiment = analysis.sentiment;
        enrichment.post_call_analysis_done_at = new Date().toISOString();
      }
      if (Object.keys(enrichment).length) {
        const { error } = await supabaseAdmin.from('agent_conversations')
          .update(enrichment).eq('id', existing.id);
        if (error) logger.error('Conversation enrichment failed');
      }
    }).catch(() => logger.error('Conversation enrichment failed')));
  }
  tasks.push(extractMemoriesFromConversation(conversationId)
    .catch(() => logger.error('Memory extraction failed')));

  // The conditional write above keeps retries from repeating enrichment.
  let timeout;
  try {
    await Promise.race([
      Promise.all(tasks),
      new Promise(resolve => { timeout = setTimeout(resolve, 4000); }),
    ]);
  } finally {
    acceptingEnrichment = false;
    clearTimeout(timeout);
  }
  return { ingested: true };
}

async function analyzeTranscript(transcript) {
  try {
    const { getAIClient, AI_MODEL_FAST } = require('../_lib/ai-client');
    const text = transcript.map(turn => `${turn.role}: ${turn.content}`).join('\n').slice(0, 2000);
    const response = await getAIClient().messages.create({
      model: AI_MODEL_FAST,
      max_tokens: 200,
      system: 'Analyze a restaurant phone call. Return JSON only with summary (2-3 sentences) and sentiment (positive, neutral, or negative).',
      messages: [{ role: 'user', content: text }],
    });
    const raw = response.content?.[0]?.text || response.choices?.[0]?.message?.content || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    const parsed = JSON.parse(match[0]);
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 500) : null,
      sentiment: ['positive', 'neutral', 'negative'].includes(parsed.sentiment) ? parsed.sentiment : null,
    };
  } catch (_) {
    logger.error('Conversation analysis failed');
    return {};
  }
}

/** Recover sentiment analysis after the webhook's four-second deadline.
 * The conditional claim prevents concurrent cron invocations from paying for
 * the same call. A failed or invalid model result remains eligible, at most
 * three times. This deliberately does not repeat guest-memory extraction:
 * its writes need a separate per-fact idempotency key first.
 */
async function retryPendingPostCallAnalysis() {
  const now = new Date();
  const { data: candidates, error } = await supabaseAdmin.from('agent_conversations')
    .select('id, transcript, summary, post_call_analysis_attempts, post_call_analysis_next_at')
    .not('elevenlabs_fetched_at', 'is', null)
    .is('customer_sentiment', null)
    .is('post_call_analysis_done_at', null)
    .lt('post_call_analysis_attempts', 3)
    .gte('elevenlabs_fetched_at', new Date(now.getTime() - 7 * 24 * 60 * 60_000).toISOString())
    .order('post_call_analysis_next_at', { ascending: true, nullsFirst: true })
    .limit(20);
  if (error) throw error;

  let attempted = 0;
  let completed = 0;
  let errors = 0;
  for (const row of candidates || []) {
    if (attempted >= 2) break;
    if (row.post_call_analysis_next_at && new Date(row.post_call_analysis_next_at) > now) continue;

    const attempt = row.post_call_analysis_attempts || 0;
    if (attempt >= 3) continue;
    const delay = [5, 30, 120][attempt] * 60_000;
    let claim = supabaseAdmin.from('agent_conversations')
      .update({
        post_call_analysis_attempts: attempt + 1,
        post_call_analysis_next_at: new Date(now.getTime() + delay).toISOString(),
      })
      .eq('id', row.id)
      .eq('post_call_analysis_attempts', attempt)
      .is('customer_sentiment', null)
      .is('post_call_analysis_done_at', null);
    claim = row.post_call_analysis_next_at
      ? claim.eq('post_call_analysis_next_at', row.post_call_analysis_next_at)
      : claim.is('post_call_analysis_next_at', null);
    const { data: claimed, error: claimError } = await claim.select('id');
    if (claimError) throw claimError;
    if (!claimed?.length) continue;
    attempted++;

    if (!Array.isArray(row.transcript) || row.transcript.length === 0) {
      const { error: emptyError } = await supabaseAdmin.from('agent_conversations')
        .update({ post_call_analysis_done_at: new Date().toISOString() }).eq('id', row.id);
      if (emptyError) throw emptyError;
      completed++;
      continue;
    }

    let timer;
    try {
      const result = await Promise.race([
        analyzeTranscript(row.transcript),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('analysis_timeout')), 10_000); }),
      ]);
      if (!result.sentiment) { errors++; continue; }
      const updates = {
        customer_sentiment: result.sentiment,
        post_call_analysis_done_at: new Date().toISOString(),
      };
      if (!row.summary && result.summary) updates.summary = result.summary;
      const { error: writeError } = await supabaseAdmin.from('agent_conversations')
        .update(updates).eq('id', row.id).is('customer_sentiment', null);
      if (writeError) throw writeError;
      completed++;
    } catch (_) {
      errors++;
      logger.error('Post-call analysis retry failed');
    } finally {
      clearTimeout(timer);
    }
  }
  return { attempted, completed, errors };
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
async function updateConversation(conversationId, updates, restaurantId) {
  try {
    const safeUpdates = { ...updates };
    if (restaurantId !== undefined) delete safeUpdates.restaurant_info_id;
    const { error } = await inRestaurant(supabaseAdmin
      .from('agent_conversations')
      .update({
        ...safeUpdates,
        updated_at: new Date().toISOString()
      })
      .eq('conversation_id', conversationId), restaurantId);

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
  updateConversation,
  ingestCompletedConversation,
  retryPendingPostCallAnalysis,
  forRestaurant(restaurantId) {
    if (typeof restaurantId !== 'string' || !restaurantId.trim()) throw new Error('Invalid restaurant scope');
    return {
      startConversation: data => startConversation(data, restaurantId),
      logToolCall: (id, data) => logToolCall(id, data, restaurantId),
      updateConversation: (id, data) => updateConversation(id, data, restaurantId),
    };
  },
};
