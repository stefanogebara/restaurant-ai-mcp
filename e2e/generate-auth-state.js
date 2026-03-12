/**
 * Generates auth-state.json by following a Supabase magic link headlessly.
 * Run: node e2e/generate-auth-state.js
 */
const { chromium } = require('@playwright/test');
const path = require('path');
const https = require('https');

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const SUPABASE_URL = 'https://ckforlwdhewexyqljsaf.supabase.co';
const EMAIL = 'stefanogebara@gmail.com';
const REDIRECT_TO = 'https://seatable.one/host-dashboard';
const AUTH_STATE_PATH = path.join(__dirname, 'auth-state.json');

async function getMagicLink(serviceKey) {
  const body = JSON.stringify({
    type: 'magiclink',
    email: EMAIL,
    options: { redirectTo: REDIRECT_TO },
  });

  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL + '/auth/v1/admin/generate_link');
    const req = https.request(
      { hostname: url.hostname, path: url.pathname, method: 'POST',
        headers: { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey,
          'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch (e) { reject(new Error('Parse error: ' + data)); }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  if (!SERVICE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY not set — load .env.local first');
    process.exit(1);
  }

  console.log('Generating magic link for', EMAIL);
  const linkData = await getMagicLink(SERVICE_KEY);
  const actionLink = linkData.action_link;
  if (!actionLink) {
    console.error('No action_link in response:', JSON.stringify(linkData));
    process.exit(1);
  }
  console.log('Magic link obtained, following headlessly...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(actionLink, { waitUntil: 'networkidle', timeout: 30000 });

    // Wait for redirect to dashboard
    await page.waitForURL(/restaurant-ai-mcp\.vercel\.app/, { timeout: 20000 });

    // Allow any client-side redirects to settle
    await page.waitForLoadState('networkidle', { timeout: 15000 });

    const vercelUrl = page.url();
    console.log('Landed at:', vercelUrl);

    // Extract localStorage from vercel.app
    const lsData = await page.evaluate(() => {
      const items = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        items[key] = localStorage.getItem(key);
      }
      return items;
    });
    console.log('Extracted', Object.keys(lsData).length, 'localStorage entries from vercel.app');

    // Transfer auth to seatable.one
    await page.goto('https://seatable.one/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate((data) => {
      for (const [key, value] of Object.entries(data)) {
        localStorage.setItem(key, value);
      }
    }, lsData);
    console.log('Injected localStorage into seatable.one');

    // Navigate to dashboard to let Supabase client pick up the token
    await page.goto('https://seatable.one/host-dashboard/simple', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    const finalUrl = page.url();
    console.log('Final URL on seatable.one:', finalUrl);

    await context.storageState({ path: AUTH_STATE_PATH });
    console.log('✅ Auth state saved to', AUTH_STATE_PATH);
  } finally {
    await browser.close();
  }
})();
