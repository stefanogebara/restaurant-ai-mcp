/**
 * Demo API — BISECT TEST (imports only, minimal handler)
 *
 * Diagnostic: c531f237/fc8d95d2 deployed but Vercel silently dropped
 * api/demo from the function manifest under both `api/demo.js` and
 * `api/demo/index.js`. No build error. The 3-line diagnostic stub
 * DID deploy. So something in the import tree or body content is
 * triggering Vercel's per-function NFT to skip this file.
 *
 * This commit keeps ALL the static requires (so NFT sees the same
 * import graph) but replaces the handler body with a trivial 200.
 * If THIS deploys → the issue is in the function body. If it still
 * 404s → the issue is in the import tree (next round: bisect the
 * imports themselves).
 *
 * The real handler is stashed at api/_lib/_demo-handler-backup.js
 * (underscore prefix → never deployed as a function).
 */

const crypto = require('crypto');
const { generateSecureReservationId } = require('../_lib/secure-id');
const { supabaseAdmin, getAllTables, getUpcomingReservations } = require('../_lib/supabase');
const { verifyAuth } = require('../_lib/auth');
const { setInternalCors, handlePreflight } = require('../_lib/cors');
const { createSecureLogger } = require('../_lib/secure-logger');
const { initSentry, captureException } = require('../_lib/sentry');
const { checkAndApplyRateLimit } = require('../_lib/rate-limit');
const { validateEmail } = require('../_lib/validation');
const { enrichRestaurant } = require('../_lib/enrich-restaurant');
const { derivePersonalityFromScrape } = require('../_lib/vibe-to-persona-preset');
const { Resend } = require('resend');

initSentry();
const logger = createSecureLogger('Demo');

module.exports = async (req, res) => {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;
  return res.status(200).json({
    bisect: 'demo-imports-only',
    method: req.method,
    importsLoaded: {
      crypto: typeof crypto.randomUUID === 'function',
      generateSecureReservationId: typeof generateSecureReservationId,
      supabaseAdmin: typeof supabaseAdmin,
      verifyAuth: typeof verifyAuth,
      setInternalCors: typeof setInternalCors,
      createSecureLogger: typeof createSecureLogger,
      initSentry: typeof initSentry,
      captureException: typeof captureException,
      checkAndApplyRateLimit: typeof checkAndApplyRateLimit,
      validateEmail: typeof validateEmail,
      enrichRestaurant: typeof enrichRestaurant,
      derivePersonalityFromScrape: typeof derivePersonalityFromScrape,
      Resend: typeof Resend,
    },
  });
};
