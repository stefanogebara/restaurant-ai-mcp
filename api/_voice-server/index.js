/**
 * Voice Pipeline Server Entry Point
 *
 * Standalone Node.js server for the voice pipeline WebSocket connections.
 * This runs separately from Vercel serverless (on Railway, Fly.io, or EC2)
 * because Vercel doesn't support persistent WebSocket connections.
 *
 * Usage:
 *   node api/voice-server/index.js
 *
 * Environment variables:
 *   VOICE_WS_PORT - WebSocket server port (default: 8765)
 *   OPENAI_API_KEY - Required for OpenAI Realtime backend
 *   SUPABASE_URL - Required for restaurant config lookup
 *   SUPABASE_SERVICE_ROLE_KEY - Required for DB access
 */

require('dotenv').config();

const http = require('http');
const { createVoiceServer, getHealthStatus } = require('./ws-server');
const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('VoiceServerMain');

const PORT = parseInt(process.env.VOICE_WS_PORT || '8765', 10);

// Create HTTP server for health checks
const httpServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    const health = getHealthStatus(wss);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

// Attach WebSocket server to the HTTP server
const wss = createVoiceServer({ server: httpServer });

// Start listening
httpServer.listen(PORT, () => {
  logger.info(`Voice pipeline server running`, {
    port: PORT,
    wsPath: '/ws',
    healthEndpoint: `http://localhost:${PORT}/health`,
    nodeVersion: process.version
  });

  // Validate required environment variables
  const required = ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    logger.warn('Missing environment variables:', { missing });
    logger.warn('Some functionality may not work without these variables.');
  }
});

// Graceful shutdown
function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  wss.close(() => {
    logger.info('WebSocket server closed');
    httpServer.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Prevent unhandled errors from crashing the server
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', { message: error.message, stack: error.stack });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', { reason: String(reason) });
});
