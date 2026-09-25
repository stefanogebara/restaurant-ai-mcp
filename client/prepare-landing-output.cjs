const fs = require('node:fs');
const path = require('node:path');

const dist = path.join(__dirname, 'dist');
const app = path.join(dist, 'index.html');
const landing = path.join(dist, 'seatable-prototype.html');

// Vercel serves a physical index.html before evaluating rewrites. Keep the
// existing React app as the fallback document and put the landing at the root.
fs.copyFileSync(app, path.join(dist, 'app.html'));
fs.copyFileSync(landing, app);
