/**
 * Manager Notes API
 *
 * REST endpoint for managers to teach the AI about guests and policies.
 * Creates high-importance memories that influence AI behavior.
 *
 * POST /api/manager-notes   - Add a manager note
 * GET  /api/manager-notes   - List all manager notes for the restaurant
 * DELETE /api/manager-notes  - Remove a manager note (soft delete)
 */

const { verifyAuth } = require('./_lib/auth');
const { setWebhookCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { createMemory, listMemories, deleteMemory } = require('./_services/guestMemory');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');

const logger = createSecureLogger('ManagerNotes');

module.exports = async (req, res) => {
  setWebhookCors(req, res);
  if (handlePreflight(req, res)) return;

  const rateLimited = await checkAndApplyRateLimit(req, res, 'manager_notes', 30, 60);
  if (rateLimited) return;

  // Authenticate
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ error: auth.error });
  }

  const restaurantId = auth.user.restaurant_id;
  if (!restaurantId) {
    return res.status(403).json({ message: 'No restaurant associated with your account.' });
  }

  try {
    switch (req.method) {
      case 'POST':
        return await handleCreate(req, res, restaurantId);
      case 'GET':
        return await handleList(req, res, restaurantId);
      case 'DELETE':
        return await handleDelete(req, res, restaurantId);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    logger.error('Manager notes error:', error.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

async function handleCreate(req, res, restaurantId) {
  const { guest_phone, content, note_type } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ message: 'Note content is required' });
  }

  const validNoteTypes = ['vip_instruction', 'general_policy', 'guest_preference'];
  const type = validNoteTypes.includes(note_type) ? note_type : 'vip_instruction';

  // Map note_type to memory_type
  const memoryType = type === 'general_policy' ? 'manager_note' : 'manager_note';

  // Manager notes get high importance (8-10)
  const importance = type === 'vip_instruction' ? 9 : type === 'general_policy' ? 8 : 7;

  // For general policies, use a sentinel phone number
  const phone = guest_phone || '__restaurant_policy__';

  const result = await createMemory(restaurantId, phone, {
    content: content.trim(),
    memoryType,
    importance,
    sourceType: 'manager_input',
    sourceId: null
  });

  if (!result) {
    return res.status(500).json({ message: 'Failed to create manager note' });
  }

  logger.info('Manager note created', {
    id: result.id,
    noteType: type,
    hasGuestPhone: !!guest_phone
  });

  return res.status(201).json({
    success: true,
    note: {
      id: result.id,
      content: result.content,
      type,
      guest_phone: guest_phone || null,
      importance: result.importance,
      created_at: result.created_at
    }
  });
}

async function handleList(req, res, restaurantId) {
  const { guest_phone, limit = 50 } = req.query;
  // EE.3 — clamp limit so a caller can't force a 999999-row scan of
  // manager_memory by passing an enormous limit query param.
  const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));

  const memories = await listMemories(
    restaurantId,
    guest_phone || null,
    'manager_note',
    safeLimit
  );

  return res.status(200).json({
    success: true,
    notes: memories.map(m => ({
      id: m.id,
      content: m.content,
      guest_phone: m.guest_phone === '__restaurant_policy__' ? null : m.guest_phone,
      importance: m.importance,
      is_policy: m.guest_phone === '__restaurant_policy__',
      created_at: m.created_at
    })),
    total: memories.length
  });
}

async function handleDelete(req, res, restaurantId) {
  const { id } = req.body || req.query;

  if (!id) {
    return res.status(400).json({ message: 'Note ID is required' });
  }

  const success = await deleteMemory(restaurantId, id);

  if (!success) {
    return res.status(500).json({ message: 'Failed to delete manager note' });
  }

  return res.status(200).json({ success: true, deleted: id });
}
