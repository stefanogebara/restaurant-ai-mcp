/**
 * ElevenLabs Knowledge Base Sync
 *
 * POST /api/elevenlabs-kb-sync
 * Body: { restaurant_id: string }
 *
 * Fetches restaurant profile + manager knowledge from the database,
 * formats it as a text document, and pushes it to the ElevenLabs
 * Conversational AI knowledge base so the voice agent has full context.
 *
 * Protected: JWT auth + rate limiting.
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { verifyJWT, getRestaurantId } = require('./_lib/auth');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('elevenlabs-kb-sync');

/**
 * Build a plain-text knowledge document from restaurant data.
 */
function buildKnowledgeDoc(config, managerFacts) {
  const profile = config.restaurant_profile || {};
  const lines = [];

  lines.push(`# ${config.restaurant_name || 'Restaurant'}`);
  lines.push('');

  // Basic info
  if (config.address) lines.push(`Address: ${config.address}`);
  if (config.phone) lines.push(`Phone: ${config.phone}`);
  if (config.email) lines.push(`Email: ${config.email}`);
  if (config.city || config.country) {
    lines.push(`Location: ${[config.city, config.country].filter(Boolean).join(', ')}`);
  }
  if (config.restaurant_type) lines.push(`Type: ${config.restaurant_type}`);
  if (config.timezone) lines.push(`Timezone: ${config.timezone}`);
  lines.push('');

  // Business hours
  if (config.business_hours) {
    lines.push('## Business Hours');
    if (typeof config.business_hours === 'object') {
      for (const [day, hours] of Object.entries(config.business_hours)) {
        lines.push(`- ${day}: ${typeof hours === 'string' ? hours : JSON.stringify(hours)}`);
      }
    } else {
      lines.push(String(config.business_hours));
    }
    lines.push('');
  }

  // Reservation policies
  if (config.avg_dining_duration_minutes) {
    lines.push(`Average dining duration: ${config.avg_dining_duration_minutes} minutes`);
  }
  if (config.deposit_config) {
    const dc = config.deposit_config;
    if (dc.enabled) {
      lines.push(`Deposit required: ${dc.type === 'per_person' ? `€${dc.amount} per person` : `€${dc.amount} flat`} for parties of ${dc.min_party_size}+`);
    }
  }
  lines.push('');

  // Persona / profile
  if (profile.persona_summary) {
    lines.push('## About');
    lines.push(profile.persona_summary);
    lines.push('');
  }

  if (profile.cuisine_identity) {
    const ci = profile.cuisine_identity;
    lines.push('## Cuisine');
    if (ci.primary_cuisine) lines.push(`Cuisine: ${ci.primary_cuisine}`);
    if (ci.style) lines.push(`Style: ${ci.style}`);
    if (ci.philosophy) lines.push(`Philosophy: ${ci.philosophy}`);
    if (ci.influences?.length) lines.push(`Influences: ${ci.influences.join(', ')}`);
    lines.push('');
  }

  if (profile.atmosphere) {
    const atm = profile.atmosphere;
    lines.push('## Atmosphere');
    if (atm.vibe) lines.push(`Vibe: ${atm.vibe}`);
    if (atm.description) lines.push(atm.description);
    if (atm.dress_code) lines.push(`Dress code: ${atm.dress_code}`);
    if (atm.music) lines.push(`Music: ${atm.music}`);
    lines.push('');
  }

  if (profile.signature_dishes?.length) {
    lines.push('## Signature Dishes');
    for (const dish of profile.signature_dishes) {
      lines.push(`- **${dish.name}**: ${dish.description || ''}${dish.why_special ? ` (${dish.why_special})` : ''}`);
    }
    lines.push('');
  }

  if (profile.guest_experience) {
    const ge = profile.guest_experience;
    lines.push('## Guest Experience');
    if (ge.promise) lines.push(`Promise: ${ge.promise}`);
    if (ge.special_occasions) lines.push(`Special occasions: ${ge.special_occasions}`);
    if (ge.dietary_accommodations) lines.push(`Dietary accommodations: ${ge.dietary_accommodations}`);
    lines.push('');
  }

  if (profile.unique_differentiators?.length) {
    lines.push('## What Makes Us Special');
    for (const d of profile.unique_differentiators) {
      lines.push(`- ${d}`);
    }
    lines.push('');
  }

  if (profile.things_to_know?.length) {
    lines.push('## Important Facts');
    for (const fact of profile.things_to_know) {
      lines.push(`- ${fact}`);
    }
    lines.push('');
  }

  // Manager knowledge (extracted from documents + learned facts)
  if (managerFacts.length > 0) {
    lines.push('## Additional Knowledge');
    for (const fact of managerFacts) {
      lines.push(`- ${fact.content}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = await verifyJWT(token).catch(() => null);
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const restaurantId = getRestaurantId(user);
  if (!restaurantId) {
    return res.status(400).json({ success: false, error: 'No restaurant associated with this account' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'ElevenLabs API key not configured' });
  }

  const agentId = process.env.VITE_ELEVENLABS_AGENT_ID;
  if (!agentId) {
    return res.status(500).json({ success: false, error: 'ElevenLabs agent not configured' });
  }

  try {
    // Fetch restaurant config + manager facts in parallel
    const [configResult, factsResult] = await Promise.all([
      supabaseAdmin
        .schema('restaurant')
        .from('restaurant_config')
        .select('restaurant_name, phone, email, address, city, country, restaurant_type, timezone, business_hours, avg_dining_duration_minutes, deposit_config, restaurant_profile')
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
      logger.error('Failed to fetch restaurant config', configResult.error?.message);
      return res.status(404).json({ success: false, error: 'Restaurant not found' });
    }

    const knowledgeDoc = buildKnowledgeDoc(configResult.data, factsResult.data || []);

    // Step 1: Create (or update) knowledge base document
    const docName = `${configResult.data.restaurant_name || 'Restaurant'} - Knowledge Base`;

    const createResponse = await fetch('https://api.elevenlabs.io/v1/convai/knowledge-base/text', {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: docName,
        text: knowledgeDoc,
      }),
    });

    if (!createResponse.ok) {
      const body = await createResponse.text();
      logger.error('ElevenLabs KB create failed', { status: createResponse.status, body: body.substring(0, 300) });
      return res.status(502).json({ success: false, error: 'Failed to create knowledge base document' });
    }

    const docData = await createResponse.json();
    const documentId = docData.id;

    // Step 2: Link document to agent's knowledge base
    const patchResponse = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
      method: 'PATCH',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
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
      logger.error('ElevenLabs agent PATCH failed', { status: patchResponse.status, body: body.substring(0, 300) });
      return res.status(502).json({ success: false, error: 'Failed to link knowledge base to agent' });
    }

    logger.info('KB synced to ElevenLabs', { restaurantId, documentId, docLength: knowledgeDoc.length });

    return res.json({
      success: true,
      document_id: documentId,
      document_length: knowledgeDoc.length,
    });
  } catch (err) {
    logger.error('KB sync error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
};
