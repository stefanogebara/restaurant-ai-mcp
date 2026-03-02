'use strict';

const Busboy = require('busboy');
const { verifyJWT } = require('./_lib/auth');
const { supabaseAdmin } = require('./_lib/supabase');
const { writeMemory } = require('./services/managerMemory');
const { parseCSVBuffer, normalizeRow, buildLTVRecord, buildServiceRecord } = require('./_lib/importPipeline');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('import-history');
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 2000;
const LTV_BATCH_SIZE = 500;

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers, limits: { fileSize: MAX_SIZE } });
    const chunks = [];
    let filename = '';
    let mimetype = '';
    let fileReceived = false;
    let truncated = false;

    busboy.on('file', (_field, file, info) => {
      fileReceived = true;
      filename = info.filename || '';
      mimetype = info.mimeType || '';
      file.on('limit', () => { truncated = true; });
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => {});
      file.on('error', (err) => reject(err));
    });

    busboy.on('finish', () => {
      if (!fileReceived || chunks.length === 0) return reject(new Error('No file received'));
      if (truncated) return reject(new Error('File too large (max 5MB)'));
      resolve({ buffer: Buffer.concat(chunks), filename, mimetype });
    });

    busboy.on('error', (err) => reject(err));
    req.pipe(busboy);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let restaurantId;
  try {
    const decoded = await verifyJWT(req.headers.authorization?.replace('Bearer ', ''));
    restaurantId = decoded.restaurantId;
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { buffer, filename, mimetype } = await parseMultipart(req);

    // Validate file type — only accept CSV/text files
    const allowedMimeTypes = ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel'];
    const allowedExtensions = ['.csv', '.txt'];
    const ext = (filename.toLowerCase().match(/\.[^.]+$/) || [''])[0];
    if (!allowedMimeTypes.includes(mimetype) && !allowedExtensions.includes(ext)) {
      return res.status(400).json({ error: 'Invalid file type. Please upload a CSV file.' });
    }

    const rawRows = parseCSVBuffer(buffer);

    const rows = rawRows.slice(0, MAX_ROWS);
    const ltvRecords = [];
    const serviceRecords = [];
    let skipped = 0;

    for (const raw of rows) {
      const norm = normalizeRow(raw);
      if (!norm) { skipped++; continue; }
      ltvRecords.push(buildLTVRecord(norm, restaurantId));
      const sr = buildServiceRecord(norm, restaurantId);
      if (sr) serviceRecords.push(sr);
    }

    if (ltvRecords.length === 0) {
      return res.status(400).json({ error: 'No valid rows found — ensure CSV has a phone/customer_phone column' });
    }

    // Batch upsert customer_ltv records
    for (let i = 0; i < ltvRecords.length; i += LTV_BATCH_SIZE) {
      const batch = ltvRecords.slice(i, i + LTV_BATCH_SIZE);
      const { error } = await supabaseAdmin
        .schema('restaurant')
        .from('customer_ltv')
        .upsert(batch, { onConflict: 'customer_id,restaurant_id' });
      if (error) throw new Error(`LTV upsert failed: ${error.message}`);
    }

    // Optionally seed service_records for revenue-stats avg_spend
    if (serviceRecords.length > 0) {
      for (let i = 0; i < serviceRecords.length; i += LTV_BATCH_SIZE) {
        const batch = serviceRecords.slice(i, i + LTV_BATCH_SIZE);
        const { error } = await supabaseAdmin
          .from('service_records')
          .insert(batch);
        if (error) logger.warn('service_records seed partial failure', { error: error.message });
      }
    }

    // Write summary manager_memory fact
    const vipCount = ltvRecords.filter(r => r.customer_tier === 'vip').length;
    const regularCount = ltvRecords.filter(r => r.customer_tier === 'regular').length;
    const avgSpend = Math.round(ltvRecords.reduce((s, r) => s + r.avg_revenue_per_visit, 0) / ltvRecords.length);
    const summary = `Imported ${ltvRecords.length} past customers from historical CSV. ${vipCount} VIPs, ${regularCount} regulars. Average spend: €${avgSpend}/visit.`;
    await writeMemory(restaurantId, 'fact', 'customer_intelligence', summary, 'csv_import', 7).catch(() => {});

    logger.info('import-history success', { restaurantId, imported: ltvRecords.length, skipped });

    return res.json({
      imported: ltvRecords.length,
      skipped,
      vip_count: vipCount,
      regular_count: regularCount,
      message: `Successfully imported ${ltvRecords.length} customers`,
    });

  } catch (err) {
    logger.error('import-history error', { error: err.message });
    return res.status(500).json({ error: err.message || 'Import failed' });
  }
};
