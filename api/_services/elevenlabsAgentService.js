/**
 * ElevenLabs Agent Service
 *
 * Consolidated service for ElevenLabs agent lifecycle operations:
 * - getAgentIdForRestaurant(restaurantId)
 * - syncKnowledgeBase(restaurantId)
 * - deleteAgent(restaurantId)
 *
 * All functions return { success, error?, ... } objects — never throw.
 */

const crypto = require('node:crypto');
const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');
const { buildPersonaPrompt } = require('../_lib/persona-prompt-builder');
const { validateElevenLabsVoiceId } = require('../_lib/validation');

const logger = createSecureLogger('ElevenLabsAgentService');

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1/convai';

/**
 * Get (or lazily create) the per-restaurant webhook secret embedded in
 * this restaurant's ElevenLabs agent tool definitions.
 *
 * SECURITY: tool request_headers are stored on ElevenLabs's servers, so
 * whatever Bearer token we put there is held by a third party. It must
 * therefore be (a) NOT a shared internal credential like CRON_SECRET,
 * and (b) tenant-scoped so a leak only exposes one restaurant.
 * api/elevenlabs-webhook.js validates this secret against the
 * restaurant_id the tool call claims.
 *
 * @param {string} restaurantId - restaurant_config UUID
 * @returns {Promise<string|null>} the secret, or null on error / missing id
 */
async function getOrCreateWebhookSecret(restaurantId) {
  if (!restaurantId) return null;
  try {
    const { data: row, error: readError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('elevenlabs_webhook_secret')
      .eq('id', restaurantId)
      .maybeSingle();
    if (readError) {
      logger.error('webhook secret read failed', { restaurantId, error: readError.message });
      return null;
    }
    if (row?.elevenlabs_webhook_secret) return row.elevenlabs_webhook_secret;

    const secret = `el_whsec_${crypto.randomBytes(32).toString('hex')}`;
    const { error: writeError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .update({ elevenlabs_webhook_secret: secret })
      .eq('id', restaurantId)
      .is('elevenlabs_webhook_secret', null); // don't clobber a concurrent writer
    if (writeError) {
      logger.error('webhook secret write failed', { restaurantId, error: writeError.message });
      return null;
    }
    // Re-read in case a concurrent request won the race above.
    const { data: confirmed } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('elevenlabs_webhook_secret')
      .eq('id', restaurantId)
      .maybeSingle();
    return confirmed?.elevenlabs_webhook_secret || secret;
  } catch (err) {
    logger.error('getOrCreateWebhookSecret error', { restaurantId, error: err.message });
    return null;
  }
}

/**
 * Get the ElevenLabs API key from environment.
 * @returns {string|null}
 */
function getApiKey() {
  return process.env.ELEVENLABS_API_KEY || null;
}

/**
 * Standard headers for ElevenLabs API calls.
 * @param {string} apiKey
 * @returns {object}
 */
function elevenLabsHeaders(apiKey) {
  return {
    'xi-api-key': apiKey,
    'Content-Type': 'application/json',
  };
}

/**
 * Resolve the ElevenLabs agent ID for a restaurant.
 *
 * Fonte única: restaurant_config.elevenlabs_agent_id.
 *
 * Havia um fallback que procurava em restaurant_info POR NOME e sincronizava de
 * volta. Removido em 02/08/2026 junto com a aposentadoria da tabela. Dois
 * motivos, e o segundo é o que pesa:
 *   - restaurant_info está vazia; o fallback só podia devolver null.
 *   - casar restaurante por `restaurant_name` é frágil num sistema multi-tenant:
 *     dois clientes com o mesmo nome trocariam de agente de voz entre si.
 *
 * @param {string} restaurantId - UUID of the restaurant
 * @returns {Promise<string|null>} Agent ID or null
 */
async function getAgentIdForRestaurant(restaurantId) {
  try {
    // 1. Primary: restaurant_config
    const { data: config, error: configError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('elevenlabs_agent_id, restaurant_name')
      .eq('id', restaurantId)
      .maybeSingle();

    if (configError) {
      logger.error('Failed to fetch restaurant_config', { restaurantId, error: configError.message });
      return null;
    }

    if (!config) {
      logger.info('No restaurant_config found', { restaurantId });
      return null;
    }

    return config.elevenlabs_agent_id || null;
  } catch (err) {
    logger.error('getAgentIdForRestaurant error', { restaurantId, error: err.message });
    return null;
  }
}

/**
 * Sync the knowledge base document for a restaurant's ElevenLabs agent.
 *
 * - Resolves agent ID via getAgentIdForRestaurant
 * - Builds knowledge doc from restaurant config + manager memory
 * - Deletes old KB doc if one exists
 * - Creates new KB doc and links to agent
 * - Saves new elevenlabs_kb_doc_id to restaurant_config
 *
 * @param {string} restaurantId
 * @returns {Promise<{success: boolean, documentId?: string, documentLength?: number, error?: string}>}
 */
async function syncKnowledgeBase(restaurantId) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return { success: false, error: 'ElevenLabs API key not configured' };
    }

    const agentId = await getAgentIdForRestaurant(restaurantId);
    if (!agentId) {
      return { success: false, error: 'Agent not provisioned' };
    }

    // Fetch restaurant config + manager facts in parallel
    const [configResult, factsResult] = await Promise.all([
      supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('restaurant_name, phone, email, city, country, restaurant_type, timezone, business_hours, average_dining_duration_minutes, deposit_config, ai_personality, agent_greeting, persona_prompt_override, elevenlabs_kb_doc_id')
        .eq('id', restaurantId)
        .single(),
      supabaseAdmin
        .from('manager_memory')
        .select('content')
        .eq('restaurant_id', restaurantId)
        .eq('type', 'fact')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (configResult.error || !configResult.data) {
      logger.error('Failed to fetch restaurant config for KB sync', { restaurantId, error: configResult.error?.message });
      return { success: false, error: 'Restaurant not found' };
    }

    // Import buildKnowledgeDoc from elevenlabs-kb-sync
    const { buildKnowledgeDoc } = require('../elevenlabs-kb-sync');
    const knowledgeDoc = buildKnowledgeDoc(configResult.data, factsResult.data || []);
    const docName = `${configResult.data.restaurant_name || 'Restaurant'} - Knowledge Base`;

    // Delete old KB doc if it exists
    const oldDocId = configResult.data.elevenlabs_kb_doc_id;
    if (oldDocId) {
      try {
        const deleteRes = await fetch(`${ELEVENLABS_BASE}/knowledge-base/${encodeURIComponent(oldDocId)}`, {
          method: 'DELETE',
          headers: elevenLabsHeaders(apiKey),
        });
        if (deleteRes.ok) {
          logger.info('Deleted old KB doc', { restaurantId, oldDocId });
        } else if (deleteRes.status !== 404) {
          const body = await deleteRes.text();
          logger.error('Failed to delete old KB doc', { restaurantId, oldDocId, status: deleteRes.status, body: body.substring(0, 300) });
        }
        // 404 is fine — doc already gone
      } catch (delErr) {
        logger.error('Error deleting old KB doc', { restaurantId, error: delErr.message });
        // Continue anyway
      }
    }

    // Create new KB doc
    const createResponse = await fetch(`${ELEVENLABS_BASE}/knowledge-base/text`, {
      method: 'POST',
      headers: elevenLabsHeaders(apiKey),
      body: JSON.stringify({ name: docName, text: knowledgeDoc }),
    });

    if (!createResponse.ok) {
      const body = await createResponse.text();
      logger.error('ElevenLabs KB create failed', { restaurantId, status: createResponse.status, body: body.substring(0, 300) });
      return { success: false, error: 'Failed to create knowledge base document' };
    }

    const docData = await createResponse.json();
    const documentId = docData.id;

    // Link document to agent
    const patchResponse = await fetch(`${ELEVENLABS_BASE}/agents/${encodeURIComponent(agentId)}`, {
      method: 'PATCH',
      headers: elevenLabsHeaders(apiKey),
      body: JSON.stringify({
        conversation_config: {
          agent: {
            prompt: {
              knowledge_base: [{ type: 'file', id: documentId, name: docName }],
            },
          },
        },
      }),
    });

    if (!patchResponse.ok) {
      const body = await patchResponse.text();
      logger.error('ElevenLabs agent PATCH failed', { restaurantId, agentId, status: patchResponse.status, body: body.substring(0, 300) });
      return { success: false, error: 'Failed to link knowledge base to agent' };
    }

    // Save new KB doc ID to restaurant_config
    const { error: saveError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .update({ elevenlabs_kb_doc_id: documentId })
      .eq('id', restaurantId);

    if (saveError) {
      logger.error('Failed to save KB doc ID to restaurant_config', { restaurantId, error: saveError.message });
      // Non-fatal — KB is already synced
    }

    logger.info('KB synced to ElevenLabs', { restaurantId, documentId, docLength: knowledgeDoc.length });

    return { success: true, documentId, documentLength: knowledgeDoc.length };
  } catch (err) {
    logger.error('syncKnowledgeBase error', { restaurantId, error: err.message });
    return { success: false, error: 'Internal error during KB sync' };
  }
}

/**
 * Delete a restaurant's ElevenLabs agent and all associated resources.
 *
 * - Fetches agent config from DB
 * - GETs agent config from ElevenLabs to find tool_ids
 * - Deletes each tool, KB doc, and the agent itself
 * - Clears elevenlabs_agent_id and elevenlabs_kb_doc_id from DB
 *
 * @param {string} restaurantId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteAgent(restaurantId) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return { success: false, error: 'ElevenLabs API key not configured' };
    }

    // Fetch agent info from DB
    const { data: config, error: configError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .select('elevenlabs_agent_id, elevenlabs_kb_doc_id')
      .eq('id', restaurantId)
      .maybeSingle();

    if (configError) {
      logger.error('Failed to fetch restaurant_config for deletion', { restaurantId, error: configError.message });
      return { success: false, error: 'Database error' };
    }

    if (!config?.elevenlabs_agent_id) {
      logger.info('No agent to delete', { restaurantId });
      return { success: true };
    }

    const agentId = config.elevenlabs_agent_id;
    const kbDocId = config.elevenlabs_kb_doc_id;

    // GET agent config from ElevenLabs to find tool_ids
    let toolIds = [];
    try {
      const agentRes = await fetch(`${ELEVENLABS_BASE}/agents/${encodeURIComponent(agentId)}`, {
        method: 'GET',
        headers: elevenLabsHeaders(apiKey),
      });

      if (agentRes.ok) {
        const agentData = await agentRes.json();
        const agentCfg = agentData?.conversation_config?.agent;
        // createAgent grava os ids em prompt.tool_ids (ver createAgent abaixo:
        // `prompt: { ..., tool_ids: toolIds }`). Este código lia só
        // `agent.tools` — caminho DIFERENTE, sempre undefined — então a lista
        // saía vazia e o loop de DELETE nunca rodava. Como o cron diário de
        // limpeza de demos chama deleteAgent, cada demo expirado deixava seus
        // webhook tools órfãos na conta, silenciosamente (a função "funcionava":
        // apagava o agente e não errava).
        //
        // Lê os DOIS: `tool_ids` é o que gravamos hoje; `tools` cobre agentes
        // criados por versões anteriores, cujo shape não conhecemos.
        const idsDoPrompt = Array.isArray(agentCfg?.prompt?.tool_ids)
          ? agentCfg.prompt.tool_ids : [];
        const idsLegado = Array.isArray(agentCfg?.tools)
          ? agentCfg.tools.map(t => t?.id) : [];
        toolIds = [...new Set([...idsDoPrompt, ...idsLegado])]
          .filter(id => typeof id === 'string' && id);
      } else {
        logger.error('Failed to GET agent config from ElevenLabs', { agentId, status: agentRes.status });
      }
    } catch (getErr) {
      logger.error('Error fetching agent config', { agentId, error: getErr.message });
    }

    // Delete each tool (ignore errors)
    for (const toolId of toolIds) {
      try {
        await fetch(`${ELEVENLABS_BASE}/tools/${encodeURIComponent(toolId)}`, {
          method: 'DELETE',
          headers: elevenLabsHeaders(apiKey),
        });
        logger.info('Deleted tool', { toolId, agentId });
      } catch (toolErr) {
        logger.error('Failed to delete tool', { toolId, error: toolErr.message });
      }
    }

    // Delete KB doc if exists
    if (kbDocId) {
      try {
        const kbRes = await fetch(`${ELEVENLABS_BASE}/knowledge-base/${encodeURIComponent(kbDocId)}`, {
          method: 'DELETE',
          headers: elevenLabsHeaders(apiKey),
        });
        if (kbRes.ok || kbRes.status === 404) {
          logger.info('Deleted KB doc', { kbDocId });
        } else {
          logger.error('Failed to delete KB doc', { kbDocId, status: kbRes.status });
        }
      } catch (kbErr) {
        logger.error('Error deleting KB doc', { kbDocId, error: kbErr.message });
      }
    }

    // Delete the agent itself
    try {
      const delRes = await fetch(`${ELEVENLABS_BASE}/agents/${encodeURIComponent(agentId)}`, {
        method: 'DELETE',
        headers: elevenLabsHeaders(apiKey),
      });
      if (!delRes.ok && delRes.status !== 404) {
        const body = await delRes.text();
        logger.error('Failed to delete agent', { agentId, status: delRes.status, body: body.substring(0, 300) });
        return { success: false, error: 'Failed to delete agent from ElevenLabs' };
      }
      logger.info('Deleted agent', { agentId });
    } catch (delErr) {
      logger.error('Error deleting agent', { agentId, error: delErr.message });
      return { success: false, error: 'Error deleting agent from ElevenLabs' };
    }

    // Clear agent references from DB
    const { error: clearError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .update({ elevenlabs_agent_id: null, elevenlabs_kb_doc_id: null })
      .eq('id', restaurantId);

    if (clearError) {
      logger.error('Failed to clear agent IDs from restaurant_config', { restaurantId, error: clearError.message });
      // Agent is already deleted — this is non-fatal
    }

    logger.info('Agent fully deleted', { restaurantId, agentId });
    return { success: true };
  } catch (err) {
    logger.error('deleteAgent error', { restaurantId, error: err.message });
    return { success: false, error: 'Internal error during agent deletion' };
  }
}

// ---------------------------------------------------------------------------
// Voice A/B Testing — Branch & Deployment helpers
// ---------------------------------------------------------------------------

/**
 * Enable versioning on an ElevenLabs agent (idempotent).
 *
 * @param {string} agentId - ElevenLabs agent ID
 * @returns {Promise<{success: boolean, current_version_id?: string, error?: string}>}
 */
async function enableVersioning(agentId) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return { success: false, error: 'ElevenLabs API key not configured' };
    }

    const res = await fetch(`${ELEVENLABS_BASE}/agents/${encodeURIComponent(agentId)}`, {
      method: 'PATCH',
      headers: elevenLabsHeaders(apiKey),
      body: JSON.stringify({ enable_versioning_if_not_enabled: true }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error('enableVersioning failed', { agentId, status: res.status, body: body.substring(0, 300) });
      return { success: false, error: `ElevenLabs API error ${res.status}` };
    }

    const data = await res.json();
    const currentVersionId = data.current_version_id || null;
    logger.info('Versioning enabled', { agentId, currentVersionId });
    return { success: true, current_version_id: currentVersionId };
  } catch (err) {
    logger.error('enableVersioning error', { agentId, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Create a branch on an ElevenLabs agent for A/B testing.
 *
 * @param {string} agentId
 * @param {string} parentVersionId - Version ID to branch from
 * @param {string} name - Branch name
 * @param {object} conversationConfigOverrides - Partial conversation_config overrides
 * @returns {Promise<{success: boolean, branch_id?: string, error?: string}>}
 */
async function createBranch(agentId, parentVersionId, name, conversationConfigOverrides) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return { success: false, error: 'ElevenLabs API key not configured' };
    }

    const res = await fetch(`${ELEVENLABS_BASE}/agents/${encodeURIComponent(agentId)}/branches`, {
      method: 'POST',
      headers: elevenLabsHeaders(apiKey),
      body: JSON.stringify({
        parent_version_id: parentVersionId,
        name,
        description: 'A/B test: ' + name,
        conversation_config: conversationConfigOverrides,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error('createBranch failed', { agentId, name, status: res.status, body: body.substring(0, 300) });
      return { success: false, error: `ElevenLabs API error ${res.status}` };
    }

    const data = await res.json();
    const branchId = data.branch_id || data.id || null;
    logger.info('Branch created', { agentId, branchId, name });
    return { success: true, branch_id: branchId };
  } catch (err) {
    logger.error('createBranch error', { agentId, name, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Deploy a traffic split between the main branch and a variant branch.
 *
 * @param {string} agentId
 * @param {string} mainBranchId
 * @param {string} variantBranchId
 * @param {number} variantPercentage - Traffic percentage for the variant (1-50)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deployTrafficSplit(agentId, mainBranchId, variantBranchId, variantPercentage) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return { success: false, error: 'ElevenLabs API key not configured' };
    }

    const res = await fetch(`${ELEVENLABS_BASE}/agents/${encodeURIComponent(agentId)}/deployments`, {
      method: 'POST',
      headers: elevenLabsHeaders(apiKey),
      body: JSON.stringify({
        branches: [
          { branch_id: mainBranchId, traffic_percentage: 100 - variantPercentage },
          { branch_id: variantBranchId, traffic_percentage: variantPercentage },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error('deployTrafficSplit failed', { agentId, status: res.status, body: body.substring(0, 300) });
      return { success: false, error: `ElevenLabs API error ${res.status}` };
    }

    logger.info('Traffic split deployed', { agentId, mainBranchId, variantBranchId, variantPercentage });
    return { success: true };
  } catch (err) {
    logger.error('deployTrafficSplit error', { agentId, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Delete a branch from an ElevenLabs agent.
 * Returns success even if the branch does not exist (idempotent).
 *
 * @param {string} agentId
 * @param {string} branchId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function deleteBranch(agentId, branchId) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return { success: false, error: 'ElevenLabs API key not configured' };
    }

    const res = await fetch(
      `${ELEVENLABS_BASE}/agents/${encodeURIComponent(agentId)}/branches/${encodeURIComponent(branchId)}`,
      {
        method: 'DELETE',
        headers: elevenLabsHeaders(apiKey),
      },
    );

    if (!res.ok && res.status !== 404) {
      const body = await res.text();
      logger.error('deleteBranch failed', { agentId, branchId, status: res.status, body: body.substring(0, 300) });
      return { success: false, error: `ElevenLabs API error ${res.status}` };
    }

    logger.info('Branch deleted', { agentId, branchId, alreadyGone: res.status === 404 });
    return { success: true };
  } catch (err) {
    logger.error('deleteBranch error', { agentId, branchId, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Get the number of conversations for a specific branch since a given date.
 *
 * @param {string} agentId
 * @param {string} branchId
 * @param {string} sinceDate - ISO 8601 date string
 * @returns {Promise<{success: boolean, count?: number, error?: string}>}
 */
async function getBranchConversationCount(agentId, branchId, sinceDate) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return { success: false, error: 'ElevenLabs API key not configured' };
    }

    const params = new URLSearchParams({
      agent_id: agentId,
      branch_id: branchId,
    });

    const res = await fetch(`https://api.elevenlabs.io/v1/convai/conversations?${params.toString()}`, {
      method: 'GET',
      headers: elevenLabsHeaders(apiKey),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error('getBranchConversationCount failed', { agentId, branchId, status: res.status, body: body.substring(0, 300) });
      return { success: false, error: `ElevenLabs API error ${res.status}` };
    }

    const data = await res.json();
    const conversations = Array.isArray(data.conversations) ? data.conversations : (Array.isArray(data) ? data : []);

    // Filter by sinceDate if provided
    let count = conversations.length;
    if (sinceDate) {
      const since = new Date(sinceDate).getTime();
      count = conversations.filter(c => {
        const createdAt = c.created_at || c.start_time || c.timestamp;
        return createdAt && new Date(createdAt).getTime() >= since;
      }).length;
    }

    logger.info('Branch conversation count', { agentId, branchId, count });
    return { success: true, count };
  } catch (err) {
    logger.error('getBranchConversationCount error', { agentId, branchId, error: err.message });
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Agent Creation — core logic (no HTTP/subscription guards)
// ---------------------------------------------------------------------------

/**
 * Build first message based on language and optional custom greeting.
 * @param {{ restaurant_name: string, language?: string, custom_greeting?: string }} opts
 * @returns {string}
 */
function buildFirstMessage({ restaurant_name, language = 'en', custom_greeting }) {
  if (custom_greeting) return custom_greeting;

  const greetings = {
    en: `Thank you for calling ${restaurant_name}. How may I help you today?`,
    es: `Gracias por llamar a ${restaurant_name}. ¿En qué puedo ayudarle hoy?`,
    fr: `Merci d'avoir appelé ${restaurant_name}. Comment puis-je vous aider aujourd'hui?`,
    it: `Grazie per aver chiamato ${restaurant_name}. Come posso aiutarla oggi?`,
    pt: `Obrigado por ligar para ${restaurant_name}. Como posso ajudá-lo hoje?`,
  };
  return greetings[language] || greetings.en;
}

/**
 * Build webhook tool definitions for a single-tenant agent.
 *
 * SECURITY: `webhookSecret` is the per-restaurant secret from
 * getOrCreateWebhookSecret — NEVER pass CRON_SECRET here. These headers
 * are stored on ElevenLabs's servers; a shared internal credential in
 * them means a third party holds it and any leak is cross-tenant.
 *
 * @param {string} baseUrl
 * @param {string} restaurantId - restaurant_config UUID
 * @param {string|null} webhookSecret - per-restaurant Bearer token
 * @returns {Array}
 */
function buildToolDefinitions(baseUrl, restaurantId, webhookSecret) {
  const rp = restaurantId ? `&restaurant_id=${restaurantId}` : '';
  const authHeaders = webhookSecret
    ? { Authorization: `Bearer ${webhookSecret}` }
    : {};

  return [
    {
      type: 'webhook', name: 'get_current_datetime',
      description: 'Get the current date and time. Use this at the start of conversations to know what "today" and "tomorrow" mean.',
      api_schema: { url: `${baseUrl}/api/elevenlabs-webhook?action=get_current_datetime`, method: 'GET', request_headers: authHeaders },
    },
    {
      type: 'webhook', name: 'check_availability',
      description: 'Check table availability for a specific date, time, and party size. Use this before creating a reservation to verify availability.',
      api_schema: {
        url: `${baseUrl}/api/elevenlabs-webhook?action=check_availability${rp}`, method: 'POST',
        content_type: 'application/json', request_headers: authHeaders,
        request_body_schema: { type: 'object', properties: {
          date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          time: { type: 'string', description: 'Time in HH:MM format' },
          party_size: { type: 'number', description: 'Number of guests' },
        }, required: ['date', 'time', 'party_size'] },
      },
    },
    {
      type: 'webhook', name: 'create_reservation',
      description: 'Create a new reservation after confirming all details with the customer.',
      api_schema: {
        url: `${baseUrl}/api/elevenlabs-webhook?action=create_reservation${rp}`, method: 'POST',
        content_type: 'application/json', request_headers: authHeaders,
        request_body_schema: { type: 'object', properties: {
          customer_name: { type: 'string', description: 'Full name' },
          customer_phone: { type: 'string', description: 'Phone number' },
          customer_email: { type: 'string', description: 'Email (optional)' },
          date: { type: 'string', description: 'Date YYYY-MM-DD' },
          time: { type: 'string', description: 'Time HH:MM' },
          party_size: { type: 'number', description: 'Number of guests' },
          special_requests: { type: 'string', description: 'Special requests (optional)' },
        }, required: ['customer_name', 'customer_phone', 'date', 'time', 'party_size'] },
      },
    },
    {
      type: 'webhook', name: 'lookup_reservation',
      description: 'Find an existing reservation by customer phone number or name.',
      api_schema: {
        url: `${baseUrl}/api/elevenlabs-webhook?action=lookup_reservation${rp}`, method: 'POST',
        content_type: 'application/json', request_headers: authHeaders,
        request_body_schema: { type: 'object', properties: {
          customer_phone: { type: 'string', description: 'Phone number for the reservation' },
          customer_name: { type: 'string', description: 'Name for the reservation (optional if phone provided)' },
        } },
      },
    },
    {
      type: 'webhook', name: 'cancel_reservation',
      description: 'Cancel an existing reservation by ID.',
      api_schema: {
        url: `${baseUrl}/api/elevenlabs-webhook?action=cancel_reservation${rp}`, method: 'POST',
        content_type: 'application/json', request_headers: authHeaders,
        request_body_schema: { type: 'object', properties: {
          reservation_id: { type: 'string', description: 'Reservation ID to cancel' },
        }, required: ['reservation_id'] },
      },
    },
    {
      type: 'webhook', name: 'modify_reservation',
      description: 'Change date, time, or party size of an existing reservation.',
      api_schema: {
        url: `${baseUrl}/api/elevenlabs-webhook?action=modify_reservation${rp}`, method: 'POST',
        content_type: 'application/json', request_headers: authHeaders,
        request_body_schema: { type: 'object', properties: {
          reservation_id: { type: 'string', description: 'Reservation ID to modify' },
          new_date: { type: 'string', description: 'New date YYYY-MM-DD (optional)' },
          new_time: { type: 'string', description: 'New time HH:MM (optional)' },
          new_party_size: { type: 'number', description: 'New party size (optional)' },
        }, required: ['reservation_id'] },
      },
    },
    {
      type: 'webhook', name: 'get_wait_time',
      description: 'Get current estimated wait time for walk-in customers.',
      api_schema: {
        url: `${baseUrl}/api/get-wait-time?${restaurantId ? `restaurant_id=${restaurantId}` : ''}`,
        method: 'GET', request_headers: authHeaders,
      },
    },
  ];
}

/**
 * Create tools via the ElevenLabs Tools API and return their IDs.
 * @param {Array} toolDefinitions
 * @param {string} apiKey
 * @returns {Promise<{toolIds: string[], errors: Array}>}
 */
async function createToolsViaAPI(toolDefinitions, apiKey) {
  const toolIds = [];
  const errors = [];

  for (const toolDef of toolDefinitions) {
    try {
      const res = await fetch(`${ELEVENLABS_BASE}/tools`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool_config: toolDef }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger.error(`Failed to create tool '${toolDef.name}'`, { error: errorText });
        errors.push({ tool: toolDef.name, error: errorText });
        continue;
      }

      const data = await res.json();
      const toolId = data.id || data.tool_id;
      if (toolId) {
        toolIds.push(toolId);
        logger.info(`Created tool '${toolDef.name}'`, { toolId });
      } else {
        errors.push({ tool: toolDef.name, error: 'No ID in response' });
      }
    } catch (err) {
      logger.error(`Error creating tool '${toolDef.name}'`, { error: err.message });
      errors.push({ tool: toolDef.name, error: err.message });
    }
  }

  return { toolIds, errors };
}

/**
 * Create a per-restaurant ElevenLabs conversational AI agent.
 *
 * This is the core creation logic — no HTTP or subscription guards.
 * Called from onboarding and from the elevenlabs-agent-create endpoint.
 *
 * @param {object} opts
 * @param {string} opts.restaurantId - restaurant_config UUID (used for tool webhooks + DB save)
 * @param {string} opts.restaurant_name
 * @param {string} opts.voice_id - ElevenLabs voice ID
 * @param {string} [opts.language='en']
 * @param {object} [opts.business_hours] - { monday: { isOpen, open, close }, ... }
 * @param {string} [opts.phone]
 * @param {string} [opts.address]
 * @param {string} [opts.custom_greeting]
 * @returns {Promise<{success: boolean, agent_id?: string, tools_created?: number, error?: string}>}
 */
async function createAgent({
  restaurantId,
  restaurant_name,
  voice_id,
  language = 'en',
  business_hours = {},
  phone,
  address,
  custom_greeting,
}) {
  try {
    const apiKey = getApiKey();
    if (!apiKey) {
      return { success: false, error: 'ElevenLabs API key not configured' };
    }

    if (!restaurant_name || !voice_id) {
      return { success: false, error: 'Missing required fields: restaurant_name, voice_id' };
    }

    // Validate voice_id format
    const voiceCheck = validateElevenLabsVoiceId(voice_id);
    if (!voiceCheck.valid) {
      return { success: false, error: voiceCheck.error };
    }

    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'https://seatable.one';

    // Build system prompt — try persona-aware prompt if config exists, else basic
    let systemPrompt;
    if (restaurantId) {
      const { data: restaurantConfig } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('id, restaurant_name, phone, city, country, address, business_hours, language, ai_config, agent_name, agent_greeting, voice_id, voice_engine, persona_prompt_override')
        .eq('id', restaurantId)
        .maybeSingle();

      const configForPrompt = restaurantConfig || {
        restaurant_name, phone, address, business_hours, language,
      };
      systemPrompt = buildPersonaPrompt(configForPrompt, { channel: 'voice' });
    } else {
      systemPrompt = buildPersonaPrompt(
        { restaurant_name, phone, address, business_hours, language },
        { channel: 'voice' },
      );
    }

    const firstMessage = buildFirstMessage({ restaurant_name, language, custom_greeting });

    // Create webhook tools — authenticated with a per-restaurant secret,
    // never CRON_SECRET (these headers live on ElevenLabs's servers).
    const webhookSecret = await getOrCreateWebhookSecret(restaurantId);
    if (restaurantId && !webhookSecret) {
      logger.warn('No webhook secret available — tools will be created without auth headers and the webhook will reject their calls', { restaurantId });
    }
    const toolDefs = buildToolDefinitions(baseUrl, restaurantId, webhookSecret);
    const { toolIds, errors: toolErrors } = await createToolsViaAPI(toolDefs, apiKey);

    if (toolIds.length === 0) {
      logger.error('Failed to create any tools', { toolErrors });
      return { success: false, error: 'Failed to create agent tools', details: toolErrors };
    }

    // Create agent
    const agentRes = await fetch(`${ELEVENLABS_BASE}/agents/create`, {
      method: 'POST',
      headers: elevenLabsHeaders(apiKey),
      body: JSON.stringify({
        name: `${restaurant_name} AI Host`,
        conversation_config: {
          agent: {
            prompt: { prompt: systemPrompt, llm: 'gpt-4o-mini', tool_ids: toolIds },
            first_message: firstMessage,
            language,
          },
          tts: { voice_id, model_id: language === 'en' ? 'eleven_flash_v2' : 'eleven_flash_v2_5' },
          conversation: {
            turn_timeout: 8,
            client_events: ['agent_response', 'agent_response_correction', 'user_transcript', 'internal_tentative_agent_response'],
          },
          asr: { quality: 'high', provider: 'elevenlabs' },
        },
        platform_settings: {
          // Todo campo daqui vai EXPLÍCITO, mesmo quando o valor coincide com o
          // default da ElevenLabs. Em 24/08/2026 ela virou mic_muting_enabled e
          // transcript_enabled de false para true, e como o repo não os enviava,
          // todo agente novo passou a nascer diferente sem que uma linha daqui
          // mudasse — invisível, porque o código continuava "funcionando".
          // Os valores abaixo são o comportamento com que o produto foi
          // construído e testado; ligar o transcript na demo é decisão de
          // produto, não default de fornecedor, e é uma linha para trocar.
          // Travado por api/__tests__/elevenlabs-agent-create-payload.test.js.
          widget_config: {
            avatar_url: 'https://seatable.one/logo.png',
            title: `${restaurant_name} AI Host`,
            mic_muting_enabled: false,
            transcript_enabled: false,
          },
        },
      }),
    });

    if (!agentRes.ok) {
      const errorText = await agentRes.text();
      logger.error('ElevenLabs agent creation failed', { status: agentRes.status, error: errorText });
      return { success: false, error: 'Failed to create agent at ElevenLabs' };
    }

    const agentData = await agentRes.json();
    const agentId = agentData.agent_id;

    logger.info('ElevenLabs agent created', { agentId, restaurantId, toolsCreated: toolIds.length });

    return { success: true, agent_id: agentId, tools_created: toolIds.length };
  } catch (err) {
    logger.error('createAgent error', { error: err.message, stack: err.stack });
    return { success: false, error: err.message };
  }
}

module.exports = {
  getAgentIdForRestaurant,
  getOrCreateWebhookSecret,
  buildToolDefinitions,
  createToolsViaAPI,
  syncKnowledgeBase,
  deleteAgent,
  createAgent,
  enableVersioning,
  createBranch,
  deployTrafficSplit,
  deleteBranch,
  getBranchConversationCount,
};
