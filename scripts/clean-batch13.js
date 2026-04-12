const fs = require('fs');

const sentEmails = new Set();
const sentNames  = new Set();
const sentDomains = new Set();

const allFiles = [
  'scripts/restaurants-sp.json',
  'scripts/restaurants-sp-new.json',
  'scripts/restaurants-sp-batch3.json',
  'scripts/restaurants-sp-batch4.json',
  'scripts/restaurants-sp-batch5.json',
  'scripts/restaurants-sp-batch6a.json',
  'scripts/restaurants-sp-batch6b.json',
  'scripts/restaurants-sp-batch7.json',
  'scripts/restaurants-sp-batch8.json',
  'scripts/restaurants-sp-batch9.json',
  'scripts/restaurants-sp-batch10.json',
  'scripts/restaurants-sp-batch11.json',
  'scripts/restaurants-sp-batch12.json',
];

allFiles.forEach(f => {
  if (!fs.existsSync(f)) return;
  JSON.parse(fs.readFileSync(f, 'utf8')).filter(r => r.sent).forEach(r => {
    if (r.email) {
      sentEmails.add(r.email.toLowerCase());
      const domain = r.email.toLowerCase().split('@')[1];
      if (domain) sentDomains.add(domain);
    }
    sentNames.add(r.name.toLowerCase());
  });
});

const skipFragments = ['fasano', 'fogo de chao', 'fogo de chão'];

const file = 'scripts/restaurants-sp-batch13.json';
const list = JSON.parse(fs.readFileSync(file, 'utf8'));

const cleaned = list.filter(r => {
  const nameLower = r.name.toLowerCase();
  const email = (r.email || '').toLowerCase();
  const domain = email.split('@')[1];

  if (!r.email) {
    console.log('SKIP (no email):', r.name);
    return false;
  }
  if (email.includes('@gmail.com') || email.includes('@yahoo.com') || email.includes('@hotmail.com')) {
    console.log('SKIP (personal email):', r.name, '—', r.email);
    return false;
  }
  if (sentEmails.has(email)) {
    console.log('SKIP (email dup):', r.name);
    return false;
  }
  if (sentNames.has(nameLower)) {
    console.log('SKIP (name dup):', r.name);
    return false;
  }
  if (skipFragments.some(f => nameLower.includes(f))) {
    console.log('SKIP (known contact):', r.name);
    return false;
  }
  if (domain && sentDomains.has(domain)) {
    console.log('SKIP (same domain/group):', r.name, '—', domain);
    return false;
  }
  return true;
});

fs.writeFileSync(file, JSON.stringify(cleaned, null, 2));
console.log('\nKept:', cleaned.length, 'new restaurants:');
cleaned.forEach(r => console.log(' ', r.name, '—', r.email));
