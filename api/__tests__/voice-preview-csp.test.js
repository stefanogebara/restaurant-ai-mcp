const vercel = require('../../vercel.json');

// Observed production failure: ElevenLabs' library returned an MP3 below
// storage.googleapis.com/eleven-public-prod/, rejected by media-src (error 4).
const previewBucket = 'https://storage.googleapis.com/eleven-public-prod/';
const policies = vercel.headers.flatMap(rule => rule.headers
  .filter(header => header.key.toLowerCase() === 'content-security-policy')
  .map(header => [rule.source, header.value]));

test.each(policies)('allows the actual library sample bucket on %s without widening other sources', (_source, policy) => {
  const directives = Object.fromEntries(policy.split(';').map(value => value.trim()).filter(Boolean)
    .map(value => { const [name, ...sources] = value.split(/\s+/); return [name, sources]; }));
  expect(directives['media-src']).toContain(previewBucket);
  expect(directives['media-src']).not.toContain('https://storage.googleapis.com');
  expect(directives['media-src']).not.toContain('https:');
  expect(directives['script-src']).not.toContain(previewBucket);
  expect(directives['connect-src']).not.toContain(previewBucket);
});
