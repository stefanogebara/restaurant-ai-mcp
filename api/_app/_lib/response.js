'use strict';

/**
 * Shared API Response Utilities
 *
 * Standardized success/error response helpers for consistent API envelope format.
 * Usage:
 *   const { sendError, sendSuccess } = require('./_lib/response');
 *   sendError(res, 400, 'Missing required field');
 *   sendSuccess(res, { items: [...] }, { total: 100, page: 1 });
 */

function sendError(res, status, message) {
  return res.status(status).json({ success: false, error: message });
}

function sendSuccess(res, data, meta) {
  const response = { success: true, data };
  if (meta) response.meta = meta;
  return res.status(200).json(response);
}

module.exports = { sendError, sendSuccess };
