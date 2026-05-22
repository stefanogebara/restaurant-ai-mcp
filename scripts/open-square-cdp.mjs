/**
 * Launch a detached Chrome with remote debugging enabled, pointed at
 * the Square Dashboard. Exits immediately — the browser keeps running
 * independently. A second script (extract-square-key.mjs) connects via
 * CDP to read the signature key once the user has logged in.
 *
 * Usage:
 *   node scripts/open-square-cdp.mjs
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CDP_PORT = 9222;

const candidateChromePaths = [
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  // Edge as a fallback — same Chromium under the hood, same CDP wire format
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

let browserPath = null;
for (const p of candidateChromePaths) {
  if (fs.existsSync(p)) { browserPath = p; break; }
}

if (!browserPath) {
  // Fall back to Playwright's bundled Chromium so this still works on
  // a machine without Chrome/Edge installed system-wide.
  const { chromium } = await import('playwright');
  browserPath = chromium.executablePath();
  console.log(`  Using Playwright's bundled Chromium: ${browserPath}`);
}

// Dedicated user-data-dir so we don't fight with the user's main Chrome
// profile. Stays around across script runs so the user doesn't re-login
// on every retry.
const userDataDir = path.join(os.tmpdir(), 'sq-grab-cdp');

const child = spawn(browserPath, [
  `--remote-debugging-port=${CDP_PORT}`,
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  'https://developer.squareup.com/apps',
], {
  detached: true,
  stdio: 'ignore',
});
child.unref();

console.log('───────────────────────────────────────────────────────────');
console.log(' Browser launched with CDP port 9222 (detached).');
console.log('───────────────────────────────────────────────────────────');
console.log('  1. Log in (Google OAuth fine, 2FA fine).');
console.log('  2. Open your seatable app → Webhooks → seatable.one subscription.');
console.log('  3. Click "Reveal" / "Show" next to Signature Key — the value');
console.log('     just needs to be visible in the DOM, you do NOT need to copy it.');
console.log('  4. Tell me "ready" in chat. I will connect via CDP, walk every');
console.log('     open tab in this browser, extract the key, and pipe it to Vercel.');
console.log('───────────────────────────────────────────────────────────');
console.log(`  User data dir (reused on next run): ${userDataDir}`);
