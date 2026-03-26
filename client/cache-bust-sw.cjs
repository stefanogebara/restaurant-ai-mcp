const fs = require('fs');
const f = 'dist/sw.js';
const content = fs.readFileSync(f, 'utf8');
fs.writeFileSync(f, content.replace('seatable-v2', 'seatable-' + Date.now()));
console.log('sw.js cache busted');
