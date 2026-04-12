/**
 * Instagram DM Outreach — Remaining batches (day 2 & 3)
 *
 * Run in Playwright browser console while logged into Instagram.
 * Batch 1 (50) sent on 2026-03-04.
 *
 * Usage: Copy the restaurants array for the day's batch into the
 * Playwright script from insta-outreach-messages.js pattern.
 */

// Already sent via IG DM (batch 1 + no-email batch)
const ALREADY_SENT = new Set([
  // No-email batch (25)
  'linaristorante', 'marenacucina', 'giannirestaurante', 'sovarestaurante',
  'songqi.sp', 'miyabi.br', 'lenaemsp', 'caco.sp', 'maresdelaperuana',
  'broca.sp', 'joyaboulangerie', 'casadosaulosp', 'basq.sp', 'immarestaurante',
  'metzirestaurant', 'kosho.japanese', 'ossosaopaulo', 'barbacoabrasil',
  'atto.restaurante', 'goyazushi', 'bosco.restaurante', 'tanukisushioficial', 'kubozushi',
  // Email follow-up batch 1 (50)
  'animusrestaurante', 'louprestaurante', 'paparotocucina', 'giulietta.carni',
  'piu_restaurante', 'caladeltanit', 'thaitaibrasil', 'biahoisp', 'misssaigonbr',
  'wooza.sp', 'cervejarianacional', 'estherrooftop', 'notieporpriceless',
  'piccolicucina', 'donafelicidade', 'labracierapizza', 'sptaphouse', 'duecuochi',
  'seensaopaulo', 'banzeiro.oficial', 'tordesilhas', 'cantalouprestaurante',
  'restaurantechou', 'restaurantearturito', 'ryogastronomia', 'afigueirarubaiyat',
  'acasadoporco', 'ninocucina', 'kosushi', 'tascadaesquina_', 'antoniettacucina',
  'ristorantino_', 'piporestaurante', 'josephinerestaurante', 'fasano',
  'grottacucina', 'shinju_sp', 'mocotorestaurante', 'quincho.sp', 'gerofasano',
  'tangarajeangeorges', 'terracojardins', 'salgastronomia', 'restauranteneto',
  'restaurantecarlota', 'gioiasaopaulo', 'kanoerestaurant', 'famigliamancini',
  'vistarestaurantesp', 'evvairestaurante',
]);

const fs = require('fs');
const path = require('path');

const scriptsDir = __dirname;
const files = fs.readdirSync(scriptsDir).filter(f => /^restaurants-sp.*\.json$/.test(f));
const seen = new Set();
const remaining = [];

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(scriptsDir, file), 'utf8'));
  for (const r of data) {
    if (!r.sent || !r.email) continue;
    if (r.sentAt === 'dedup-skip') continue;
    if (!r.instagram) continue;
    const handle = r.instagram.replace('@', '');
    if (seen.has(handle) || ALREADY_SENT.has(handle)) continue;
    seen.add(handle);
    remaining.push({ handle, name: r.name });
  }
}

console.log(`Remaining IG DM targets: ${remaining.length}`);
console.log(`\nDay 2 (next 50):`);
const day2 = remaining.slice(0, 50);
const day3 = remaining.slice(50);

for (let i = 0; i < day2.length; i++) {
  console.log(`  ${(i+1).toString().padStart(2)}. @${day2[i].handle.padEnd(30)} — ${day2[i].name}`);
}

if (day3.length > 0) {
  console.log(`\nDay 3 (remaining ${day3.length}):`);
  for (let i = 0; i < day3.length; i++) {
    console.log(`  ${(i+1).toString().padStart(2)}. @${day3[i].handle.padEnd(30)} — ${day3[i].name}`);
  }
}

// Export as JSON for easy copy-paste into Playwright
fs.writeFileSync(
  path.join(scriptsDir, 'ig-outreach-day2.json'),
  JSON.stringify(day2, null, 2)
);
if (day3.length > 0) {
  fs.writeFileSync(
    path.join(scriptsDir, 'ig-outreach-day3.json'),
    JSON.stringify(day3, null, 2)
  );
}
console.log(`\nSaved: ig-outreach-day2.json (${day2.length}), ig-outreach-day3.json (${day3.length})`);
