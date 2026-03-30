const fs = require('fs');
const f = 'dist/sw.js';
const content = fs.readFileSync(f, 'utf8');
// Replace any seatable-vN or seatable-TIMESTAMP cache version with a fresh timestamp.
// Previous version only matched 'seatable-v2' but sw.js had 'seatable-v3', so cache
// busting was silently broken — old service worker caches were never invalidated.
const updated = content.replace(/seatable-v\d+|seatable-\d{13,}/, 'seatable-' + Date.now());
if (updated === content) {
  console.warn('WARNING: sw.js cache version pattern not found — cache bust may have failed');
}
fs.writeFileSync(f, updated);
console.log('sw.js cache busted -> seatable-' + Date.now());
