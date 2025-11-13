const fs = require('fs');
const content = fs.readFileSync('api/_lib/validation.js.backup', 'utf8');
const newContent = content.replace(
  '  const phonePattern = /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/;',
  '  const phonePattern = /^[\+]?[\d\s\-\(\)\.]+$/;'
);
fs.writeFileSync('api/_lib/validation.js', newContent, 'utf8');
console.log('Fixed!');
