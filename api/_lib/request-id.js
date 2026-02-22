'use strict';

const { randomUUID } = require('crypto');
const REQUEST_ID_KEY = Symbol('requestId');

function addRequestId(req, res) {
  const id = req.headers['x-request-id'] || randomUUID();
  req[REQUEST_ID_KEY] = id;
  res.setHeader('x-request-id', id);
  return id;
}

function getRequestId(req) {
  return req[REQUEST_ID_KEY] || req.headers['x-request-id'] || null;
}

module.exports = { addRequestId, getRequestId };
