const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { createSecureLogger } = require('./_lib/secure-logger');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const fetch = require('node-fetch');
const {
  getAgentIdForRestaurant,
  enableVersioning,
  createBranch,
  deployTrafficSplit,
  deleteBranch,
  getBranchConversationCount,
} = require('./services/elevenlabsAgentService');

const logger = createSecureLogger('voice-experiments');

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1/convai';
const VALID_VARIANT_KEYS = ['agent_name', 'agent_greeting', 'speed', 'voice_id'];

module.exports = async (req, res) => {
  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  const { action } = req.query || {};

  if (req.method === 'GET' && action === 'current') return handleGetCurrent(req, res);
  if (req.method === 'POST' && action === 'create') return handleCreate(req, res);
  if (req.method === 'POST' && action === 'promote') return handlePromote(req, res);
  if (req.method === 'POST' && action === 'rollback') return handleRollback(req, res);

  return res.status(405).json({ error: 'Method or action not allowed' });
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function authenticate(req) {
  const user = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
  if (!user?.restaurant_id) throw new Error('UNAUTHORIZED');
  return user;
}

async function getActiveExperiment(restaurantId) {
  const { data, error } = await supabaseAdmin
    .schema('restaurant')
    .from('voice_experiments')
    .select('id, restaurant_id, status, branch_id, branch_name, parent_version_id, variant_config, traffic_split, started_at, completed_at, result, created_at')
    .eq('restaurant_id', restaurantId)
    .in('status', ['draft', 'running'])
    .maybeSingle();

  if (error) throw new Error(`DB error: ${error.message}`);
  return data;
}

async function getAgentMainBranchId(agentId) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ElevenLabs API key not configured');

  const res = await fetch(`${ELEVENLABS_BASE}/agents/${encodeURIComponent(agentId)}`, {
    method: 'GET',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to GET agent: ${res.status} ${body.substring(0, 200)}`);
  }

  const data = await res.json();
  return data.main_branch_id || null;
}

function buildConversationConfigOverrides(variantConfig) {
  const overrides = {};

  if (variantConfig.voice_id) {
    overrides.tts = { ...overrides.tts, voice_id: variantConfig.voice_id };
  }
  if (variantConfig.speed !== undefined) {
    overrides.tts = { ...overrides.tts, speed: variantConfig.speed };
  }

  // agent_name and agent_greeting affect the system prompt — pass them as agent overrides
  // so ElevenLabs uses them in the branch's conversation config
  if (variantConfig.agent_name || variantConfig.agent_greeting) {
    overrides.agent = {};
    if (variantConfig.agent_name) {
      overrides.agent.name = variantConfig.agent_name;
    }
    if (variantConfig.agent_greeting) {
      overrides.agent.first_message = variantConfig.agent_greeting;
    }
  }

  return overrides;
}

// ---------------------------------------------------------------------------
// GET ?action=current
// ---------------------------------------------------------------------------

async function handleGetCurrent(req, res) {
  try {
    const user = await authenticate(req);
    const restaurantId = user.restaurant_id;

    const experiment = await getActiveExperiment(restaurantId);

    if (!experiment) {
      return res.json({ success: true, experiment: null });
    }

    // If running, fetch live conversation counts
    let controlCount = null;
    let variantCount = null;

    if (experiment.status === 'running' && experiment.branch_id) {
      const agentId = await getAgentIdForRestaurant(restaurantId);
      if (agentId) {
        const sinceDate = experiment.started_at || experiment.created_at;
        const mainBranchId = await getAgentMainBranchId(agentId);

        const [controlResult, variantResult] = await Promise.all([
          mainBranchId
            ? getBranchConversationCount(agentId, mainBranchId, sinceDate)
            : Promise.resolve({ success: false }),
          getBranchConversationCount(agentId, experiment.branch_id, sinceDate),
        ]);

        controlCount = controlResult.success ? controlResult.count : null;
        variantCount = variantResult.success ? variantResult.count : null;
      }
    }

    return res.json({
      success: true,
      experiment: {
        ...experiment,
        control_count: controlCount,
        variant_count: variantCount,
      },
    });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Authentication required' });
    logger.error('voice-experiments GET current error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}

// ---------------------------------------------------------------------------
// POST ?action=create
// ---------------------------------------------------------------------------

async function handleCreate(req, res) {
  try {
    const user = await authenticate(req);
    const restaurantId = user.restaurant_id;
    const { branch_name, variant_config, traffic_split } = req.body || {};

    // Validate branch_name
    if (!branch_name || typeof branch_name !== 'string' || branch_name.length > 50) {
      return res.status(400).json({ error: 'branch_name is required (string, max 50 chars)' });
    }

    // Validate variant_config
    if (!variant_config || typeof variant_config !== 'object' || Array.isArray(variant_config)) {
      return res.status(400).json({ error: 'variant_config must be an object' });
    }
    const configKeys = Object.keys(variant_config);
    const hasValidKey = configKeys.some(k => VALID_VARIANT_KEYS.includes(k));
    if (!hasValidKey) {
      return res.status(400).json({
        error: `variant_config must include at least one of: ${VALID_VARIANT_KEYS.join(', ')}`,
      });
    }

    // Validate traffic_split
    const split = traffic_split !== undefined ? Number(traffic_split) : 10;
    if (!Number.isInteger(split) || split < 1 || split > 50) {
      return res.status(400).json({ error: 'traffic_split must be an integer between 1 and 50' });
    }

    // Check no active experiment
    const existing = await getActiveExperiment(restaurantId);
    if (existing) {
      return res.status(409).json({ error: 'An active experiment already exists. Promote or rollback first.' });
    }

    // Step 1: Get agent ID
    const agentId = await getAgentIdForRestaurant(restaurantId);
    if (!agentId) {
      return res.status(400).json({ error: 'No voice agent provisioned for this restaurant' });
    }

    // Step 2: Enable versioning
    const versionResult = await enableVersioning(agentId);
    if (!versionResult.success) {
      return res.status(502).json({ error: `Failed to enable versioning: ${versionResult.error}` });
    }
    const currentVersionId = versionResult.current_version_id;

    // Step 3: Build conversation_config overrides
    const overrides = buildConversationConfigOverrides(variant_config);

    // Step 4: Create branch
    const branchResult = await createBranch(agentId, currentVersionId, branch_name, overrides);
    if (!branchResult.success) {
      return res.status(502).json({ error: `Failed to create branch: ${branchResult.error}` });
    }
    const branchId = branchResult.branch_id;

    // Step 5: Get main branch ID
    const mainBranchId = await getAgentMainBranchId(agentId);
    if (!mainBranchId) {
      // Clean up: delete the branch we just created
      await deleteBranch(agentId, branchId);
      return res.status(502).json({ error: 'Could not determine main branch ID' });
    }

    // Step 6: Deploy traffic split
    const deployResult = await deployTrafficSplit(agentId, mainBranchId, branchId, split);
    if (!deployResult.success) {
      await deleteBranch(agentId, branchId);
      return res.status(502).json({ error: `Failed to deploy traffic split: ${deployResult.error}` });
    }

    // Step 7: Insert into DB
    const { data: experiment, error: insertError } = await supabaseAdmin
      .schema('restaurant')
      .from('voice_experiments')
      .insert({
        restaurant_id: restaurantId,
        status: 'running',
        branch_id: branchId,
        branch_name,
        parent_version_id: currentVersionId,
        variant_config,
        traffic_split: split,
        started_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (insertError) {
      // Clean up ElevenLabs resources
      await deployTrafficSplit(agentId, mainBranchId, mainBranchId, 0);
      await deleteBranch(agentId, branchId);
      throw new Error(`DB insert error: ${insertError.message}`);
    }

    logger.info('Voice experiment created', { restaurantId, branchId, branch_name, split });
    return res.json({ success: true, experiment });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Authentication required' });
    logger.error('voice-experiments create error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}

// ---------------------------------------------------------------------------
// POST ?action=promote
// ---------------------------------------------------------------------------

async function handlePromote(req, res) {
  try {
    const user = await authenticate(req);
    const restaurantId = user.restaurant_id;

    const experiment = await getActiveExperiment(restaurantId);
    if (!experiment || experiment.status !== 'running') {
      return res.status(404).json({ error: 'No running experiment found' });
    }

    const agentId = await getAgentIdForRestaurant(restaurantId);
    if (!agentId) {
      return res.status(400).json({ error: 'No voice agent provisioned' });
    }

    // Apply variant_config to main agent config
    const variantConfig = experiment.variant_config || {};
    const configUpdates = {};
    if (variantConfig.agent_name !== undefined) configUpdates.agent_name = variantConfig.agent_name;
    if (variantConfig.agent_greeting !== undefined) configUpdates.agent_greeting = variantConfig.agent_greeting;

    if (Object.keys(configUpdates).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .update(configUpdates)
        .eq('id', restaurantId);

      if (updateError) {
        logger.error('Failed to apply variant config to restaurant_config', { restaurantId, error: updateError.message });
      }
    }

    // Deploy 100% to main branch
    const mainBranchId = await getAgentMainBranchId(agentId);
    if (mainBranchId) {
      await deployTrafficSplit(agentId, mainBranchId, experiment.branch_id, 0);
    }

    // Delete variant branch
    await deleteBranch(agentId, experiment.branch_id);

    // Update experiment in DB
    const { data: updated, error: dbError } = await supabaseAdmin
      .schema('restaurant')
      .from('voice_experiments')
      .update({
        status: 'promoted',
        completed_at: new Date().toISOString(),
        result: { winner: 'variant' },
      })
      .eq('id', experiment.id)
      .select('*')
      .single();

    if (dbError) throw new Error(`DB update error: ${dbError.message}`);

    logger.info('Voice experiment promoted', { restaurantId, experimentId: experiment.id });
    return res.json({ success: true, experiment: updated });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Authentication required' });
    logger.error('voice-experiments promote error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}

// ---------------------------------------------------------------------------
// POST ?action=rollback
// ---------------------------------------------------------------------------

async function handleRollback(req, res) {
  try {
    const user = await authenticate(req);
    const restaurantId = user.restaurant_id;

    const experiment = await getActiveExperiment(restaurantId);
    if (!experiment || experiment.status !== 'running') {
      return res.status(404).json({ error: 'No running experiment found' });
    }

    const agentId = await getAgentIdForRestaurant(restaurantId);
    if (!agentId) {
      return res.status(400).json({ error: 'No voice agent provisioned' });
    }

    // Deploy 100% to main branch (set variant to 0%)
    const mainBranchId = await getAgentMainBranchId(agentId);
    if (mainBranchId) {
      await deployTrafficSplit(agentId, mainBranchId, experiment.branch_id, 0);
    }

    // Delete variant branch
    await deleteBranch(agentId, experiment.branch_id);

    // Update experiment in DB
    const { data: updated, error: dbError } = await supabaseAdmin
      .schema('restaurant')
      .from('voice_experiments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        result: { winner: 'control' },
      })
      .eq('id', experiment.id)
      .select('*')
      .single();

    if (dbError) throw new Error(`DB update error: ${dbError.message}`);

    logger.info('Voice experiment rolled back', { restaurantId, experimentId: experiment.id });
    return res.json({ success: true, experiment: updated });
  } catch (err) {
    if (err.message === 'UNAUTHORIZED') return res.status(401).json({ error: 'Authentication required' });
    logger.error('voice-experiments rollback error', { error: err.message });
    return res.status(500).json({ error: 'Internal error' });
  }
}
