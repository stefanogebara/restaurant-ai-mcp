const { setInternalCors, handlePreflight } = require('./_lib/cors');
const { verifyAuth } = require('./_lib/auth');
const { checkAndApplyRateLimit } = require('./_lib/rate-limit');
const { createSecureLogger } = require('./_lib/secure-logger');
const { softCheckSubscription } = require('./_lib/subscription-middleware');
const { initSentry, captureException } = require('./_lib/sentry');
initSentry();

// Dashboard action handlers (split into focused modules)
const { handleDashboard } = require('./_services/dashboard/stats');
const { handleCheckIn, handleCheckWalkIn, handleSeatParty, handleCompleteService } = require('./_services/dashboard/party-actions');
const { handleMarkTableClean, handleUpdateTableStatus } = require('./_services/dashboard/table-actions');
const { handleUpdateReservation, handleCancelReservation } = require('./_services/dashboard/reservation-actions');
const {
  handleUpdateTablePosition,
  handleUpdateTableProperties,
  handleLinkTables,
  handleUnlinkTables,
  handleDeleteTable,
  handleCreateTable,
  handleAutoAssignShapes
} = require('./_services/dashboard/floor-plan-actions');

const logger = createSecureLogger('HostDashboard');

module.exports = async (req, res) => {
  // Use secure CORS for internal dashboard endpoints
  setInternalCors(req, res);

  if (handlePreflight(req, res)) {
    return;
  }

  // Apply rate limiting (60 requests per minute)
  const rateLimited = await checkAndApplyRateLimit(req, res, 'api');
  if (rateLimited) return; // 429 response already sent

  // Verify authentication - dashboard requires authenticated access
  const authResult = await verifyAuth(req, { required: true });
  if (authResult.error) {
    return res.status(authResult.status || 401).json({
      success: false,
      error: authResult.error
    });
  }
  req.user = authResult.user;

  // Soft subscription check — allows 7-day grace period after expiry
  const subBlocked = await softCheckSubscription(req.user.restaurant_id, res);
  if (subBlocked) return;

  const { action } = req.query;

  try {
    switch (action) {
      case 'dashboard':
        return await handleDashboard(req, res);
      case 'check-in':
        return await handleCheckIn(req, res);
      case 'check-walk-in':
        return await handleCheckWalkIn(req, res);
      case 'seat-party':
        return await handleSeatParty(req, res);
      case 'complete-service':
        return await handleCompleteService(req, res);
      case 'mark-table-clean':
        return await handleMarkTableClean(req, res);
      case 'update-table-status':
        return await handleUpdateTableStatus(req, res);
      case 'update-reservation':
        return await handleUpdateReservation(req, res);
      // Floor Plan Editor endpoints
      case 'update-table-position':
        return await handleUpdateTablePosition(req, res);
      case 'update-table-properties':
        return await handleUpdateTableProperties(req, res);
      case 'link-tables':
        return await handleLinkTables(req, res);
      case 'unlink-tables':
        return await handleUnlinkTables(req, res);
      case 'delete-table':
        return await handleDeleteTable(req, res);
      case 'create-table':
        return await handleCreateTable(req, res);
      case 'auto-assign-shapes':
        return await handleAutoAssignShapes(req, res);
      case 'cancel-reservation':
        return await handleCancelReservation(req, res);
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid action. Use: dashboard, check-in, check-walk-in, seat-party, complete-service, mark-table-clean, update-table-status, update-reservation, cancel-reservation, update-table-position, update-table-properties, link-tables, unlink-tables, delete-table, or create-table'
        });
    }
  } catch (error) {
    logger.error('Host dashboard error', error);
    captureException(error, { method: req.method, url: req.url, action: req.query?.action });
    return res.status(500).json({
      success: false,
      error: 'An error occurred processing your request'
    });
  }
};
