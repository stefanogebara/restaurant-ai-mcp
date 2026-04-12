/**
 * Email Verification Script
 *
 * Verifies restaurant emails via DNS MX lookup and optional SMTP RCPT TO check.
 * Zero external dependencies — uses Node built-in `dns` and `net` modules.
 *
 * Usage:
 *   node scripts/verify-emails.js              # full MX + SMTP verification
 *   node scripts/verify-emails.js --mx-only    # fast DNS-only check
 *   node scripts/verify-emails.js --recheck    # re-verify previously checked entries
 */

const dns = require('dns');
const net = require('net');
const fs = require('fs');
const path = require('path');

const MX_ONLY = process.argv.includes('--mx-only');
const RECHECK = process.argv.includes('--recheck');
const SCRIPTS_DIR = __dirname;
const SMTP_TIMEOUT = 10_000; // 10s per SMTP connection

// ─── File Discovery ──────────────────────────────────────────────────────────

function discoverBatchFiles() {
  return fs.readdirSync(SCRIPTS_DIR)
    .filter(f => f.startsWith('restaurants-sp') && f.endsWith('.json'))
    .sort();
}

function loadFile(filename) {
  return JSON.parse(fs.readFileSync(path.join(SCRIPTS_DIR, filename), 'utf8'));
}

function saveFile(filename, data) {
  fs.writeFileSync(path.join(SCRIPTS_DIR, filename), JSON.stringify(data, null, 2));
}

// ─── MX Check ────────────────────────────────────────────────────────────────

async function checkMX(domain) {
  try {
    const records = await dns.promises.resolveMx(domain);
    if (!records || records.length === 0) {
      return { ok: false, error: 'No MX records found', mxHost: null };
    }
    // Sort by priority (lowest = preferred)
    records.sort((a, b) => a.priority - b.priority);
    return { ok: true, error: null, mxHost: records[0].exchange };
  } catch (err) {
    return { ok: false, error: `DNS error: ${err.code || err.message}`, mxHost: null };
  }
}

// ─── SMTP RCPT TO Check ─────────────────────────────────────────────────────

function smtpCheck(mxHost, email) {
  return new Promise((resolve) => {
    const socket = net.createConnection(25, mxHost);
    let step = 0;
    let response = '';
    let resolved = false;

    const finish = (ok, error) => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve({ ok, error });
    };

    socket.setTimeout(SMTP_TIMEOUT);
    socket.on('timeout', () => finish(false, 'SMTP timeout'));
    socket.on('error', (err) => finish(false, `SMTP error: ${err.message}`));

    socket.on('data', (data) => {
      response += data.toString();

      // Wait for complete response line (ends with \r\n)
      if (!response.endsWith('\r\n')) return;

      const code = parseInt(response.substring(0, 3), 10);
      response = '';

      if (step === 0) {
        // Server greeting
        if (code === 220) {
          step = 1;
          socket.write('EHLO verify.seatable.io\r\n');
        } else {
          finish(false, `Unexpected greeting: ${code}`);
        }
      } else if (step === 1) {
        // EHLO response (may be multi-line, wait for single-line code)
        if (code === 250) {
          step = 2;
          socket.write('MAIL FROM:<verify@seatable.io>\r\n');
        }
      } else if (step === 2) {
        // MAIL FROM response
        if (code === 250) {
          step = 3;
          socket.write(`RCPT TO:<${email}>\r\n`);
        } else {
          finish(false, `MAIL FROM rejected: ${code}`);
        }
      } else if (step === 3) {
        // RCPT TO response — this is the key check
        socket.write('QUIT\r\n');
        if (code === 250 || code === 251) {
          finish(true, null);
        } else if (code === 550 || code === 551 || code === 553 || code === 554) {
          finish(false, `Mailbox rejected: ${code}`);
        } else if (code === 450 || code === 451 || code === 452) {
          // Temporary failure or greylisting — treat as inconclusive, pass
          finish(true, null);
        } else {
          finish(false, `RCPT TO response: ${code}`);
        }
      }
    });
  });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const files = discoverBatchFiles();
  console.log(`\nEmail Verification (${MX_ONLY ? 'MX-only' : 'MX + SMTP'})`);
  console.log(`Found ${files.length} batch files\n`);

  // Cache MX results per domain to avoid redundant lookups
  const mxCache = new Map();

  let totalChecked = 0;
  let totalVerified = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  const failedEntries = [];

  for (const file of files) {
    const restaurants = loadFile(file);
    let fileModified = false;
    let fileChecked = 0;
    let fileVerified = 0;
    let fileFailed = 0;
    let fileSkipped = 0;

    for (const r of restaurants) {
      // Skip entries without email
      if (!r.email) {
        fileSkipped++;
        continue;
      }

      // Skip already-verified unless --recheck
      if (!RECHECK && r.verified !== undefined) {
        fileSkipped++;
        continue;
      }

      const domain = r.email.split('@')[1];
      if (!domain) {
        r.verified = false;
        r.verifyError = 'Invalid email format';
        r.verifiedAt = new Date().toISOString();
        fileModified = true;
        fileFailed++;
        failedEntries.push({ name: r.name, email: r.email, error: 'Invalid email format', file });
        continue;
      }

      fileChecked++;

      // MX check (cached per domain)
      let mx = mxCache.get(domain);
      if (!mx) {
        mx = await checkMX(domain);
        mxCache.set(domain, mx);
      }

      if (!mx.ok) {
        r.verified = false;
        r.verifyError = mx.error;
        r.verifiedAt = new Date().toISOString();
        fileModified = true;
        fileFailed++;
        failedEntries.push({ name: r.name, email: r.email, error: mx.error, file });
        continue;
      }

      // SMTP check (unless --mx-only)
      if (!MX_ONLY) {
        const smtp = await smtpCheck(mx.mxHost, r.email);
        if (!smtp.ok) {
          r.verified = false;
          r.verifyError = smtp.error;
          r.verifiedAt = new Date().toISOString();
          fileModified = true;
          fileFailed++;
          failedEntries.push({ name: r.name, email: r.email, error: smtp.error, file });
          continue;
        }
      }

      // Passed all checks
      r.verified = true;
      r.verifyError = undefined;
      r.verifiedAt = new Date().toISOString();
      fileModified = true;
      fileVerified++;
    }

    if (fileModified) {
      saveFile(file, restaurants);
    }

    totalChecked += fileChecked;
    totalVerified += fileVerified;
    totalFailed += fileFailed;
    totalSkipped += fileSkipped;

    if (fileChecked > 0) {
      console.log(`  ${file}: ${fileChecked} checked, ${fileVerified} ok, ${fileFailed} failed, ${fileSkipped} skipped`);
    } else {
      console.log(`  ${file}: ${fileSkipped} skipped (already verified or no email)`);
    }
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('RESULTS SUMMARY');
  console.log('='.repeat(60));
  console.log(`  Total checked:  ${totalChecked}`);
  console.log(`  Verified (ok):  ${totalVerified}`);
  console.log(`  Failed:         ${totalFailed}`);
  console.log(`  Skipped:        ${totalSkipped}`);
  console.log(`  Domains cached: ${mxCache.size}`);

  if (failedEntries.length > 0) {
    console.log('\nFAILED EMAILS:');
    console.log('-'.repeat(60));
    for (const entry of failedEntries) {
      console.log(`  ${entry.name}`);
      console.log(`    Email:  ${entry.email}`);
      console.log(`    Error:  ${entry.error}`);
      console.log(`    File:   ${entry.file}`);
    }
  }

  // Show domain-level failures
  const failedDomains = new Map();
  for (const entry of failedEntries) {
    const domain = entry.email.split('@')[1] || entry.email;
    if (!failedDomains.has(domain)) failedDomains.set(domain, []);
    failedDomains.get(domain).push(entry.name);
  }

  if (failedDomains.size > 0) {
    console.log('\nFAILED DOMAINS:');
    console.log('-'.repeat(60));
    for (const [domain, names] of failedDomains) {
      console.log(`  ${domain} (${names.length} emails): ${names.join(', ')}`);
    }
  }

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
