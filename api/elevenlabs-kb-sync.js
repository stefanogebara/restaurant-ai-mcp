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
const { buildKnowledgeDoc, loadKnowledgeBaseData } = require('./_lib/elevenlabs-knowledge-base');
const { verifyJWT, getRestaurantIdForUser } = require('./_lib/auth');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('elevenlabs-kb-sync');

const handler = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  if (await checkAndApplyRateLimit(req, res, 'api')) return;

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = await verifyJWT(token).catch(() => null);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const restaurantResult = await getRestaurantIdForUser(user.sub);
  const restaurantId = restaurantResult?.restaurantId || null;
  if (!restaurantId) {
    return res.status(400).json({ success: false, error: 'No restaurant associated with this account' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'ElevenLabs API key not configured' });
  }

  // agentId resolved from DB after config fetch (per-restaurant)

  try {
    const { config, managerFacts, menuItems } = await loadKnowledgeBaseData(restaurantId);
    const agentId = config.elevenlabs_agent_id;
    if (!agentId) {
      return res.status(400).json({ success: false, error: 'Agent not provisioned for this restaurant' });
    }
    const knowledgeDoc = buildKnowledgeDoc(config, managerFacts, menuItems);

    // Step 1: Delete old KB doc if one exists
    const oldDocId = config.elevenlabs_kb_doc_id;
    if (oldDocId) {
      try {
        const deleteRes = await fetch(`https://api.elevenlabs.io/v1/convai/knowledge-base/${encodeURIComponent(oldDocId)}`, {
          method: 'DELETE',
          headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
        });
        if (deleteRes.ok) {
          logger.info('Deleted old KB doc', { restaurantId, oldDocId });
        } else if (deleteRes.status !== 404) {
          const body = await deleteRes.text();
          logger.error('Failed to delete old KB doc', { oldDocId, status: deleteRes.status, body: body.substring(0, 300) });
        }
      } catch (delErr) {
        logger.error('Error deleting old KB doc', { oldDocId, error: delErr.message });
        // Continue anyway
      }
    }

    // Step 2: Create new knowledge base document
    const docName = `${config.restaurant_name || 'Restaurant'} - Knowledge Base`;

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

    // Step 3: Link document to agent's knowledge base
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
              knowledge_base: [{ type: 'file', id: documentId, name: docName }],
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

    // Step 4: Save new KB doc ID to restaurant_config
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

    return res.json({
      success: true,
      document_id: documentId,
      document_length: knowledgeDoc.length,
    });
  } catch (err) {
    if (err.code === 'RESTAURANT_NOT_FOUND') return res.status(404).json({ success: false, error: 'Restaurant not found' });
    logger.error('KB sync error', { error: err.message });
    return res.status(500).json({ success: false, error: 'Internal error' });
  }
};

// Default export is the handler (Vercel serverless convention)
module.exports = handler;

// Retained for callers that previously imported the document builder directly.
// Backend services use the _lib module and must not import this handler.
module.exports.buildKnowledgeDoc = buildKnowledgeDoc;
