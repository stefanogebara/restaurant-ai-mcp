#!/usr/bin/env node
/**
 * Phantom column drift audit.
 *
 * Em PostgREST, pedir uma coluna que não existe devolve erro e `data: null` —
 * e o cliente do Supabase NÃO lança: ele põe a falha em `error`. Quem não lê o
 * `error` recebe silêncio no lugar dos dados. O Manager AI passou semanas com
 * um snapshot vazio por causa de um drift desses.
 *
 * ── A virada (26/ago/2026) ────────────────────────────────────────────────
 *
 * Esta auditoria era um ALLOWLIST DE CONHECIDOS-RUINS: três tabelas
 * (`reservations`, `service_records`, `customer_ltv`) e as colunas que já
 * tinham doído, com o próprio docstring dizendo "adicione ao mapa quando um
 * novo drift for identificado".
 *
 * Ou seja, ela só pegava o que alguém já tinha encontrado à mão. Passou por
 * cima de `restaurant_config.language` — coluna inexistente num select do
 * caminho de transbordo do WhatsApp, que fazia o aviso sair em inglês para
 * cliente brasileiro — porque `restaurant_config` nem estava no mapa.
 *
 * Agora a checagem é POSITIVA: `schema-snapshot.json` traz as colunas REAIS de
 * 17 tabelas, tiradas do information_schema de produção, e qualquer coluna
 * pedida fora dessa lista é suspeita. Mesma inversão que fez o guarda de
 * paleta funcionar — de "o que já sabemos que dói" para "o que sabemos que
 * existe".
 *
 * A dívida existente fica congelada em `phantom-columns.divida.json`: 72
 * referências vivas no dia da virada, grandes demais para um commit só. Elas
 * podem cair, nunca subir.
 *
 * Para regerar o snapshot quando o schema mudar:
 *   select table_name, column_name from information_schema.columns
 *   where table_schema in ('public','restaurant');
 *
 * Exit 1 em referência NOVA, ou quando a dívida cai sem a base ser rebaixada.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'api');
const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(__dirname, 'schema-snapshot.json'), 'utf8'));
const CAMINHO_DIVIDA = path.join(__dirname, 'phantom-columns.divida.json');

// Tabelas fora do snapshot ainda usam a lista antiga de conhecidos-ruins.
const KNOWN_PHANTOMS = {};

// Aceitam esses nomes como parâmetro de entrada da API, não como coluna.
const ALLOWLIST_FILES = new Set([
  'external-booking-webhook.js',
  'proactive-comms.js',
]);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.name.endsWith('.js')) yield full;
  }
}

/**
 * Casa `.from('tabela')` com o `.select('a, b')` que vem logo depois.
 *
 * A janela de 400 caracteres é deliberadamente curta: encadeamento de query no
 * Supabase é compacto, e uma janela larga casaria o select de OUTRA query mais
 * abaixo — falso positivo, que é o defeito que mata um guarda.
 */
// O trecho entre o from() e o select() nao pode conter OUTRO .from(): sem a
// guarda, a janela de referral.js casou `.from('restaurant_config')` de uma
// query com o `.select('status')` da query SEGUINTE (em `referrals`) — falso
// positivo, o defeito que mata um guarda. O lookahead negativo fecha isso.
const RE_FROM_SELECT = /\.from\(\s*['"]([a-z_]+)['"]\s*\)((?:(?!\.from\()[\s\S]){0,400}?)\.select\(\s*['"`]([^'"`]*)['"`]/g;

function colunasSuspeitas(texto) {
  const achados = [];
  let m;
  RE_FROM_SELECT.lastIndex = 0;
  while ((m = RE_FROM_SELECT.exec(texto)) !== null) {
    const [, tabela, , cols] = m;
    const reais = SNAPSHOT[tabela];
    if (!reais) continue;
    // `*` e embeds (`outra_tabela(...)`) têm regras próprias — fora do escopo.
    if (cols.includes('*') || cols.includes('(')) continue;
    for (const bruto of cols.split(',')) {
      // `apelido:coluna` → a coluna real é a da direita.
      const c = bruto.trim().split(':').pop().trim();
      if (!c || !/^[a-z][a-z0-9_]*$/.test(c)) continue;
      if (!reais.includes(c)) achados.push(`${tabela}.${c}`);
    }
  }
  return achados;
}

function medir() {
  const porArquivo = {};
  for (const file of walk(ROOT)) {
    if (ALLOWLIST_FILES.has(path.basename(file))) continue;
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const texto = fs.readFileSync(file, 'utf8');

    const achados = colunasSuspeitas(texto);

    // As tabelas fora do snapshot seguem no regime antigo.
    const linhas = texto.split(/\r?\n/);
    for (const [tabela, fantasmas] of Object.entries(KNOWN_PHANTOMS)) {
      linhas.forEach((linha) => {
        if (!linha.includes(`from('${tabela}')`) && !linha.includes(`from("${tabela}")`)) return;
        for (const f of fantasmas) if (new RegExp(`['".,]\\s*${f}\\b`).test(linha)) achados.push(`${tabela}.${f}`);
      });
    }

    if (achados.length) porArquivo[rel] = achados.sort();
  }
  return porArquivo;
}

const atual = medir();

if (process.argv.includes('--atualiza')) {
  fs.writeFileSync(CAMINHO_DIVIDA, JSON.stringify(atual, null, 2) + '\n');
  const total = Object.values(atual).flat().length;
  console.log(`Linha de base regravada: ${total} referências em ${Object.keys(atual).length} arquivos.`);
  process.exit(0);
}

const congelado = fs.existsSync(CAMINHO_DIVIDA)
  ? JSON.parse(fs.readFileSync(CAMINHO_DIVIDA, 'utf8'))
  : {};

/**
 * Compara por CONTAGEM, não por presença.
 *
 * A primeira versão usava `includes()`, e isso tinha um buraco que eu só vi
 * porque o total caiu de 72 para 71 sem a catraca reclamar: um arquivo indo de
 * TRÊS ocorrências da mesma coluna para uma passava calado — e, pior, de uma
 * para três também. Presença não é quantidade.
 */
function contar(lista) {
  const m = new Map();
  for (const x of lista || []) m.set(x, (m.get(x) || 0) + 1);
  return m;
}

const problemas = [];
for (const [arquivo, achados] of Object.entries(atual)) {
  const antes = contar(congelado[arquivo]);
  for (const [ref, n] of contar(achados)) {
    const base = antes.get(ref) || 0;
    if (n > base) {
      problemas.push(`  ${arquivo}: ${ref}${base ? ` (${base} → ${n})` : ''}`);
    }
  }
}

// Sem isto a linha de base apodrece para cima: alguém conserta dez e o próximo
// ganha dez de folga para regredir sem ninguém notar.
const melhoraram = [];
for (const [arquivo, antes] of Object.entries(congelado)) {
  const agora = contar(atual[arquivo]);
  for (const [ref, base] of contar(antes)) {
    const n = agora.get(ref) || 0;
    if (n < base) melhoraram.push(`  ${arquivo}: ${ref} (${base} → ${n})`);
  }
}

if (problemas.length) {
  console.error('✗ Colunas fantasma NOVAS (a query devolve null em silêncio):\n' + problemas.join('\n'));
  console.error('\nConfira o nome real em scripts/schema-snapshot.json.');
  process.exit(1);
}
if (melhoraram.length) {
  console.error('A dívida caiu — obrigado. Agora baixe a linha de base para travar o ganho:\n' + melhoraram.join('\n'));
  console.error('\n  node scripts/audit-phantom-columns.js --atualiza');
  process.exit(1);
}

const total = Object.values(atual).flat().length;
console.log(total
  ? `✓ nenhuma coluna fantasma nova (${total} conhecidas, congeladas em phantom-columns.divida.json)`
  : '✓ no phantom-column references in api/');
