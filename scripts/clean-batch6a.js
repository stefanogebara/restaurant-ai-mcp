const fs = require('fs');

const sentEmails = new Set();
const sentNames  = new Set();

const allFiles = [
  'scripts/restaurants-sp.json',
  'scripts/restaurants-sp-new.json',
  'scripts/restaurants-sp-batch3.json',
  'scripts/restaurants-sp-batch4.json',
  'scripts/restaurants-sp-batch5.json',
];

allFiles.forEach(f => {
  if (!fs.existsSync(f)) return;
  JSON.parse(fs.readFileSync(f, 'utf8')).filter(r => r.sent).forEach(r => {
    if (r.email) sentEmails.add(r.email.toLowerCase());
    sentNames.add(r.name.toLowerCase());
  });
});

// Also add names that were already contacted under a different form
const alreadyContactedByName = new Set([
  'sal gastronomia', 'seen restaurant & bar', 'seen', 'picchi', 'restaurante picchi',
  'ristorantino jardins', 'ristorantino caffe', 'ristorantino caffè',
  'maní', 'mani', 'd.o.m.', 'dom', 'nelita', 'evvai', 'ryo gastronomia',
  'parigi', 'mocotó', 'mocoto', 'marena cucina', 'fasano', 'trattoria fasano',
  'gero itaim', 'clandestina', 'corrutela', 'tuju', 'by koji',
  'fogo de chão', 'fogo de chao',
]);

const file = 'scripts/restaurants-sp-batch6a.json';
const list = JSON.parse(fs.readFileSync(file, 'utf8'));

const cleaned = list.filter(r => {
  const nameLower = r.name.toLowerCase().replace(/[^a-záéíóúãõâêôç\s]/g,'').trim();
  const emailDup  = r.email && sentEmails.has(r.email.toLowerCase());
  const nameDup   = sentNames.has(r.name.toLowerCase());
  const contacted = alreadyContactedByName.has(nameLower) || alreadyContactedByName.has(r.name.toLowerCase());
  // Also check if name contains any of the contacted names
  const partialMatch = [...alreadyContactedByName].some(n => nameLower.includes(n) || n.includes(nameLower));

  if (emailDup || nameDup || contacted || partialMatch) {
    console.log('SKIP:', r.name, '—', emailDup ? 'email dup' : nameDup ? 'name dup' : 'already contacted');
    return false;
  }
  return true;
});

fs.writeFileSync(file, JSON.stringify(cleaned, null, 2));
console.log('\nKept:', cleaned.length, 'new restaurants:');
cleaned.forEach(r => console.log(' ', r.name, '—', r.email, `[${r.emailSource}]`));
