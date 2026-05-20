// Scan locale JSON files for duplicate sibling keys. JSON parsers silently
// accept these and the last value wins — so a translated object can be
// silently overwritten by a later string with the same name, dropping all
// nested translations from the bundle (see cb1573d2 for the bug this caught).
import { readFileSync } from 'node:fs';

const files = [
  'client/src/i18n/locales/en.json',
  'client/src/i18n/locales/pt-BR.json',
  'client/src/i18n/locales/es.json',
];

// Custom reviver — JSON.parse can't surface duplicates, so we tokenize manually.
function findDuplicates(text, filename) {
  const dupes = [];
  // Stack of {start_line, keys: Set} per open object
  const stack = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let line = 1;
  let lastKey = null;
  let keyStart = -1;
  let expectKey = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') line++;

    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') {
      if (!inString) {
        keyStart = i + 1;
        inString = true;
      } else {
        inString = false;
        if (expectKey) {
          const key = text.slice(keyStart, i);
          const ctx = stack[stack.length - 1];
          if (ctx) {
            if (ctx.keys.has(key)) {
              dupes.push({ file: filename, line, key, parent: ctx.path });
            } else {
              ctx.keys.add(key);
            }
            ctx.lastKey = key;
          }
          expectKey = false;
        }
      }
      continue;
    }
    if (inString) continue;

    if (ch === '{') {
      const parentKey = stack.length > 0 ? (stack[stack.length - 1].lastKey || '?') : '$';
      const parentPath = stack.length > 0 ? `${stack[stack.length - 1].path}.${parentKey}` : '$';
      stack.push({ keys: new Set(), path: parentPath, lastKey: null });
      depth++;
      expectKey = true;
    } else if (ch === '}') {
      stack.pop();
      depth--;
    } else if (ch === ',') {
      if (stack.length > 0) expectKey = true;
    } else if (ch === ':') {
      // value coming next, not a key
    }
  }

  return dupes;
}

let total = 0;
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const dupes = findDuplicates(text, f);
  if (dupes.length === 0) {
    console.log(`✓ ${f} — no duplicates`);
  } else {
    console.log(`✗ ${f} — ${dupes.length} duplicate key(s):`);
    for (const d of dupes) {
      console.log(`    line ${d.line}: "${d.key}" inside ${d.parent}`);
    }
    total += dupes.length;
  }
}
process.exit(total > 0 ? 1 : 0);
