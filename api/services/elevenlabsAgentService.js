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

const fetch = require('node-fetch');
const { supabaseAdmin } = require('../_lib/supabase');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('ElevenLabsAgentService');

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1/convai';

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
 * 1. Check restaurant_config.elevenlabs_agent_id
 * 2. Fallback: check restaurant_info by restaurant_name
 * 3. If found only in restaurant_info, sync back to restaurant_config
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

    if (config.elevenlabs_agent_id) {
      return config.elevenlabs_agent_id;
    }

    // 2. Fallback: restaurant_info (legacy)
    if (!config.restaurant_name) {
      return null;
    }

    const { data: infoRow, error: infoError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_info')
      .select('elevenlabs_agent_id')
      .eq('restaurant_name', config.restaurant_name)
      .maybeSingle();

    if (infoError) {
      logger.error('Failed to fetch restaurant_info fallback', { restaurantId, error: infoError.message });
      return null;
    }

    if (!infoRow?.elevenlabs_agent_id) {
      return null;
    }

    // 3. Sync back to restaurant_config
    const { error: syncError } = await supabaseAdmin
      .schema('restaurant')
      .from('restaurant_config')
      .update({ elevenlabs_agent_id: infoRow.elevenlabs_agent_id })
      .eq('id', restaurantId);

    if (syncError) {
      logger.error('Failed to sync agent ID to restaurant_config', { restaurantId, error: syncError.message });
      // Still return the agent ID even if sync failed
    } else {
      logger.info('Synced agent ID from restaurant_info to restaurant_config', { restaurantId });
    }

    return infoRow.elevenlabs_agent_id;
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
        .select('restaurant_name, phone, email, address, city, country, restaurant_type, timezone, business_hours, avg_dining_duration_minutes, deposit_config, restaurant_profile, elevenlabs_kb_doc_id')
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
              knowledge_base: [{ type: 'file', id: documentId }],
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
        // Tools can be at conversation_config.agent.tools or similar
        const tools = agentData?.conversation_config?.agent?.tools || [];
        toolIds = tools
          .map(t => t.id)
          .filter(Boolean);
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

module.exports = {
  getAgentIdForRestaurant,
  syncKnowledgeBase,
  deleteAgent,
  enableVersioning,
  createBranch,
  deployTrafficSplit,
  deleteBranch,
  getBranchConversationCount,
};
