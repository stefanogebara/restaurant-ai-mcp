#!/usr/bin/env node
/**
 * Project Wiki Compiler — Karpathy LLM Wiki pattern for the codebase itself
 *
 * Compiles raw project data (git history, API routes, DB schema, crons, TODOs)
 * into structured markdown wiki articles via Claude Haiku.
 *
 * Output: docs/wiki/*.md  (Obsidian-readable, git-tracked)
 * Usage:  node scripts/compile-project-wiki.js [--force] [--slug=<name>]
 *
 * Slugs: architecture | recent-changes | api-endpoints | database | active-issues
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') });

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const WIKI_DIR = path.join(ROOT, 'docs/wiki');
const HASH_FILE = path.join(WIKI_DIR, '.hashes.json');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.error('Missing OPENROUTER_API_KEY in .env.local');
  process.exit(1);
}

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ONLY_SLUG = args.find(a => a.startsWith('--slug='))?.split('=')[1];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function md5(text) {
  return crypto.createHash('md5').update(text).digest('hex');
}

function loadHashes() {
  try { return JSON.parse(fs.readFileSync(HASH_FILE, 'utf8')); }
  catch { return {}; }
}

function saveHashes(hashes) {
  fs.writeFileSync(HASH_FILE, JSON.stringify(hashes, null, 2));
}

/** Run a command safely using spawnSync (no shell injection risk). */
function run(cmd, cmdArgs = [], opts = {}) {
  const result = spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
  return (result.stdout || '').trim();
}

async function callClaude(prompt) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://seatable.one',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3.5-haiku',
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// ─── Data Collectors ──────────────────────────────────────────────────────────

function collectGitLog() {
  return run('git', ['log', '--oneline', '--no-merges', '-40']);
}

function collectRecentDiff() {
  return run('git', ['log', '--stat', '--no-merges', '-10', '--pretty=format:--- %h %s']);
}

function collectApiRoutes() {
  const apiDir = path.join(ROOT, 'api');
  const apiFiles = fs.readdirSync(apiDir)
    .filter(f => f.endsWith('.js') && !f.startsWith('_') && !f.startsWith('.'))
    .sort();

  const routes = [];
  for (const file of apiFiles) {
    const content = fs.readFileSync(path.join(apiDir, file), 'utf8');
    const actionMatches = [...content.matchAll(/case ['"](\w+)['"]/g)].map(m => m[1]);
    const methodMatches = [...content.matchAll(/req\.method\s*===?\s*['"](\w+)['"]/g)].map(m => m[1]);
    const descMatch = content.match(/\/\*\*[\s\S]*?\*\//);
    const firstComment = descMatch?.[0]?.split('\n').slice(1, 4)
      .map(l => l.replace(/^\s*\*\s?/, '')).join(' ').trim().slice(0, 120) || '';
    routes.push({
      file: `/api/${file.replace('.js', '')}`,
      actions: actionMatches.slice(0, 6),
      methods: [...new Set(methodMatches)],
      description: firstComment,
    });
  }
  return routes;
}

function collectCronJobs() {
  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  return (vercel.crons || []).map(c => `${c.schedule.padEnd(20)} ${c.path}`).join('\n');
}

function collectMigrations() {
  const dir = path.join(ROOT, 'supabase/migrations');
  if (!fs.existsSync(dir)) return 'No migrations found.';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort().slice(-15);
  return files.map(f => {
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    const tables = [...content.matchAll(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?(\S+)/gi)].map(m => m[1]);
    const alters = [...content.matchAll(/ALTER TABLE\s+(\S+)/gi)].map(m => m[1]);
    const summary = [...tables.map(t => `CREATE ${t}`), ...alters.map(t => `ALTER ${t}`)].join(', ')
      || content.slice(0, 120).replace(/\n/g, ' ');
    return `${f}: ${summary}`;
  }).join('\n');
}

function collectTodos() {
  // Grep for TODOs using spawnSync (safe — no user input in args)
  const result = spawnSync('grep', [
    '-rn', 'TODO\\|FIXME\\|HACK\\|XXX',
    'api/', 'client/src/',
    '--include=*.js', '--include=*.ts', '--include=*.tsx',
    '--exclude-dir=node_modules', '--exclude-dir=__tests__',
  ], { cwd: ROOT, encoding: 'utf8' });

  const lines = (result.stdout || '').split('\n').filter(Boolean).slice(0, 25);
  return lines.join('\n') || 'No TODOs found.';
}

function collectFileStructure() {
  const lines = [];
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage']);

  function scan(dir, depth, prefix) {
    if (depth > 2) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => !skip.has(e.name) && !e.name.startsWith('.'))
        .sort((a, b) => (b.isDirectory() - a.isDirectory()) || a.name.localeCompare(b.name))
        .slice(0, 18);
    } catch { return; }

    for (const entry of entries) {
      lines.push(`${prefix}${entry.isDirectory() ? 'd' : 'f'} ${entry.name}`);
      if (entry.isDirectory() && depth < 2) {
        scan(path.join(dir, entry.name), depth + 1, prefix + '  ');
      }
    }
  }
  scan(ROOT, 0, '');
  return lines.join('\n');
}

function collectTestStats() {
  const backendDir = path.join(ROOT, 'api/__tests__');
  const backendCount = fs.existsSync(backendDir)
    ? fs.readdirSync(backendDir).filter(f => f.endsWith('.test.js')).length
    : 0;

  let frontendCount = 0;
  const countTests = (dir) => {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name === 'node_modules') continue;
      if (e.isDirectory()) countTests(path.join(dir, e.name));
      else if (e.name.match(/\.(test|spec)\.(ts|tsx|js)$/)) frontendCount++;
    }
  };
  countTests(path.join(ROOT, 'client/src'));

  return `Backend test files: ${backendCount} (Jest)\nFrontend test files: ${frontendCount} (Vitest + RTL)`;
}

// ─── Wiki Prompts ─────────────────────────────────────────────────────────────

const ARTICLES = {
  architecture: {
    title: 'Architecture Overview',
    collect: () => ({
      structure: collectFileStructure(),
      claudeMd: fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8').slice(0, 3000),
      testStats: collectTestStats(),
    }),
    prompt: (d) => `You are writing a wiki article for a developer working on this codebase via Claude Code.

Project: Seatable — AI-powered restaurant management platform (voice/WhatsApp reservations + manager AI)
Tech stack from CLAUDE.md:
${d.claudeMd}

File structure:
${d.structure}

Test coverage: ${d.testStats}

Write a concise ARCHITECTURE article (4-6 paragraphs) covering:
1. What this project is and what it does
2. Tech stack and key dependencies
3. Project structure (api/, client/src/, key directories)
4. Multi-tenancy model (restaurant_id scoping, RLS)
5. Key architectural patterns (serverless functions, demo flow, Manager AI wiki)
6. Testing approach and coverage

Write in third person. Be specific. Include file paths where relevant.`,
  },

  'recent-changes': {
    title: 'Recent Changes',
    collect: () => ({
      log: collectGitLog(),
      diff: collectRecentDiff(),
    }),
    prompt: (d) => `You are writing a wiki article for a developer working on this codebase via Claude Code.

Recent git commits (last 40, newest first):
${d.log}

Recent diff stats (last 10 commits):
${d.diff}

Write a concise RECENT CHANGES article (3-5 paragraphs) covering:
1. What has been built or changed in the last 2-3 weeks (group by theme/feature)
2. Key files that changed most recently
3. Patterns in the recent work (bug fixes? new features? refactoring?)
4. Current development focus implied by the commit history

Be specific with commit hashes and file names. Write in present tense.`,
  },

  'api-endpoints': {
    title: 'API Endpoints',
    collect: () => ({ routes: collectApiRoutes(), cronJobs: collectCronJobs() }),
    prompt: (d) => `You are writing a wiki article for a developer working on this codebase via Claude Code.

API files and their actions:
${d.routes.map(r =>
  `${r.file} [${r.methods.join(',')||'mixed'}]${r.actions.length ? ` — actions: ${r.actions.join(', ')}` : ''}\n  ${r.description}`
).join('\n')}

Cron jobs:
${d.cronJobs}

Write a concise API ENDPOINTS article (4-5 paragraphs) covering:
1. Overview: how many endpoints, URL pattern (/api/*)
2. Auth patterns: JWT middleware, CRON_SECRET, public vs protected
3. Domain groups: reservations, demo, manager AI, voice/ElevenLabs, WhatsApp, payments/Stripe, portal/booking
4. Cron jobs: what runs when
5. Conventions for adding new endpoints (cors, rate-limit, auth, secure-logger)

Be specific with endpoint paths.`,
  },

  database: {
    title: 'Database Schema',
    collect: () => ({
      migrations: collectMigrations(),
      schemaNotes: fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8')
        .match(/## Database Schema[\s\S]*?(?=\n## )/)?.[0] || '',
    }),
    prompt: (d) => `You are writing a wiki article for a developer working on this codebase via Claude Code.

Recent database migrations:
${d.migrations}

Schema notes from CLAUDE.md:
${d.schemaNotes}

Write a concise DATABASE article (4-5 paragraphs) covering:
1. Platform: Supabase PostgreSQL, RLS, pgvector
2. Schema split: public schema vs restaurant schema
3. Key tables: reservations, tables, waitlist, service_records, restaurant_config, manager_memory, restaurant_wiki_pages
4. Multi-tenancy: restaurant_id on every operational table, RLS policies
5. Client split: supabaseAdmin (service role, bypasses RLS) vs supabaseClient (anon, respects RLS)
6. Recent additions (from migrations list)

Include table names and important columns.`,
  },

  'active-issues': {
    title: 'Active Issues & TODOs',
    collect: () => ({
      todos: collectTodos(),
      recentFixes: run('git', ['log', '--oneline', '--no-merges', '-20', '--grep=fix:']),
      cronJobs: collectCronJobs(),
    }),
    prompt: (d) => `You are writing a wiki article for a developer working on this codebase via Claude Code.

TODOs and FIXMEs found in codebase:
${d.todos}

Recent bug fixes (git log --grep=fix:):
${d.recentFixes}

Cron jobs (potential failure points):
${d.cronJobs}

Write a concise ACTIVE ISSUES article (3-5 paragraphs) covering:
1. Open TODOs and FIXMEs with file:line locations, grouped by severity
2. Patterns in recent bug fixes — what areas keep needing attention
3. Cron job risks: which crons could fail silently, timing concerns
4. Fragile areas based on fix frequency
5. Suggested focus areas for a developer picking up this project

Be specific. Prioritize by impact on production.`,
  },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function compileArticle(slug) {
  const article = ARTICLES[slug];
  if (!article) throw new Error(`Unknown slug: ${slug}. Valid: ${Object.keys(ARTICLES).join(', ')}`);

  process.stdout.write(`  Collecting ${slug}...`);
  const data = article.collect();
  const newHash = md5(JSON.stringify(data));

  const hashes = loadHashes();
  if (!FORCE && hashes[slug] === newHash) {
    console.log(` skipped (unchanged)`);
    return false;
  }

  process.stdout.write(` compiling...`);
  const content = await callClaude(article.prompt(data));
  if (!content) throw new Error('Empty response from Claude');

  const outPath = path.join(WIKI_DIR, `${slug}.md`);
  const header = [
    '---',
    `title: "${article.title}"`,
    `slug: ${slug}`,
    `compiled_at: "${new Date().toISOString()}"`,
    '---',
    '',
  ].join('\n');

  fs.writeFileSync(outPath, header + content + '\n');
  hashes[slug] = newHash;
  saveHashes(hashes);

  console.log(` done → docs/wiki/${slug}.md`);
  return true;
}

function writeIndex() {
  const lines = [
    '# Seatable Project Wiki',
    '',
    '> Auto-compiled via `node scripts/compile-project-wiki.js` (Karpathy LLM Wiki pattern).',
    '> Raw codebase data → Claude Haiku → structured articles.',
    '',
    '## Articles',
    '',
  ];

  for (const [slug, article] of Object.entries(ARTICLES)) {
    const filePath = path.join(WIKI_DIR, `${slug}.md`);
    const exists = fs.existsSync(filePath);
    const mtime = exists
      ? new Date(fs.statSync(filePath).mtime).toISOString().split('T')[0]
      : 'not compiled';
    lines.push(`- [[${slug}]] — **${article.title}** _(${mtime})_`);
  }

  lines.push(
    '',
    '## Commands',
    '',
    '```bash',
    '# Compile all (skips unchanged data)',
    'node scripts/compile-project-wiki.js',
    '',
    '# Force recompile everything',
    'node scripts/compile-project-wiki.js --force',
    '',
    '# Single article',
    'node scripts/compile-project-wiki.js --slug=recent-changes',
    '```',
    '',
    '## Obsidian',
    '',
    'Open `docs/wiki/` as an Obsidian vault. `[[wikilinks]]` resolve between articles.',
    'Add this vault to Obsidian → Open folder as vault → select `docs/wiki/`.',
    '',
    '## Claude Code Hook',
    '',
    'Add to `~/.claude/settings.json` to auto-refresh on session start:',
    '```json',
    '{',
    '  "hooks": {',
    '    "SessionStart": [{',
    '      "matcher": "restaurant-ai-mcp",',
    '      "hooks": [{"type": "command", "command": "node scripts/compile-project-wiki.js"}]',
    '    }]',
    '  }',
    '}',
    '```',
  );

  fs.writeFileSync(path.join(WIKI_DIR, 'README.md'), lines.join('\n') + '\n');
}

async function main() {
  console.log('📚 Seatable Project Wiki Compiler\n');

  if (!fs.existsSync(WIKI_DIR)) fs.mkdirSync(WIKI_DIR, { recursive: true });

  const slugs = ONLY_SLUG ? [ONLY_SLUG] : Object.keys(ARTICLES);
  let compiled = 0;
  let skipped = 0;
  const errors = [];

  for (const slug of slugs) {
    try {
      const did = await compileArticle(slug);
      if (did) compiled++; else skipped++;
    } catch (err) {
      console.log(` ERROR: ${err.message}`);
      errors.push(slug);
    }
  }

  writeIndex();

  console.log(`\n✅ Done — ${compiled} compiled, ${skipped} skipped, ${errors.length} errors`);
  if (errors.length) console.log(`   Errors: ${errors.join(', ')}`);
  console.log('   Obsidian vault: docs/wiki/');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
