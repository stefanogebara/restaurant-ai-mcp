const { getAllTables } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { suggestTable } = require('./services/tableAssignmentService');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('TableSuggestion');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({
      success: false,
      error: authResult.error,
    });
  }
  req.user = authResult.user;

  const restaurantId = req.user.restaurant_id;
  const { party_size } = req.query;

  if (!party_size) {
    return res.status(400).json({
      success: false,
      error: 'Missing required query parameter: party_size',
    });
  }

  const parsedSize = parseInt(party_size, 10);
  if (isNaN(parsedSize) || parsedSize < 1 || parsedSize > 20) {
    return res.status(400).json({
      success: false,
      error: 'party_size must be between 1 and 20',
    });
  }

  try {
    const tablesResult = await getAllTables(restaurantId);
    if (!tablesResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to load tables',
      });
    }

    const suggestion = suggestTable(tablesResult.tables, parsedSize);

    if (!suggestion) {
      return res.status(200).json({
        success: true,
        suggestion: null,
        message: `No available table can accommodate a party of ${parsedSize}`,
      });
    }

    return res.status(200).json({
      success: true,
      suggestion: {
        suggested_table_id: suggestion.suggested_table_id,
        table_name: suggestion.table_name,
        reasoning: suggestion.reasoning,
        score: suggestion.score,
      },
    });
  } catch (error) {
    logger.error('Table suggestion error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate table suggestion',
    });
  }
};
