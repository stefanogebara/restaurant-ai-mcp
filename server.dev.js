/**
 * Local Development Server
 * Runs API endpoints locally on port 3001
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Load and mount API endpoints
const onboardingComplete = require('./api/onboarding/complete.js');
const hostDashboard = require('./api/host-dashboard.js');
const analytics = require('./api/analytics.js');
const waitlist = require('./api/waitlist.js');
const batchPredict = require('./api/batch-predict.js');
const mlOutcomes = require('./api/routes/ml-outcomes.js');
const mlPerformance = require('./api/ml-performance.js');
const ltv = require('./api/ltv.js');
const pricing = require('./api/pricing.js');

// Create mock req/res wrappers for Vercel functions
const createHandler = (handler) => {
  return async (req, res) => {
    try {
      // Create mock Vercel request/response
      await handler(req, res);
    } catch (error) {
      console.error('Handler error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error', message: error.message });
      }
    }
  };
};

// Mount routes
app.post('/api/onboarding/complete', createHandler(onboardingComplete));
app.options('/api/onboarding/complete', (req, res) => res.status(200).end());

// Host Dashboard endpoints
app.get('/api/host-dashboard', createHandler(hostDashboard));
app.post('/api/host-dashboard', createHandler(hostDashboard));
app.patch('/api/host-dashboard', createHandler(hostDashboard));

// Analytics endpoint
app.get('/api/analytics', createHandler(analytics));

// Waitlist endpoints
app.get('/api/waitlist', createHandler(waitlist));
app.post('/api/waitlist', createHandler(waitlist));
app.patch('/api/waitlist', createHandler(waitlist));
app.delete('/api/waitlist', createHandler(waitlist));

// ML Batch Prediction endpoint
app.get('/api/batch-predict', createHandler(batchPredict));
app.post('/api/batch-predict', createHandler(batchPredict));

// ML Outcomes endpoints (Express router, not Vercel function)
app.use('/api/ml-outcomes', mlOutcomes);

// ML Performance Dashboard endpoints
app.get('/api/ml-performance', createHandler(mlPerformance));

// LTV endpoints
app.get('/api/ltv', createHandler(ltv));
app.post('/api/ltv', createHandler(ltv));

// Pricing endpoints
app.get('/api/pricing', createHandler(pricing));
app.post('/api/pricing', createHandler(pricing));
app.put('/api/pricing', createHandler(pricing));
app.patch('/api/pricing', createHandler(pricing));
app.delete('/api/pricing', createHandler(pricing));

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      hasAirtableKey: !!process.env.AIRTABLE_API_KEY,
      hasAirtableBase: !!process.env.AIRTABLE_BASE_ID,
    }
  });
});

// Catch-all for undefined routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', path: req.path });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Development server running on http://localhost:${PORT}`);
  console.log(`📍 API endpoint: http://localhost:${PORT}/api/onboarding/complete`);
  console.log(`✅ Health check: http://localhost:${PORT}/api/health\n`);
});
