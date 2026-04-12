const fs = require('fs');
const https = require('https');
const path = require('path');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  const html = await fetch('https://www.thiings.co/things');
  const pushes = [...html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)];
  let combined = '';
  pushes.forEach(m => combined += m[1]);
  combined = combined.replace(/\\"/g, '"').replace(/\\\//g, '/');

  const regPattern = /"id":"([^"]+)","name":"([^"]+)","categories":\[([^\]]*)\],"fileId":"([^"]+)"/g;
  const catalog = [];
  let x;
  while ((x = regPattern.exec(combined)) !== null) {
    catalog.push({ id: x[1], name: x[2], fileId: x[4] });
  }

  const terms = ['arrow', 'chevron', 'link', 'chain', 'wifi', 'signal', 'phone', 'calendar', 'send', 'paper', 'translate', 'globe', 'language', 'neighborhood', 'house', 'suburb', 'voice', 'speak', 'talk', 'activity', 'heartbeat', 'pulse', 'right-arrow', 'left-arrow', 'down-arrow', 'up-arrow'];

  for (const term of terms) {
    const matches = catalog.filter(i => i.id.includes(term));
    if (matches.length > 0) {
      console.log('\n--- ' + term + ' (' + matches.length + ' matches) ---');
      matches.slice(0, 8).forEach(mm => console.log('  "' + mm.id + '" (' + mm.name + ') fileId:' + mm.fileId));
    }
  }
}

main().catch(console.error);
