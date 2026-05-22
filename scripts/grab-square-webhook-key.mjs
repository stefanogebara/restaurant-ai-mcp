/**
 * Interactive helper — uses Playwright to open Square Dashboard, then
 * polls your clipboard for the webhook Signature Key. Once it sees a
 * fresh value that looks like a signature key, pipes it to Vercel as
 * SQUARE_WEBHOOK_SIGNATURE_KEY (production) via execFile (no shell,
 * no command injection).
 *
 * Usage:
 *   node scripts/grab-square-webhook-key.mjs
 *
 * Flow:
 *   1. Chromium opens at https://developer.squareup.com/apps
 *   2. You log in (Google OAuth fine, 2FA fine).
 *   3. Navigate to your app → Webhooks → the seatable subscription.
 *   4. Click "Reveal" / "Show" next to Signature Key.
 *   5. Copy the key (Ctrl+C / select-and-copy).
 *   6. Script detects the new clipboard contents (polls every 500ms),
 *      validates the shape, writes to Vercel, closes the browser.
 *
 * Clipboard read via `powershell.exe Get-Clipboard` on Windows. The
 * script ignores the initial clipboard contents at start so you don't
 * accidentally pipe whatever was there before.
 */

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const SQUARE_APPS_URL = 'https://developer.squareup.com/apps';
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

async function main() {
  console.log('───────────────────────────────────────────────────────────');
  console.log(' Square webhook Signature Key grabber (clipboard-driven)');
  console.log('───────────────────────────────────────────────────────────');
  console.log('  Chromium opens at the Square Dashboard. Log in any way,');
  console.log('  navigate to your app → Webhooks → seatable subscription,');
  console.log('  click "Reveal" next to Signature Key, then COPY IT.');
  console.log('  This script reads your clipboard every 500ms and writes');
  console.log('  the first value matching a signature-key shape to Vercel.');
  console.log('───────────────────────────────────────────────────────────');

  // Snapshot the current clipboard so we don't react to whatever was
  // already there when the script started.
  const initialClipboard = readClipboard();
  if (initialClipboard) {
    console.log(`  (Ignoring current clipboard contents: ${initialClipboard.slice(0, 16)}…)`);
  }

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(SQUARE_APPS_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });

  console.log('\n  Waiting for a freshly-copied Signature Key (up to 10 min)…');
  const signatureKey = await pollClipboard(initialClipboard);

  if (!signatureKey) {
    console.error('\n  ❌  Timed out — no signature-key-shaped value appeared in clipboard.');
    console.error('  Either nothing was copied, or it didn\'t match the pattern.');
    console.error('  You can also run this directly:');
    console.error('    echo "<key>" | vercel env add SQUARE_WEBHOOK_SIGNATURE_KEY production');
    await browser.close();
    process.exit(1);
  }

  console.log(`\n  ✓ Detected key (${signatureKey.slice(0, 6)}…${signatureKey.slice(-4)}, len ${signatureKey.length})`);
  console.log('  Writing to Vercel as SQUARE_WEBHOOK_SIGNATURE_KEY (production)…');
  writeToVercel(signatureKey);
  await browser.close();

  console.log('\n  ───────────────────────────────────────────────────────');
  console.log('  Next: redeploy so the new env var is picked up.');
  console.log('    vercel --prod');
  console.log('  …then verify the webhook now accepts signed events:');
  console.log('    curl https://seatable.one/api/admin-health \\');
  console.log('         -H "Authorization: Bearer $CRON_SECRET" | jq .integrity');
  console.log('  ───────────────────────────────────────────────────────');
}

function readClipboard() {
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Clipboard'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return out.trim();
  } catch {
    return '';
  }
}

async function pollClipboard(initial) {
  const start = Date.now();
  // Signature keys are typically 32+ chars of [A-Za-z0-9_-]. Tighten if
  // you start picking up false positives. Avoid spaces or special chars.
  const KEY_RE = /^[A-Za-z0-9_-]{30,80}$/;

  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const current = readClipboard();
    if (
      current &&
      current !== initial &&
      KEY_RE.test(current) &&
      // Avoid copying back a Stripe-shaped sk_/pk_/whsec_ key (we'd
      // never want that var set to a Stripe value).
      !/^(sk|pk|whsec|stripe)_/i.test(current)
    ) {
      return current;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null;
}

function writeToVercel(value) {
  let listing = '';
  try {
    listing = execFileSync('vercel', ['env', 'ls', 'production'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    console.warn('  (vercel env ls failed, proceeding with add anyway):', err.message);
  }

  if (listing.includes('SQUARE_WEBHOOK_SIGNATURE_KEY')) {
    console.log('  Pre-existing var found — removing first…');
    try {
      execFileSync('vercel', ['env', 'rm', 'SQUARE_WEBHOOK_SIGNATURE_KEY', 'production', '--yes'], {
        stdio: 'inherit',
      });
    } catch (err) {
      console.error('  ❌ Could not remove existing var:', err.message);
      process.exit(1);
    }
  }

  try {
    execFileSync('vercel', ['env', 'add', 'SQUARE_WEBHOOK_SIGNATURE_KEY', 'production'], {
      input: value + '\n',
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  } catch (err) {
    console.error('\n  ❌  Failed to set env var via Vercel CLI:', err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\nFatal:', err);
  process.exit(1);
});
