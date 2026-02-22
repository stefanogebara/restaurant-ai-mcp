const { validateEnv } = require('../_lib/validate-env');

describe('validateEnv', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    Object.keys(process.env).forEach(k => delete process.env[k]);
    Object.assign(process.env, ORIGINAL);
  });

  test('passes when all required vars are present', () => {
    process.env.TEST_VAR_A = 'a';
    process.env.TEST_VAR_B = 'b';
    expect(() => validateEnv(['TEST_VAR_A', 'TEST_VAR_B'])).not.toThrow();
  });

  test('throws with list of missing vars', () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => validateEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']))
      .toThrow('Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  });

  test('throws on single missing var', () => {
    delete process.env.JWT_SECRET;
    expect(() => validateEnv(['JWT_SECRET'])).toThrow('JWT_SECRET');
  });

  test('validateCritical passes when all critical vars are set', () => {
    process.env.SUPABASE_URL = 'https://fake.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
    process.env.SUPABASE_ANON_KEY = 'anon-key';
    process.env.JWT_SECRET = 'secret';
    process.env.ANTHROPIC_API_KEY = 'key';
    process.env.STRIPE_SECRET_KEY = 'sk_test_key';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_key';
    process.env.CRON_SECRET = 'cron-secret';
    expect(() => require('../_lib/validate-env').validateCritical()).not.toThrow();
  });
});
