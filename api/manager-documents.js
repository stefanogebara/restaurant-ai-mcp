'use strict';

const path = require('path');
const Busboy = require('busboy');
const Anthropic = require('@anthropic-ai/sdk').default;
// pdf-parse v2 uses ESM-first; lazy-require the CJS build to avoid Vercel cold-start crashes
let pdfParse;
function getPdfParse() {
  if (!pdfParse) pdfParse = require('pdf-parse');
  return pdfParse;
}
const { verifyJWT } = require('./_lib/auth');
const { writeMemory } = require('./services/managerMemory');
const { createSecureLogger } = require('./_lib/secure-logger');
const { setInternalCors, handlePreflight } = require('./_lib/cors');

const logger = createSecureLogger('manager-documents');

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const MIN_TEXT_LENGTH = 10;
const MAX_FACTS = 20;
const MAX_TEXT_FOR_CLAUDE = 8000;

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'text/plain', 'text/csv', 'text/markdown']);
const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.csv', '.md'];

/**
 * Parse a multipart/form-data request and return the first uploaded file.
 * Uses busboy's built-in fileSize limit to prevent buffering oversized files.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ buffer: Buffer, filename: string, mimetype: string }>}
 */
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
      if (!fileReceived || chunks.length === 0) {
        return reject(new Error('No file received'));
      }
      if (truncated) {
        return reject(new Error('File too large (max 5MB)'));
      }
      resolve({ buffer: Buffer.concat(chunks), filename, mimetype });
    });

    busboy.on('error', (err) => reject(err));

    req.pipe(busboy);
  });
}

/**
 * Extract plain text from a buffer. Uses pdf-parse for PDFs, UTF-8 decode for everything else.
 * @param {Buffer} buffer
 * @param {string} mimetype
 * @param {string} filename
 * @returns {Promise<string>}
 */
async function extractText(buffer, mimetype, filename) {
  const isPdf =
    mimetype === 'application/pdf' ||
    (typeof filename === 'string' && filename.toLowerCase().endsWith('.pdf'));

  if (isPdf) {
    const result = await getPdfParse()(buffer);
    return result.text || '';
  }

  return buffer.toString('utf8');
}

/**
 * Call Claude Haiku to extract numbered operational facts from restaurant document text.
 * @param {string} text
 * @returns {Promise<string[]>} Array of fact strings (numbering prefix stripped)
 */
async function extractFacts(text) {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Extract key operational facts from this restaurant document.
List each fact on a new line starting with a number and period.
Focus on: hours, policies, menu items, staff info, supplier contacts, pricing.
Be concise. Maximum ${MAX_FACTS} facts.

Document:
${text.slice(0, MAX_TEXT_FOR_CLAUDE)}`,
      },
    ],
  });

  const factsText = response.content[0]?.text || '';
  return factsText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\./.test(line))
    .map((line) => line.replace(/^\d+\.\s*/, '').trim())
    .filter(Boolean);
}

/**
 * POST /api/manager-documents
 *
 * Accepts multipart/form-data with a single file field (PDF or plain text).
 * Extracts text, sends to Claude Haiku for fact extraction, and stores each
 * fact as a manager memory entry.
 *
 * Response: { success: true, facts_stored: N }
 */
module.exports = async function handler(req, res) {
  setInternalCors(req, res);
  if (handlePreflight(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let restaurantId;
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || '';
    const decoded = await verifyJWT(token);
    restaurantId = decoded.restaurant_id;
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { buffer, filename, mimetype } = await parseMultipart(req);

    // Secondary size guard (in case busboy limit was not triggered, e.g. in tests)
    if (buffer.length > MAX_SIZE) {
      return res.status(413).json({ error: 'File too large (max 5MB)' });
    }

    // File type allowlist — reject non-PDF/text files
    const ext = path.extname(filename || '').toLowerCase();
    if (!ALLOWED_MIME_TYPES.has(mimetype) && !ALLOWED_EXTENSIONS.includes(ext)) {
      return res.status(415).json({ error: 'Unsupported file type. Upload PDF or plain text.' });
    }

    const text = await extractText(buffer, mimetype, filename);

    if (!text || text.trim().length < MIN_TEXT_LENGTH) {
      return res.status(422).json({ error: 'Could not extract text from document' });
    }

    const facts = await extractFacts(text);

    await Promise.all(
      facts.map((fact) =>
        writeMemory(restaurantId, 'fact', 'ops', fact, filename || 'upload', 8)
      )
    );

    logger.info('Document processed', { restaurantId, factsStored: facts.length, filename });
    return res.status(200).json({ success: true, facts_stored: facts.length });
  } catch (err) {
    if (err.message === 'File too large (max 5MB)') {
      return res.status(413).json({ error: 'File too large (max 5MB)' });
    }
    logger.error('manager-documents error', { error: err.message });
    return res.status(500).json({ error: 'Processing failed' });
  }
};
