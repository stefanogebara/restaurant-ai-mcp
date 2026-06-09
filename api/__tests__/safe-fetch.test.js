/**
 * Tests for the SSRF guards in api/_lib/safe-fetch.js. The actual
 * network fetch isn't exercised here — those live in live smokes.
 * What this catches:
 *   - isPrivateIp coverage across IPv4 + IPv6 + IPv4-mapped IPv6
 *   - Boundary cases (e.g. just outside RFC1918) stay PUBLIC
 *   - Garbage / wrong types fail closed (treated as private)
 *
 * The patterns here mirror the extract-bio-links SSRF tests from C.2
 * (commit 843026c8). Keeping them locally in safe-fetch.test.js so a
 * future refactor that changes the helper has to update its own tests.
 */

const { isPrivateIp } = require('../_lib/safe-fetch');

describe('isPrivateIp — SSRF blocklist', () => {
  test.each([
    // IPv4 private ranges
    ['10.0.0.1', true],
    ['10.255.255.255', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['192.168.0.1', true],
    ['127.0.0.1', true],
    ['127.255.255.255', true],
    ['0.0.0.0', true],
    // AWS / GCP / Azure metadata
    ['169.254.169.254', true],
    ['169.254.0.1', true],
    // Carrier-grade NAT
    ['100.64.0.1', true],
    ['100.127.255.254', true],
    // Multicast
    ['224.0.0.1', true],
    ['239.255.255.255', true],
    // Reserved
    ['240.0.0.1', true],
    ['255.255.255.255', true],
    // IPv6 loopback + ULA + link-local + multicast
    ['::1', true],
    ['fc00::1', true],
    ['fd12:3456:789a:1::1', true],
    ['fe80::1', true],
    ['ff02::1', true],
    // IPv4-mapped IPv6 to private space
    ['::ffff:10.0.0.1', true],
    ['::ffff:127.0.0.1', true],
    ['::ffff:169.254.169.254', true],
  ])('blocks private/loopback/link-local: %s', (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });

  test.each([
    ['8.8.8.8', false],            // Google DNS
    ['1.1.1.1', false],            // Cloudflare DNS
    ['172.15.0.1', false],         // 172.15 is public (just outside 172.16/12)
    ['172.32.0.1', false],         // 172.32 is public (just past 172.31)
    ['100.63.255.255', false],     // 100.63 is public (just before 100.64/10)
    ['100.128.0.1', false],        // 100.128 is public (just past 100.127)
    ['192.169.0.1', false],        // 192.169 is public (not 192.168)
    ['169.255.0.1', false],        // 169.255 is public (not 169.254)
    ['223.255.255.255', false],    // 223 is public (just before multicast 224)
    ['2606:4700::1111', false],    // Cloudflare IPv6
    ['::ffff:8.8.8.8', false],     // IPv4-mapped public
  ])('allows public IPs: %s', (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });

  test('fails closed on garbage', () => {
    expect(isPrivateIp('not an ip')).toBe(true);
    expect(isPrivateIp('999.999.999.999')).toBe(true);
    expect(isPrivateIp('')).toBe(true);
    expect(isPrivateIp(null)).toBe(true);
    expect(isPrivateIp(undefined)).toBe(true);
    expect(isPrivateIp(42)).toBe(true);
  });
});
