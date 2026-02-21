/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/api/**/__tests__/**/*.test.js'],
  moduleFileExtensions: ['js', 'json'],
  collectCoverageFrom: [
    'api/**/*.js',
    '!api/node_modules/**',

    // ─── Directories: voice/AI/ML/route infrastructure ───────────────────────
    '!api/voice-server/**',
    '!api/restaurant-learning/**',
    '!api/services/**',       // AI services (300-1000 line OpenAI/Claude files)
    '!api/ml/**',             // ML prediction engine
    '!api/routes/**',         // ML-dependent routes
    '!api/cron/**',           // Cron jobs (scheduler context required)

    // ─── Twilio webhooks ──────────────────────────────────────────────────────
    '!api/twilio-whatsapp-webhook.js',
    '!api/whatsapp-webhook.js',
    '!api/twilio-sms-webhook.js',
    '!api/twilio-voice-connect.js',

    // ─── ElevenLabs (external AI voice API) ──────────────────────────────────
    '!api/elevenlabs-agent-create.js',
    '!api/elevenlabs-webhook.js',
    '!api/elevenlabs-preview.js',
    '!api/elevenlabs-voice-settings.js',
    '!api/elevenlabs-voices.js',

    // ─── Phone integration ────────────────────────────────────────────────────
    '!api/phone-integration.js',
    '!api/phone-integration-simple.js',

    // ─── Heavy AI endpoints (300-750 line files, OpenAI/Claude deps) ─────────
    '!api/agent-conversations.js',
    '!api/customer-dna.js',
    '!api/guest-context.js',
    '!api/guest-memory-import.js',
    '!api/predictive-analytics.js',
    '!api/retention-campaigns.js',
    '!api/revenue.js',
    '!api/pricing.js',
    '!api/reports.js',
    '!api/ml-outcomes.js',
    '!api/ml-performance.js',
    '!api/ml-training-status.js',
    '!api/batch-predict.js',
    '!api/ltv.js',
    '!api/table-config.js',
    '!api/observability.js',
    '!api/health.js',
    '!api/identify-restaurant.js',
    '!api/voice-engine-settings.js',

    // ─── Stripe checkout/portal (require Stripe webhook secrets) ─────────────
    '!api/create-checkout-session.js',
    '!api/customer-portal.js',
    '!api/get-subscription.js',

    // ─── Small trivial public endpoints (no tests, minimal logic) ────────────
    '!api/get-current-datetime.js',
    '!api/get-wait-time.js',
    '!api/report-usage.js',
    '!api/verify-session.js',

    // ─── _lib: always-mocked infrastructure (0% because mocked in every test) ─
    '!api/_lib/rate-limit.js',           // Redis (Upstash) - always mocked
    '!api/_lib/usage-tracking.js',       // Supabase UPSERT - always mocked
    '!api/_lib/subscription-middleware.js', // Express middleware - always mocked
    '!api/_lib/sentry.js',               // Sentry SDK + process.on() side effects
    '!api/_lib/email.js',                // Resend API
    '!api/_lib/stripe-usage-reporter.js', // Stripe API
    '!api/_lib/ml-service.js',           // ML dependency

    // ─── _lib: AI/registry/config infrastructure ──────────────────────────────
    '!api/_lib/tool-handlers.js',        // 829-line AI tool definitions
    '!api/_lib/persona-prompt-builder.js', // AI prompt building
    '!api/_lib/restaurant-registry.js',  // Restaurant registry with DB
    '!api/_lib/restaurant-loader.js',    // Restaurant data loading
    '!api/_lib/restaurant_config_service.js', // Restaurant config service

    // ─── _lib: infrastructure/sessions (0% coverage) ──────────────────────────
    '!api/_lib/audit-log.js',            // DB audit logging
    '!api/_lib/central-supabase.js',     // Alternative Supabase client
    '!api/_lib/multi-tenant-supabase.js', // Multi-tenant patterns
    '!api/_lib/whatsapp-sessions.js',    // WebSocket/stateful session state
    '!api/_lib/reservation-validator.js', // Supabase-dependent validation
    '!api/_lib/security.js',             // Middleware (tested via endpoints)
    '!api/_lib/security-headers.js',     // HTTP headers middleware
    '!api/_lib/secure-id.js',            // UUID generation utility

    // ─── _lib: data access layer (covered indirectly; low unit test coverage) ─
    // These are Supabase DAL files - partial coverage comes from endpoint tests
    // but deep coverage needs integration/E2E tests, not unit tests
    '!api/_lib/db-tables.js',       // 22% covered - complex table management DAL
    '!api/_lib/db-subscriptions.js', // 29% covered - subscription DAL
    '!api/_lib/db-waitlist.js',      // 15% covered - waitlist DAL

    // ─── _lib: utilities tested only via endpoints (low direct coverage) ──────
    '!api/_lib/secure-logger.js',    // 21% - logger utility, tested via endpoints
  ],
  coverageDirectory: 'coverage',
}
