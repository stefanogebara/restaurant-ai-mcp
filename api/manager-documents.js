'use strict';

const Busboy = require('busboy');
const Anthropic = require('@anthropic-ai/sdk').default;
const pdfParse = require('pdf-parse');
const { verifyJWT } = require('./_lib/auth');
const { writeMemory } = require('./services/managerMemory');
const { createSecureLogger } = require('./_lib/secure-logger');

const logger = createSecureLogger('manager-documents');

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const MIN_TEXT_LENGTH = 10;
const MAX_FACTS = 20;
const MAX_TEXT_FOR_CLAUDE = 8000;

/**
 * Parse a multipart/form-data request and return the first uploaded file.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ buffer: Buffer, filename: string, mimetype: string }>}
 */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: req.headers });
    const chunks = [];
    let filename = '';
    let mimetype = '';
    let fileReceived = false;

    busboy.on('file', (_field, file, info) => {
      fileReceived = true;
      filename = info.filename || '';
      mimetype = info.mimeType || '';

      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => {});
      file.on('error', (err) => reject(err));
    });

    busboy.on('finish', () => {
      if (!fileReceived || chunks.length === 0) {
        return reject(new Error('No file received'));
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
    const result = await pdfParse(buffer);
    return result.text || '';
  }

  return buffer.toString('utf8');
}

/**
 * Call Claude Haiku to extract numbered operational facts from restaurant document text.
 * @param {string} text
 * @returns {Promise<string[]>} Array of fact strings
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let restaurantId;
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || '';
    const decoded = verifyJWT(token);
    restaurantId = decoded.restaurantId;
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { buffer, filename, mimetype } = await parseMultipart(req);

    if (buffer.length > MAX_SIZE) {
      return res.status(413).json({ error: 'File too large (max 5MB)' });
    }

    const text = await extractText(buffer, mimetype, filename);

    if (!text || text.trim().length < MIN_TEXT_LENGTH) {
      return res.status(422).json({ error: 'Could not extract text from document' });
    }

    const facts = await extractFacts(text);

    await Promise.all(
      facts.map((fact) =>
        writeMemory(restaurantId, 'fact', 'ops', fact, filename || 'upload', 0.8)
      )
    );

    logger.info('Document processed', { restaurantId, factsStored: facts.length, filename });
    return res.status(200).json({ success: true, facts_stored: facts.length });
  } catch (err) {
    logger.error('manager-documents error', { error: err.message });
    return res.status(500).json({ error: 'Processing failed' });
  }
};
