const fs = require('fs');

const sentEmails = new Set();
const sentNames  = new Set();

const allFiles = [
  'scripts/restaurants-sp.json',
  'scripts/restaurants-sp-new.json',
  'scripts/restaurants-sp-batch3.json',
  'scripts/restaurants-sp-batch4.json',
  'scripts/restaurants-sp-batch5.json',
  'scripts/restaurants-sp-batch6a.json',
];

allFiles.forEach(f => {
  if (!fs.existsSync(f)) return;
  JSON.parse(fs.readFileSync(f, 'utf8')).filter(r => r.sent).forEach(r => {
    if (r.email) sentEmails.add(r.email.toLowerCase());
    sentNames.add(r.name.toLowerCase());
  });
});

const file = 'scripts/restaurants-sp-batch6b.json';
const list = JSON.parse(fs.readFileSync(file, 'utf8'));

const cleaned = list.filter(r => {
  const nameLower = r.name.toLowerCase();
  const email = (r.email || '').toLowerCase();

  // Skip Gmail / Yahoo / Hotmail addresses (not official)
  if (email.includes('@gmail.com') || email.includes('@yahoo.com') || email.includes('@hotmail.com')) {
    console.log('SKIP (personal email):', r.name, '—', r.email);
    return false;
  }

  // Skip if email already sent
  if (sentEmails.has(email)) {
    console.log('SKIP (email dup):', r.name, '—', r.email);
    return false;
  }

  // Skip if name already sent
  if (sentNames.has(nameLower)) {
    console.log('SKIP (name dup):', r.name);
    return false;
  }

  // Skip already-contacted restaurants (name fragments)
  const skipFragments = ['cuia', 'bel coelho', 'fasano', 'fogo de chão', 'fogo de chao', 'sal gastronomia', 'picchi', 'ristorantino'];
  if (skipFragments.some(f => nameLower.includes(f))) {
    console.log('SKIP (known contact):', r.name);
    return false;
  }

  return true;
});

fs.writeFileSync(file, JSON.stringify(cleaned, null, 2));
console.log('\nKept:', cleaned.length, 'new restaurants:');
cleaned.forEach(r => console.log(' ', r.name, '—', r.email, `[${r.emailSource}]`));
