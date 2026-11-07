/**
 * Sync Conversation Data from ElevenLabs
 *
 * Schedule: Hourly
 *
 * For recent conversations that haven't been synced, fetch provider state and
 * ingest completed calls. Failed fetches stay eligible for the next run.
 *
 * Requires: CRON_SECRET, ELEVENLABS_API_KEY env vars
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { logCronRun, logCronError } = require('../_lib/cron-tracker');
const { createSecureLogger } = require('../_lib/secure-logger');
const { isCronEnabled } = require('../_lib/cron-config');
const { bearerEquals } = require('../_lib/secure-compare');
const { ingestCompletedConversation } = require('../_services/conversationLogger');

const logger = createSecureLogger('SyncConversationData');

const JOB_NAME = 'sync-conversation-data';
const MAX_CONVERSATIONS_PER_RUN = 20;
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

module.exports = async (req, res) => {
  // Verify cron secret
  const authHeader = req.headers.authorization;
  if (!bearerEquals(authHeader, process.env.CRON_SECRET)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Operational kill switch; flipping the row off
  // in public.cron_config is the fastest way to stop a misbehaving sync.
  if (!(await isCronEnabled(JOB_NAME))) {
    logger.warn(`${JOB_NAME} cron disabled by ops, skipping run`);
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  try {
    const result = await syncConversationData();
    await logCronRun(JOB_NAME);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    logger.error('[SyncConversationData] Fatal error:', error.message);
    await logCronError(JOB_NAME, error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

async function syncConversationData() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    logger.info('[SyncConversationData] No ELEVENLABS_API_KEY, skipping');
    return { synced: 0, skipped: 'no_api_key' };
  }

  // Include open calls: information-only calls never run the reservation tool.
  const { data: conversations, error: fetchError } = await supabaseAdmin
    .from('agent_conversations')
    .select('id, conversation_id, restaurant_info_id')
    .is('elevenlabs_fetched_at', null)
    .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('ended_at', { ascending: false, nullsFirst: false })
    .limit(MAX_CONVERSATIONS_PER_RUN);

  if (fetchError) {
    // Column might not exist yet — graceful fallback
    if (fetchError.message?.includes('elevenlabs_fetched_at')) {
      logger.info('[SyncConversationData] elevenlabs_fetched_at column not yet created, skipping');
      return { synced: 0, skipped: 'column_not_exists' };
    }
    throw fetchError;
  }

  if (!conversations || conversations.length === 0) {
    logger.info('[SyncConversationData] No conversations to sync');
    return { synced: 0, total: 0 };
  }

  logger.info(`[SyncConversationData] Found ${conversations.length} conversations to sync`);

  let synced = 0;
  let errors = 0;

  for (const conv of conversations) {
    try {
      const provider = await fetchElevenLabsConversation(conv.conversation_id, apiKey);
      if (!provider || !['done', 'failed'].includes(provider.status)) continue;
      if (provider.conversation_id !== conv.conversation_id) throw new Error('Provider ID mismatch');
      await ingestCompletedConversation(provider, { restaurantId: conv.restaurant_info_id });
      synced++;
    } catch (error) {
      errors++;
      // Keep the row eligible for the next run. Provider error bodies can contain PII.
      logger.error('[SyncConversationData] Conversation sync failed', { status: error.status || 'unknown' });
    }
  }

  logger.info(`[SyncConversationData] Done: synced=${synced}, errors=${errors}`);
  return { synced, errors, total: conversations.length };
}

async function fetchElevenLabsConversation(conversationId, apiKey) {
    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/conversations/${encodeURIComponent(conversationId)}`, {
      headers: { 'xi-api-key': apiKey },
    });

    if (!response.ok) {
      const error = new Error('ElevenLabs fetch failed');
      error.status = response.status;
      throw error;
    }

    return await response.json();
}
