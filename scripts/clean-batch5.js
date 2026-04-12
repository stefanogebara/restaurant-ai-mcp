const fs = require('fs');

const sentEmails = new Set();
const sentNames  = new Set();

const allFiles = [
  'scripts/restaurants-sp.json',
  'scripts/restaurants-sp-new.json',
  'scripts/restaurants-sp-batch3.json',
  'scripts/restaurants-sp-batch4.json',
];

allFiles.forEach(f => {
  if (!fs.existsSync(f)) return;
  JSON.parse(fs.readFileSync(f, 'utf8')).filter(r => r.sent).forEach(r => {
    if (r.email) sentEmails.add(r.email.toLowerCase());
    sentNames.add(r.name.toLowerCase());
  });
});

// Restaurants whose name we already contacted (even if different email)
const alreadyContactedByName = new Set([
  'maní','mani','d.o.m.','dom','nelita','evvai','ryo gastronomia',
  'sal gastronomia','parigi','mocotó','mocoto','marena cucina','fasano',
  'trattoria fasano','gero itaim','clandestina','corrutela','tuju','by koji',
]);

const file = 'scripts/restaurants-sp-batch5.json';
const list = JSON.parse(fs.readFileSync(file, 'utf8'));

const cleaned = list.filter(r => {
  const nameLower = r.name.toLowerCase().replace(/[^a-záéíóúãõâêôç\s]/g,'').trim();
  const emailDup  = r.email && sentEmails.has(r.email.toLowerCase());
  const nameDup   = sentNames.has(r.name.toLowerCase());
  const contacted = alreadyContactedByName.has(nameLower) || alreadyContactedByName.has(r.name.toLowerCase());

  if (emailDup || nameDup || contacted) {
    console.log('SKIP:', r.name, '—', emailDup ? 'email dup' : nameDup ? 'name dup' : 'already contacted');
    return false;
  }
  return true;
});

fs.writeFileSync(file, JSON.stringify(cleaned, null, 2));
console.log('\nKept:', cleaned.length, 'new restaurants:');
cleaned.forEach(r => console.log(' ', r.name, '—', r.email, `[${r.emailSource}]`));
