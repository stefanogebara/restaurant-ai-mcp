/**
 * ElevenLabs Agent Deployment & Branching
 *
 * Voice A/B testing helpers — branch creation, traffic splits, and
 * conversation counting for ElevenLabs conversational AI agents.
 *
 * Split from elevenlabsAgentService.js for file-size hygiene.
 */

const fetch = require('node-fetch');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('ElevenLabsAgentDeploy');

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
  enableVersioning,
  createBranch,
  deployTrafficSplit,
  deleteBranch,
  getBranchConversationCount,
};
