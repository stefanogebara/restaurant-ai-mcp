const fs = require('fs');

const sentEmails = new Set();
const sentNames = new Set();
['scripts/restaurants-sp.json','scripts/restaurants-sp-new.json','scripts/restaurants-sp-batch3.json'].forEach(f => {
  if (!fs.existsSync(f)) return;
  JSON.parse(fs.readFileSync(f,'utf8')).filter(r => r.sent).forEach(r => {
    if (r.email) sentEmails.add(r.email.toLowerCase());
    sentNames.add(r.name.toLowerCase());
  });
});

// same restaurant, different email — still skip
const skipNames = ['chou','arturito','cantaloup','nelita','tordesilhas','ryo gastronomia','fasano','marena cucina'];

const file = 'scripts/restaurants-sp-batch4.json';
const list = JSON.parse(fs.readFileSync(file,'utf8'));
const cleaned = list.filter(r => {
  const emailDup = r.email && sentEmails.has(r.email.toLowerCase());
  const nameDup  = sentNames.has(r.name.toLowerCase());
  const skip     = skipNames.includes(r.name.toLowerCase());
  if (emailDup || nameDup || skip) {
    console.log('SKIP:', r.name, '-', emailDup ? 'email dup' : nameDup ? 'name dup' : 'same restaurant');
    return false;
  }
  return true;
});

fs.writeFileSync(file, JSON.stringify(cleaned, null, 2));
console.log('Kept:', cleaned.length, 'restaurants');
cleaned.forEach(r => console.log(' ', r.name, '-', r.email));
