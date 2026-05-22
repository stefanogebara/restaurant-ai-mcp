/**
 * Connect to the already-running detached Chrome (opened by
 * open-square-cdp.mjs) via CDP, walk every open tab in every context,
 * pull out the Signature Key element value, and write it to Vercel.
 *
 * Usage:
 *   node scripts/extract-square-key.mjs
 *
 * Run AFTER the user has logged in to Square and clicked "Reveal" next
 * to the Signature Key on the webhook subscription page.
 */

import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';

const CDP_URL = 'http://localhost:9222';
const KEY_RE = /^[A-Za-z0-9_-]{30,80}$/;
const BLOCKLIST_PREFIXES = /^(sk|pk|whsec|stripe|ey)/i;

// DOM selectors Square has used historically for the signature key field.
const SELECTORS = [
  'input[id*="signature" i]',
  'input[name*="signature" i]',
  'input[aria-label*="signature key" i]',
  'textarea[id*="signature" i]',
  '[data-testid*="signature" i] input',
  '[data-testid*="signature" i]',
  'code:has-text("wh_")',
  'code:has-text("sq_")',
  // The most generic: any code/pre/span whose text body matches the
  // signature-key shape. Iterated below via JS evaluation.
];

async function main() {
  console.log('  Connecting to Chrome via CDP at', CDP_URL);
  let browser;
  try {
    browser = await chromium.connectOverCDP(CDP_URL);
  } catch (err) {
    console.error('  ❌  Could not connect via CDP. Is open-square-cdp.mjs running?');
    console.error('  ', err.message);
    process.exit(1);
  }

  const contexts = browser.contexts();
  console.log(`  Connected — ${contexts.length} context(s), scanning all open tabs…`);

  let key = await findKeyInBrowser(contexts);

  // Fallback: check clipboard in case the user copied it manually.
  if (!key) {
    console.log('  No key in DOM selectors — checking clipboard as a fallback…');
    key = readClipboardKey();
  }

  // Last-ditch: page-evaluate to scrape every text node on every page
  // for anything matching the key shape.
  if (!key) {
    console.log('  Clipboard empty — sweeping every text node on every open tab…');
    key = await sweepAllTextNodes(contexts);
  }

  // Important: don't close the browser. The user's CDP-controlled
  // Chrome stays open; we just disconnect.
  await browser.close().catch(() => {});

  if (!key) {
    console.error('\n  ❌  Could not find a signature-key-shaped value anywhere.');
    console.error('  Make sure you clicked "Reveal" so the key is visible.');
    console.error('  If Square renders it inside an iframe with cross-origin,');
    console.error('  copy it manually and run:');
    console.error('    echo "<key>" | vercel env add SQUARE_WEBHOOK_SIGNATURE_KEY production');
    process.exit(1);
  }

  console.log(`\n  ✓ Found key (${key.slice(0, 6)}…${key.slice(-4)}, len ${key.length})`);
  writeToVercel(key);

  console.log('\n  ───────────────────────────────────────────────────────');
  console.log('  Trigger a redeploy so the new env var is picked up:');
  console.log('    vercel --prod');
  console.log('  ───────────────────────────────────────────────────────');
}

async function findKeyInBrowser(contexts) {
  for (const ctx of contexts) {
    for (const page of ctx.pages()) {
      for (const sel of SELECTORS) {
        try {
          const els = await page.$$(sel);
          for (const el of els) {
            const candidates = [];
            const v1 = await el.inputValue().catch(() => null);
            if (v1) candidates.push(v1);
            const v2 = await el.textContent().catch(() => null);
            if (v2) candidates.push(v2);
            for (const raw of candidates) {
              const trimmed = String(raw).trim();
              if (KEY_RE.test(trimmed) && !BLOCKLIST_PREFIXES.test(trimmed)) {
                return trimmed;
              }
            }
          }
        } catch {
          // selector didn't apply, keep going
        }
      }
    }
  }
  return null;
}

async function sweepAllTextNodes(contexts) {
  for (const ctx of contexts) {
    for (const page of ctx.pages()) {
      try {
        const hits = await page.evaluate(({ pattern, blockPattern }) => {
          const re = new RegExp(pattern);
          const blockRe = new RegExp(blockPattern, 'i');
          const found = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          let n;
          while ((n = walker.nextNode())) {
            const text = (n.nodeValue || '').trim();
            if (text && re.test(text) && !blockRe.test(text)) {
              found.push(text);
            }
          }
          // Also check value attributes on inputs (not in TreeWalker).
          document.querySelectorAll('input,textarea').forEach((el) => {
            const v = (el.value || '').trim();
            if (v && re.test(v) && !blockRe.test(v)) found.push(v);
          });
          return found;
        }, { pattern: KEY_RE.source, blockPattern: BLOCKLIST_PREFIXES.source });
        if (hits && hits.length > 0) {
          return hits[0];
        }
      } catch {
        // page may have closed or be cross-origin
      }
    }
  }
  return null;
}

function readClipboardKey() {
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Get-Clipboard'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    if (KEY_RE.test(out) && !BLOCKLIST_PREFIXES.test(out)) return out;
  } catch {
    return null;
  }
  return null;
}

function writeToVercel(value) {
  // On Windows `vercel` is a .cmd shim that needs the shell to interpret
  // it. execFileSync with shell:true lets us still pipe stdin (for the
  // value) without manual command-string interpolation. The value is
  // delivered via stdin, never argv — no command-injection surface even
  // though shell:true is on.
  const cmd = process.platform === 'win32' ? 'vercel.cmd' : 'vercel';
  const shellOpt = { shell: true };

  let listing = '';
  try {
    listing = execFileSync(cmd, ['env', 'ls', 'production'], {
      ...shellOpt, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    console.warn('  (vercel env ls failed):', err.message);
  }
  if (listing.includes('SQUARE_WEBHOOK_SIGNATURE_KEY')) {
    console.log('  Pre-existing var — removing first…');
    execFileSync(cmd, ['env', 'rm', 'SQUARE_WEBHOOK_SIGNATURE_KEY', 'production', '--yes'], {
      ...shellOpt, stdio: 'inherit',
    });
  }
  execFileSync(cmd, ['env', 'add', 'SQUARE_WEBHOOK_SIGNATURE_KEY', 'production'], {
    ...shellOpt, input: value + '\n', stdio: ['pipe', 'inherit', 'inherit'],
  });
}

main().catch((err) => {
  console.error('\nFatal:', err);
  process.exit(1);
});
