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
 * AUTENTICAÇÃO — a parte que a doc pública NÃO explica.
 * A primeira versão desta sonda estava errada: assumia que o valor do painel
 * era um token estático de API. Não é. O fluxo real, descoberto sondando em
 * 2026-08-25 porque o portal não documenta:
 *
 *   POST /auth  { "idPartner": "<Id Partner>", "secret": "<chave do painel>" }
 *     → 200 { "token": "<JWT>" }, válido 48h (bate com o "2 dias" do FAQ)
 *   depois:  Authorization: <JWT>   (cru, SEM prefixo Bearer)
 *
 * Os nomes dos campos são camelCase e isso importa: `id_partner` em
 * snake_case devolve 400 "Id do parceiro ou secret inválidos!" — a mesma
 * mensagem que credencial errada dá, então é fácil culpar a credencial
 * quando o erro é a grafia.
 *
 * A doc de `criar-pedido` diz "informe o token gerado na rota de
 * autenticação" mas em nenhum lugar diz qual é essa rota. Achada varrendo
 * caminhos prováveis: só /auth responde algo diferente de 404.
 *
 * Uso:
 *   SAIPOS_ID_PARTNER=xxx SAIPOS_SECRET=yyy node scripts/probe-saipos-sandbox.js
 *
 * Env:
 *   SAIPOS_ID_PARTNER (obrigatório) "Id Partner" do painel developer.saipos.com
 *   SAIPOS_SECRET     (obrigatório) a chave do painel
 *   SAIPOS_BASE_URL   (opcional) default https://order-api.saipos.com
 *                     — é a "URL base p/ requisições" que o painel mostra;
 *                       não existe host de sandbox separado
 *   SAIPOS_TABLES     (opcional) default 1,5,20
 *   SAIPOS_PADS       (opcional) default 123
 */

const BASE = process.env.SAIPOS_BASE_URL || 'https://order-api.saipos.com';
const ID_PARTNER = process.env.SAIPOS_ID_PARTNER;
const SECRET = process.env.SAIPOS_SECRET;
const TABLES = (process.env.SAIPOS_TABLES || '1,5,20').split(',').map((s) => s.trim()).filter(Boolean);
const PADS = (process.env.SAIPOS_PADS || '123').split(',').map((s) => s.trim()).filter(Boolean);
const TIMEOUT_MS = 20000;

if (!ID_PARTNER || !SECRET) {
  console.error('Defina SAIPOS_ID_PARTNER e SAIPOS_SECRET (ambos no painel developer.saipos.com).');
  process.exit(2);
}

/**
 * Troca idPartner + secret por um JWT. Campos em camelCase — snake_case
 * devolve 400 com a MESMA mensagem que credencial inválida, então distinguir
 * "grafia errada" de "credencial errada" aqui é o que evita reportar rota
 * morta quando a rota está viva.
 */
async function issueToken() {
  const res = await fetch(`${BASE}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ idPartner: ID_PARTNER, secret: SECRET }),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* deixa cru */ }
  if (res.status !== 200 || !data?.token) {
    return { error: `POST /auth devolveu HTTP ${res.status}: ${(data?.errorMessage || text).slice(0, 160)}` };
  }
  let exp = null;
  try { exp = JSON.parse(Buffer.from(data.token.split('.')[1], 'base64').toString()).exp; } catch { /* opcional */ }
  return { token: data.token, exp };
}

/**
 * O parâmetro leva COLCHETES LITERAIS e um valor por chamada — `?table=[5]`,
 * não `?table=5` nem `?table[]=5`. A doc engana nesse ponto; o formato foi
 * descoberto sondando o sandbox e está registrado no teardown de 2026-07-27.
 * encodeURIComponent quebraria os colchetes, então a query é montada à mão.
 */
async function query(token, label, param, value) {
  const url = `${BASE}/sale-status-by-table-or-pad?${param}=[${value}]`;
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    // Authorization recebe o JWT CRU, sem prefixo Bearer.
    const res = await fetch(url, { headers: { Authorization: token, Accept: 'application/json' }, signal: ctrl.signal });
    const ms = Date.now() - started;
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { /* resposta não-JSON entra como texto cru */ }

    // Sucesso é um ARRAY NO TOPO — mesa livre devolve `[]`, não
    // `{ sales: [...] }`. Array vazio É SUCESSO: prova que o token abriu o
    // endpoint e que a mesa está livre.
    const isArray = Array.isArray(body);
    return { label, status: res.status, ms, isArray,
      count: isArray ? body.length : null,
      sample: isArray ? body.slice(0, 2) : (body ?? text.slice(0, 300)) };
  } catch (err) {
    return { label, error: err.name === 'AbortError' ? `timeout ${TIMEOUT_MS}ms` : err.message };
  } finally {
    clearTimeout(timer);
  }
}

function verdict(results) {
  const ok = results.filter((r) => r.status === 200 && r.isArray);
  const auth = results.filter((r) => r.status === 401 || r.status === 403);
  if (ok.length === results.length && ok.length > 0) {
    return { open: true,
      line: `ROTA VIVA — ${ok.length}/${results.length} chamadas devolveram array com HTTP 200.`,
      next: "Escrever o adaptador de leitura de mesa/comanda. O CHECK de pos_provider já aceita 'saipos'." };
  }
  if (ok.length) {
    return { open: true,
      line: `ROTA VIVA, MAS IRREGULAR — ${ok.length}/${results.length} devolveram array; o resto não.`,
      next: 'Ver os status abaixo antes de escrever adaptador.' };
  }
  if (auth.length) {
    return { open: false, line: `TOKEN RECUSADO na consulta — ${auth.length} chamadas com ${auth.map((a) => a.status).join('/')}.`,
      next: 'O /auth emitiu token mas a consulta recusou: conferir se a loja de teste está vinculada ao parceiro.' };
  }
  return { open: false, line: 'INCONCLUSIVO — nenhuma chamada devolveu array nem erro de auth.',
    next: 'HTTP 950 é modo de contingência da Saipos (GET bloqueado), não recusa de credencial.' };
}

(async () => {
  console.log(`\nSonda Saipos Order API — ${BASE}\n${'='.repeat(60)}`);

  const auth = await issueToken();
  if (auth.error) {
    console.log(`  ✗ autenticação: ${auth.error}\n`);
    console.log('Sem token não há o que sondar. Confira idPartner e secret no painel.\n');
    process.exit(1);
  }
  const horas = auth.exp ? ((auth.exp * 1000 - Date.now()) / 3600000).toFixed(1) : '?';
  console.log(`  ✓ POST /auth: token emitido, expira em ${horas}h`);

  const results = [];
  for (const t of TABLES) results.push(await query(auth.token, `mesa ${t}`, 'table', t));
  for (const p of PADS) results.push(await query(auth.token, `comanda ${p}`, 'pad', p));

  for (const r of results) {
    if (r.error) { console.log(`  ✗ ${r.label}: ${r.error}`); continue; }
    const shape = r.isArray ? `array(${r.count})` : 'não-array';
    console.log(`  ${r.status === 200 ? '✓' : '·'} ${r.label}: HTTP ${r.status} ${shape} ${r.ms}ms`);
    if (r.sample && (!r.isArray || r.count)) console.log(`      ${JSON.stringify(r.sample).slice(0, 200)}`);
  }

  const v = verdict(results);
  console.log(`\n${v.line}\nPróximo passo: ${v.next}\n`);
  process.exit(v.open ? 0 : 1);
})();
