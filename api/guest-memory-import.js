/**
 * Guest Memory Import API
 *
 * Admin endpoint to trigger one-time import of existing CustomerDNA data
 * into the guest memory stream. Bootstraps the memory system with
 * historical behavioral profiles, text signals, and occasions.
 *
 * POST /api/guest-memory-import
 * Body: { guest_phone?: string }  (optional - import specific guest or all)
 */

const { supabaseAdmin } = require('./_lib/supabase');
const { verifyAuth } = require('./_lib/auth');
const { setWebhookCors, handlePreflight } = require('./_lib/cors');
const { createSecureLogger } = require('./_lib/secure-logger');
const { importFromDNA } = require('./services/guestMemory');

const logger = createSecureLogger('GuestMemoryImport');

module.exports = async (req, res) => {
  setWebhookCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authenticate
  const auth = await verifyAuth(req);
  if (auth.error) {
    return res.status(auth.status || 401).json({ message: auth.error });
  }

  const restaurantId = auth.user.restaurant_id;
  if (!restaurantId) {
    return res.status(403).json({ message: 'No restaurant associated with your account.' });
  }

  const { guest_phone } = req.body || {};

  try {
    if (guest_phone) {
      // Import a specific guest
      const imported = await importFromDNA(restaurantId, guest_phone);
      return res.status(200).json({
        success: true,
        guest_phone,
        memories_imported: imported
      });
    }

    // Import all guests with behavioral profiles
    const { data: profiles, error } = await supabaseAdmin
      .from('customer_behavioral_profiles')
      .select('customer_phone')
      .eq('restaurant_id', restaurantId);

    if (error) throw error;

    if (!profiles || profiles.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No customer profiles found to import',
        guests_processed: 0,
        total_imported: 0
      });
    }

    // Deduplicate phone numbers
    const uniquePhones = [...new Set(profiles.map(p => p.customer_phone).filter(Boolean))];

    let totalImported = 0;
    let processed = 0;

    // Process in batches (limit to 50 per request to avoid timeout)
    for (const phone of uniquePhones.slice(0, 50)) {
      try {
        const imported = await importFromDNA(restaurantId, phone);
        totalImported += imported;
        processed++;
      } catch (importErr) {
        logger.warn(`Import failed for guest ${phone.slice(0, 4)}***:`, importErr.message);
      }
    }

    logger.info('Bulk DNA import completed', {
      totalGuests: uniquePhones.length,
      processed,
      totalImported
    });

    return res.status(200).json({
      success: true,
      guests_found: uniquePhones.length,
      guests_processed: processed,
      total_imported: totalImported,
      remaining: Math.max(0, uniquePhones.length - 50)
    });
  } catch (error) {
    logger.error('Guest memory import error:', error.message);
    return res.status(500).json({ message: 'Import failed', error: error.message });
  }
};
