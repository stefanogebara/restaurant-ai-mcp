/**
 * Instagram DM Outreach — generates copy-paste messages for each restaurant.
 *
 * Usage:
 *   node scripts/insta-outreach-messages.js          # print all
 *   node scripts/insta-outreach-messages.js --csv     # export CSV
 */

const fs = require('fs');
const path = require('path');

const scriptsDir = __dirname;
const files = fs.readdirSync(scriptsDir).filter(f => /^restaurants-sp.*\.json$/.test(f));
const seen = new Set();
const restaurants = [];

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(scriptsDir, file), 'utf8'));
  for (const r of data) {
    if (r.sent || r.email) continue;
    if (!r.instagram) continue;
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    restaurants.push({ ...r, _sourceFile: file });
  }
}

function buildDM(r) {
  const demoUrl = `https://restaurant-ai-mcp.vercel.app/demo/setup?ref=ig-outreach&restaurant=${encodeURIComponent(r.name)}`;

  return `Oi! Tudo bem? 👋

Me chamo Stefano e criei o Seatable — uma IA que gerencia reservas e funciona como um gerente inteligente para restaurantes.

Para o ${r.name}, ele faria duas coisas:

1️⃣ Atender chamadas e WhatsApp 24h, fazer reservas automaticamente e mandar lembrete pro cliente

2️⃣ Analisar seus dados (ocupação, no-shows, horários de pico) e apontar oportunidades que passam despercebidas no dia a dia

Criei uma demo personalizada pra vocês testarem:
${demoUrl}

Planos a partir de R$149/mês. Se não for o momento, sem problema! 😊`;
}

if (process.argv.includes('--csv')) {
  const lines = ['Instagram,Restaurant,Neighborhood,Message'];
  for (const r of restaurants) {
    const msg = buildDM(r).replace(/"/g, '""').replace(/\n/g, ' | ');
    lines.push(`"${r.instagram}","${r.name}","${r.neighborhood || ''}","${msg}"`);
  }
  const outPath = path.join(scriptsDir, 'insta-outreach.csv');
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(`Wrote ${restaurants.length} entries to ${outPath}`);
} else {
  for (let i = 0; i < restaurants.length; i++) {
    const r = restaurants[i];
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`[${i + 1}/${restaurants.length}] ${r.instagram} — ${r.name} (${r.neighborhood || ''})`);
    console.log('═'.repeat(60));
    console.log(buildDM(r));
  }
  console.log(`\n\nTotal: ${restaurants.length} messages ready`);
  console.log('Tip: run with --csv to export for batch tracking');
}
