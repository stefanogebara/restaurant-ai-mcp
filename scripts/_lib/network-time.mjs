// Network-corrected timestamps for signing test webhooks.
//
// Stripe's signature verifier (and every other HMAC-with-timestamp scheme)
// rejects payloads whose `t=` is more than ~5 minutes off the receiver's
// clock. If the local machine's clock has drifted (Windows boxes without
// NTP-sync admin rights are a common case), every signed probe gets rejected
// with a misleading "bad signature" 400 instead of a clear clock-skew error.
//
// This helper measures the drift against a known good HTTP server's Date
// header once on import and exposes a small API:
//
//   import { networkUnixSeconds, networkOffsetMs } from './_lib/network-time.mjs';
//   const ts = networkUnixSeconds();           // for stripe.webhooks.generateTestHeaderString
//   console.log('drift:', networkOffsetMs);    // for logging
//
// The reference server is configurable via env so we can swap it in CI:
//   NETWORK_TIME_SOURCE=https://www.cloudflare.com node ...

const REFERENCE_URL = process.env.NETWORK_TIME_SOURCE || 'https://www.google.com';

async function fetchNetworkOffsetMs() {
  const r = await fetch(REFERENCE_URL, { method: 'HEAD' });
  const dateHeader = r.headers.get('date');
  if (!dateHeader) throw new Error(`No Date header from ${REFERENCE_URL}`);
  return new Date(dateHeader).getTime() - Date.now();
}

export const networkOffsetMs = await fetchNetworkOffsetMs();

/** Current UNIX seconds, network-corrected. Use for Stripe-style signing. */
export function networkUnixSeconds() {
  return Math.floor((Date.now() + networkOffsetMs) / 1000);
}

/** Warns to stderr if the local clock is too far off Stripe's tolerance. */
export function warnIfDriftExceedsTolerance(toleranceSeconds = 60) {
  if (Math.abs(networkOffsetMs) > toleranceSeconds * 1000) {
    process.stderr.write(
      `[network-time] local clock drift ${Math.round(networkOffsetMs / 1000)}s — using network time for signing\n`,
    );
  }
}
