#!/usr/bin/env node
/**
 * Sonda o sandbox da Saipos Order API — spike `saipos-portao`.
 *
 * Responde UMA pergunta binária: o token emitido no credenciamento realmente
 * abre os endpoints de mesa/comanda? Se abrir, a rota de POS brasileiro está
 * viva e vale estender o CHECK de `pos_provider` para incluir 'saipos'.
 *
 * SOMENTE LEITURA, de propósito. O endpoint `solicitar-fechamento-mesa`
 * NÃO é chamado: ele muda estado — pinta a mesa de laranja avisando o garçom
 * que o cliente pediu a conta. Sondar não pode disparar isso, nem no sandbox.
 *
 * Uso:
 *   SAIPOS_API_KEY=xxx node scripts/probe-saipos-sandbox.js
 *   SAIPOS_API_KEY=xxx SAIPOS_TABLES=1,5,20 node scripts/probe-saipos-sandbox.js
 *
 * Env:
 *   SAIPOS_API_KEY    (obrigatório) token do painel developer.saipos.com
 *   SAIPOS_BASE_URL   (opcional) default https://order-api.saipos.com
 *   SAIPOS_AUTH_MODE  (opcional) 'header' | 'query' | 'both' (default 'both')
 *                     A doc oferece os dois caminhos — header Authorization
 *                     ou query api_key — e não diz qual vale no sandbox.
 *                     'both' tenta os dois e relata qual funcionou.
 *   SAIPOS_TABLES     (opcional) default 1,5,20
 *   SAIPOS_PADS       (opcional) default 123
 */

const BASE = process.env.SAIPOS_BASE_URL || 'https://order-api.saipos.com';
const KEY = process.env.SAIPOS_API_KEY;
const MODE = process.env.SAIPOS_AUTH_MODE || 'both';
const TABLES = (process.env.SAIPOS_TABLES || '1,5,20').split(',').map((s) => s.trim()).filter(Boolean);
const PADS = (process.env.SAIPOS_PADS || '123').split(',').map((s) => s.trim()).filter(Boolean);
const TIMEOUT_MS = 20000;

if (!KEY) {
  console.error('SAIPOS_API_KEY não definida. Pegue o token em developer.saipos.com.');
  process.exit(2);
}

/**
 * O parâmetro leva COLCHETES LITERAIS e um valor por chamada — `?table=[5]`,
 * não `?table=5` nem `?table[]=5`. A doc engana nesse ponto; o formato foi
 * descoberto sondando o sandbox e está registrado no teardown de 2026-07-27.
 * encodeURIComponent quebraria os colchetes, então a query é montada à mão.
 */
function buildUrl(path, param, value, authInQuery) {
  const parts = [];
  if (param) parts.push(`${param}=[${value}]`);
  if (authInQuery) parts.push(`api_key=${encodeURIComponent(KEY)}`);
  return `${BASE}${path}${parts.length ? '?' + parts.join('&') : ''}`;
}

async function call(label, path, param, value, authInQuery) {
  const url = buildUrl(path, param, value, authInQuery);
  const headers = { Accept: 'application/json' };
  if (!authInQuery) headers.Authorization = KEY;

  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const ms = Date.now() - started;
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* resposta não-JSON entra como texto cru */ }

    // A resposta de sucesso é um ARRAY NO TOPO — mesa livre devolve `[]`,
    // não `{ sales: [...] }`. Um array vazio é sucesso, não falha: prova que
    // o token abriu o endpoint e que a mesa está livre.
    const isArray = Array.isArray(body);
    return {
      label, url: url.replace(encodeURIComponent(KEY), '<KEY>').replace(KEY, '<KEY>'),
      status: res.status, ms, isArray,
      count: isArray ? body.length : null,
      sample: isArray ? body.slice(0, 2) : (body ?? text.slice(0, 300)),
    };
  } catch (err) {
    return { label, url: url.replace(KEY, '<KEY>'), error: err.name === 'AbortError' ? `timeout ${TIMEOUT_MS}ms` : err.message };
  } finally {
    clearTimeout(timer);
  }
}

function verdict(results) {
  const ok = results.filter((r) => r.status === 200 && r.isArray);
  const auth = results.filter((r) => r.status === 401 || r.status === 403);
  if (ok.length) {
    return {
      open: true,
      line: `ROTA VIVA — ${ok.length}/${results.length} chamadas devolveram array com HTTP 200.`,
      next: 'Estender o CHECK de pos_provider em database/migrations/20260126_pos_and_revenue.sql para incluir \'saipos\', e escrever o adaptador (não existe nenhum — conferido no histórico do git).',
    };
  }
  if (auth.length) {
    return { open: false, line: `TOKEN RECUSADO — ${auth.length} chamadas com ${auth.map((a) => a.status).join('/')}.`,
      next: 'Conferir se o token é o do painel developer e se o modo de auth certo é header ou query (SAIPOS_AUTH_MODE).' };
  }
  return { open: false, line: 'INCONCLUSIVO — nenhuma chamada devolveu array nem erro de auth.',
    next: 'Ver os status abaixo. HTTP 950 é modo de contingência da Saipos (GET bloqueado), não recusa de credencial.' };
}

(async () => {
  const modes = MODE === 'both' ? [false, true] : [MODE === 'query'];
  const results = [];

  for (const authInQuery of modes) {
    const tag = authInQuery ? 'query api_key' : 'header Authorization';
    for (const t of TABLES) {
      results.push(await call(`mesa ${t} (${tag})`, '/sale-status-by-table-or-pad', 'table', t, authInQuery));
    }
    for (const p of PADS) {
      results.push(await call(`comanda ${p} (${tag})`, '/sale-status-by-table-or-pad', 'pad', p, authInQuery));
    }
  }

  console.log(`\nSonda Saipos Order API — ${BASE}\n${'='.repeat(60)}`);
  for (const r of results) {
    if (r.error) { console.log(`  ✗ ${r.label}: ${r.error}`); continue; }
    const shape = r.isArray ? `array(${r.count})` : `não-array`;
    console.log(`  ${r.status === 200 ? '✓' : '·'} ${r.label}: HTTP ${r.status} ${shape} ${r.ms}ms`);
    if (r.sample && (!r.isArray || r.count)) console.log(`      ${JSON.stringify(r.sample).slice(0, 200)}`);
  }

  const v = verdict(results);
  console.log(`\n${v.line}\nPróximo passo: ${v.next}\n`);
  process.exit(v.open ? 0 : 1);
})();
