/**
 * Sync Conversation Data from ElevenLabs
 *
 * Schedule: Every 15 minutes
 *
 * For recent ended conversations that haven't been synced:
 * 1. Fetches full transcript + recording URL from ElevenLabs API
 * 2. Generates AI summary + sentiment analysis
 * 3. Updates agent_conversations with enriched data
 *
 * ElevenLabs stores conversation data for ~24-48 hours, so we must pull it promptly.
 *
 * Requires: CRON_SECRET, ELEVENLABS_API_KEY env vars
 */

const { supabaseAdmin } = require('../_lib/supabase');
const { logCronRun, logCronError } = require('../_lib/cron-tracker');
const { createSecureLogger } = require('../_lib/secure-logger');
const { isCronEnabled } = require('../_lib/cron-config');

const logger = createSecureLogger('SyncConversationData');

const JOB_NAME = 'sync-conversation-data';
const MAX_CONVERSATIONS_PER_RUN = 20;
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

module.exports = async (req, res) => {
  // Verify cron secret
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Phase Y.5 kill switch — fires every 15 min, so flipping the row off
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

  // Find conversations that ended in the last 24 hours and haven't been fetched
  const { data: conversations, error: fetchError } = await supabaseAdmin
    .from('agent_conversations')
    .select('id, conversation_id, restaurant_info_id')
    .not('ended_at', 'is', null)
    .is('elevenlabs_fetched_at', null)
    .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('ended_at', { ascending: false })
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
      await syncSingleConversation(conv, apiKey);
      synced++;
    } catch (error) {
      errors++;
      logger.error(`[SyncConversationData] Error syncing ${conv.conversation_id}:`, error.message);
      // Mark as fetched even on error to avoid retrying forever
      await supabaseAdmin
        .from('agent_conversations')
        .update({ elevenlabs_fetched_at: new Date().toISOString() })
        .eq('id', conv.id);
    }
  }

  logger.info(`[SyncConversationData] Done: synced=${synced}, errors=${errors}`);
  return { synced, errors, total: conversations.length };
}

async function syncSingleConversation(conv, apiKey) {
  // 1. Fetch conversation data from ElevenLabs
  const elevenLabsData = await fetchElevenLabsConversation(conv.conversation_id, apiKey);

  if (!elevenLabsData) {
    logger.info(`[SyncConversationData] No data from ElevenLabs for ${conv.conversation_id}`);
    return;
  }

  // 2. Extract transcript and recording URL
  const transcript = extractTranscript(elevenLabsData);
  const recordingUrl = elevenLabsData.recording_url || null;
  const durationSeconds = elevenLabsData.metadata?.call_duration_secs
    || elevenLabsData.duration_seconds
    || null;

  // 3. Generate AI summary + sentiment if we have transcript
  let summary = null;
  let sentiment = null;

  if (transcript && transcript.length > 0) {
    const analysis = await generateSummaryAndSentiment(transcript);
    summary = analysis.summary;
    sentiment = analysis.sentiment;
  }

  // 4. Update the conversation record
  const updateData = {
    elevenlabs_fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (recordingUrl) updateData.recording_url = recordingUrl;
  if (transcript && transcript.length > 0) updateData.transcript = transcript;
  if (summary) updateData.summary = summary;
  if (sentiment) updateData.customer_sentiment = sentiment;
  if (durationSeconds && !isNaN(durationSeconds)) updateData.duration_seconds = Math.round(durationSeconds);

  const { error: updateError } = await supabaseAdmin
    .from('agent_conversations')
    .update(updateData)
    .eq('id', conv.id);

  if (updateError) {
    throw new Error(`DB update failed: ${updateError.message}`);
  }

  logger.info(`[SyncConversationData] Synced ${conv.conversation_id}: recording=${!!recordingUrl}, transcript=${transcript?.length || 0} msgs, sentiment=${sentiment}`);
}

async function fetchElevenLabsConversation(conversationId, apiKey) {
  try {
    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/conversations/${conversationId}`, {
      headers: { 'xi-api-key': apiKey },
    });

    if (response.status === 404) {
      logger.info(`[SyncConversationData] Conversation ${conversationId} not found in ElevenLabs (expired)`);
      return null;
    }

    if (!response.ok) {
      throw new Error(`ElevenLabs API ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  } catch (error) {
    if (error.message?.includes('404')) return null;
    throw error;
  }
}

function extractTranscript(elevenLabsData) {
  // ElevenLabs returns transcript in different formats depending on the API version
  if (elevenLabsData.transcript && Array.isArray(elevenLabsData.transcript)) {
    return elevenLabsData.transcript.map(msg => ({
      role: msg.role === 'agent' ? 'assistant' : 'user',
      content: msg.message || msg.text || msg.content || '',
      timestamp: msg.timestamp || msg.time_in_call_secs || null,
    }));
  }

  // Alternative format: messages array
  if (elevenLabsData.messages && Array.isArray(elevenLabsData.messages)) {
    return elevenLabsData.messages.map(msg => ({
      role: msg.role === 'agent' ? 'assistant' : 'user',
      content: msg.message || msg.text || msg.content || '',
      timestamp: msg.timestamp || null,
    }));
  }

  return [];
}

async function generateSummaryAndSentiment(transcript) {
  try {
    const { getAIClient, AI_MODEL_FAST } = require('../_lib/ai-client');
    const client = getAIClient();

    const transcriptText = transcript
      .map(m => `${m.role === 'user' ? 'Customer' : 'Agent'}: ${m.content}`)
      .join('\n');

    // Truncate if too long (keep under 2000 chars for cost)
    const truncated = transcriptText.length > 2000
      ? transcriptText.substring(0, 2000) + '...[truncated]'
      : transcriptText;

    const response = await client.messages.create({
      model: AI_MODEL_FAST,
      max_tokens: 200,
      system: 'You analyze restaurant phone call transcripts. Respond with JSON only.',
      messages: [{
        role: 'user',
        content: `Analyze this restaurant call transcript. Return JSON with:
- "summary": 2-3 sentence summary of what happened
- "sentiment": one of "positive", "neutral", "negative"

Transcript:
${truncated}`
      }],
    });

    const text = response.content?.[0]?.text || response.choices?.[0]?.message?.content || '';

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || null,
        sentiment: ['positive', 'neutral', 'negative'].includes(parsed.sentiment)
          ? parsed.sentiment
          : 'neutral',
      };
    }

    return { summary: text.substring(0, 500), sentiment: 'neutral' };
  } catch (error) {
    logger.error('[SyncConversationData] AI analysis failed:', error.message);
    return { summary: null, sentiment: null };
  }
}
