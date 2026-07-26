#!/usr/bin/env node
// =============================================================================
// load-rf-cnpj.mjs — loads the LOCAL CNPJ index (table cnpj_index) from the
// Receita Federal OPEN data (Dados Abertos CNPJ), filtered to a UF/municipality.
// Ported from the Olivia (prospectautomation) loader for Seatable's prospecting.
// =============================================================================
// Why: name-based candidate generation via Google/SERP fails on short/generic
// names (the biggest cause of a blank CNPJ). With the Receita base loaded
// locally, the match becomes a DB trigram search — deterministic, free, instant.
//
// What it does:
//   1) Downloads the Receita ZIPs (Estabelecimentos 0-9, Empresas 0-9, Socios
//      0-9, Simples, Municipios) from the Nextcloud public share (see RF_BASE).
//   2) Streams the CSVs (latin1, ';'-delimited, no header).
//   3) FILTERS estabelecimentos by UF (and, by default, municipality).
//   4) Joins razão/porte (Empresas), QSA (Socios — name+qualification ONLY, LGPD),
//      MEI (Simples) by the CNPJ root (first 8 digits), and resolves the
//      municipality code → name (Municipios).
//   5) Bulk-upserts into public.cnpj_index (batches of 1000) with a normalized
//      nome_busca.
//
// Usage (on a machine with bandwidth/disk — does NOT run on serverless):
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//   node scripts/load-rf-cnpj.mjs --uf SP --municipio "SAO PAULO" [--ref AAAA-MM]
//
// Requirements: Node 20+, ~10GB temp disk, and:  npm i adm-zip csv-parse @supabase/supabase-js
// Runs in ~hours. Idempotent: re-running upserts by cnpj.
// =============================================================================

import { createReadStream, createWriteStream, mkdirSync, existsSync, rmSync, statSync, renameSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import readline from 'node:readline';
import path from 'node:path';
import os from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse';
// yauzl e NÃO adm-zip: o adm-zip lê o arquivo inteiro com readFileSync, que
// estoura em 2 GiB (ERR_FS_FILE_TOO_LARGE). Estabelecimentos0.zip sozinho tem
// 2,016 GiB — o script morria no primeiro arquivo grande. yauzl abre por
// stream e entende zip64.
import yauzl from 'yauzl';

// A Receita MUDOU a distribuição (constatado 2026-07-25): o antigo
// arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/<AAAA-MM>/ agora
// devolve 404 — no navegador também, então não é bloqueio de user-agent: o
// caminho deixou de existir. Hoje o host é um Nextcloud ("SERPRO+") e os dados
// vivem num COMPARTILHAMENTO PÚBLICO, cujo token está catalogado no recurso
// "Inscrições no CNPJ" do dados.gov.br (API pública do portal).
//
// Acesso programável = WebDAV do share: Basic auth com o token como usuário e
// senha vazia. PROPFIND lista, GET baixa. Estrutura e nomes dos arquivos
// continuam idênticos (<AAAA-MM>/Estabelecimentos0.zip etc.), então o resto
// deste script não muda.
const RF_SHARE_TOKEN = process.env.RF_SHARE_TOKEN || 'YggdBLfdninEJX9';
const RF_HOST = 'https://arquivos.receitafederal.gov.br';
const RF_BASE = `${RF_HOST}/public.php/webdav`;
const RF_AUTH = 'Basic ' + Buffer.from(`${RF_SHARE_TOKEN}:`).toString('base64');
const TMP = path.join(os.tmpdir(), 'rf-cnpj');
const BATCH = 1000;

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const UF = arg('uf', 'SP').toUpperCase();
const MUNICIPIO = arg('municipio', 'SAO PAULO'); // normalized name; '' = whole UF
const REF = arg('ref', ''); // AAAA-MM; empty = discover the latest in the index

// Recorte de RAMO. Os checkpoints guardam TODO estabelecimento do município (a
// coleta é indiscriminada de propósito), mas só o ramo que interessa vai pro
// índice. Sem isto, São Paulo capital sozinha rende ~26 MILHÕES de linhas: 26 mil
// requisições de upsert e um índice trigram gigante, pra procurar restaurante.
//
// '56' é a divisão CNAE de ALIMENTAÇÃO (restaurantes, bares, lanchonetes,
// bufês, cantinas) — o CNAE vem sem pontuação nos dados abertos ('5611201').
// Trocar o recorte NÃO exige re-baixar nada: os checkpoints continuam completos,
// é só rodar de novo com outro --cnae.
//
// Limitação aceita (decisão do fundador, 2026-07-26): filtra pelo CNAE
// PRINCIPAL. Restaurante registrado sob CNAE genérico (holding, comércio
// varejista) fica de fora e a busca por nome não vai achá-lo. Trocamos
// cobertura por tamanho de olhos abertos.
const CNAE_PREFIXOS = arg('cnae', '56').split(',').map((s) => s.trim()).filter(Boolean);
// Estabelecimento baixado não é lead, e casar o nome com um CNPJ morto trazia
// sócio desatualizado. '' desliga o filtro de situação.
const SITUACAO_OK = arg('situacao', 'ATIVA');

/** O estabelecimento entra no índice? (checkpoint guarda tudo; isto seleciona.) */
function doRamo(e) {
  const cnae = String(e.cnae || '');
  if (CNAE_PREFIXOS.length && !CNAE_PREFIXOS.some((p) => cnae.startsWith(p))) return false;
  if (SITUACAO_OK && e.situacao !== SITUACAO_OK) return false;
  return true;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const norm = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const onlyDigits = (s) => (s ?? '').replace(/\D/g, '');

const TENTATIVAS = 6;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Baixa um zip da Receita, com retentativa e de forma ATÔMICA.
 *
 * Duas lições de produção, ambas custaram uma execução:
 *
 * 1) O servidor da Receita é lento e derruba conexão. O default do undici é 10s
 *    de connect timeout, e num job de horas isso estoura (UND_ERR_CONNECT_TIMEOUT
 *    no Estabelecimentos1). Um timeout de conexão não é motivo pra jogar fora
 *    horas de trabalho — retenta com backoff.
 *
 * 2) Escrever direto no zipPath deixava um ZIP TRUNCADO quando a conexão caía no
 *    meio, e o existsSync() da execução seguinte aceitava esse arquivo como
 *    pronto. Agora vai pro .parcial e só vira zip de verdade depois de conferir
 *    o content-length — truncado nunca é confundido com completo.
 */
async function baixar(nomeZip, refDir) {
  mkdirSync(TMP, { recursive: true });
  const zipPath = path.join(TMP, nomeZip);
  const parcial = `${zipPath}.parcial`;

  if (!existsSync(zipPath)) {
    const url = `${RF_BASE}/${refDir}/${nomeZip}`;
    let ultimoErro = null;
    for (let t = 1; t <= TENTATIVAS; t++) {
      try {
        console.log(`downloading ${url}${t > 1 ? ` (tentativa ${t}/${TENTATIVAS})` : ''}`);
        rmSync(parcial, { force: true }); // recomeça limpo: sem Range, sem meio-arquivo
        const resp = await fetch(url, {
          headers: { Authorization: RF_AUTH },
          signal: AbortSignal.timeout(60 * 60 * 1000), // arquivos de GBs em link lento
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const esperado = Number(resp.headers.get('content-length')) || 0;
        await pipeline(resp.body, createWriteStream(parcial));
        const veio = statSync(parcial).size;
        if (esperado && veio !== esperado) {
          throw new Error(`tamanho não bate: veio ${veio} de ${esperado} bytes`);
        }
        renameSync(parcial, zipPath);
        ultimoErro = null;
        break;
      } catch (e) {
        ultimoErro = e;
        rmSync(parcial, { force: true });
        if (t === TENTATIVAS) break;
        const pausa = Math.min(60_000, 2 ** t * 1000); // 2s, 4s, 8s… teto de 1min
        console.log(`  ⚠ ${nomeZip}: ${e.message} — nova tentativa em ${pausa / 1000}s`);
        await espera(pausa);
      }
    }
    if (ultimoErro) throw new Error(`download ${nomeZip} falhou em ${TENTATIVAS} tentativas: ${ultimoErro.message}`);
  }

  const csvPath = path.join(TMP, nomeZip.replace(/\.zip$/i, '.csv'));
  if (!existsSync(csvPath)) await extrairPrimeiroArquivo(zipPath, csvPath);
  return csvPath;
}

/**
 * Extrai a PRIMEIRA entrada de arquivo do zip, por stream, direto pro destino.
 *
 * Cada zip da Receita traz um único CSV, então parar na primeira entrada é o
 * comportamento certo (e evita varrer o índice central inteiro à toa).
 *
 * Escreve num .parcial e só renomeia no fim: se o processo morrer no meio da
 * extração, não fica um CSV truncado que o existsSync() aceitaria como pronto
 * na próxima execução — o bug clássico de retomada.
 */
function extrairPrimeiroArquivo(zipPath, destino) {
  const parcial = `${destino}.parcial`;
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true, autoClose: false }, (err, zip) => {
      if (err) return reject(err);
      zip.on('error', reject);
      zip.on('end', () => { zip.close(); reject(new Error(`zip sem arquivo dentro: ${zipPath}`)); });
      zip.on('entry', (entry) => {
        if (/\/$/.test(entry.fileName)) return zip.readEntry(); // diretório: segue
        zip.openReadStream(entry, (e2, rs) => {
          if (e2) { zip.close(); return reject(e2); }
          pipeline(rs, createWriteStream(parcial))
            .then(() => { zip.close(); renameSync(parcial, destino); resolve(); })
            .catch((e3) => { zip.close(); rmSync(parcial, { force: true }); reject(e3); });
        });
      });
      zip.readEntry();
    });
  });
}

/**
 * Apaga o CSV extraído assim que ele foi consumido — o ZIP FICA.
 *
 * Sem isto o script acumulava tudo: os ~28GB de zips MAIS todo CSV extraído, e
 * os CSVs da Receita descompactam em ~4-5x (Estabelecimentos0 sozinho: 2GB
 * zipado). O pico passava de 150GB e enchia o disco no meio da madrugada.
 *
 * Manter o zip é de propósito: é ele que dá a retomada barata (o baixar() pula
 * o download se o arquivo já está lá). Assim o pico fica em zips + UM csv por
 * vez (~40GB), e reprocessar não re-baixa nada.
 */
function descartarCsv(csvPath) {
  try {
    const mb = (statSync(csvPath).size / 1048576).toFixed(0);
    rmSync(csvPath, { force: true });
    console.log(`  (csv liberado: ${path.basename(csvPath)}, ${mb} MB)`);
  } catch { /* já sumiu — tudo bem */ }
}

async function* linhasCsv(csvPath) {
  const parser = createReadStream(csvPath, { encoding: 'latin1' })
    .pipe(parse({ delimiter: ';', quote: '"', relax_column_count: true }));
  for await (const row of parser) yield row;
}

// ---------------------------------------------------------------- checkpoint
//
// Cada arquivo-fonte processado vira um NDJSON em TMP/ckpt. Duas razões:
//
// 1) RETOMADA. O script acumulava tudo em memória e só gravava no banco no fim,
//    então QUALQUER falha (e já houve duas: adm-zip estourando em 2 GiB e o
//    servidor da Receita derrubando conexão) fazia reprocessar os 31 arquivos do
//    zero. Com checkpoint, arquivo já processado é pulado inteiro — nem extrai.
//
// 2) MEMÓRIA. O array `estabs` guardava todo estabelecimento filtrado até o
//    final. Só o Estabelecimentos0 rendeu 2,65 milhões de objetos; o lote
//    inteiro não caberia confortavelmente na heap. Agora a fusão lê os
//    checkpoints em stream e nada grande fica residente.
//
// Escrita atômica (.parcial → rename): um checkpoint truncado por queda no meio
// nunca é confundido com um arquivo pronto na execução seguinte.
const CKPT = path.join(TMP, 'ckpt');
const ckptPath = (nome) => path.join(CKPT, `${nome}.ndjson`);
const temCheckpoint = (nome) => existsSync(ckptPath(nome));

function abrirCheckpoint(nome) {
  mkdirSync(CKPT, { recursive: true });
  const destino = ckptPath(nome);
  const parcial = `${destino}.parcial`;
  const ws = createWriteStream(parcial);
  return {
    async escrever(obj) {
      // Respeita backpressure: são milhões de linhas, escrever sem esperar o
      // dreno estoura a memória do próprio buffer do stream.
      if (!ws.write(`${JSON.stringify(obj)}\n`)) {
        await new Promise((r) => ws.once('drain', r));
      }
    },
    concluir() {
      return new Promise((res, rej) => ws.end((e) => {
        if (e) return rej(e);
        renameSync(parcial, destino);
        res();
      }));
    },
    abortar() { ws.destroy(); rmSync(parcial, { force: true }); },
  };
}

async function* lerCheckpoint(nome) {
  const rl = readline.createInterface({
    input: createReadStream(ckptPath(nome), 'utf8'),
    crlfDelay: Infinity,
  });
  for await (const linha of rl) if (linha) yield JSON.parse(linha);
}

/**
 * Processa um arquivo-fonte pro seu checkpoint, ou pula se já existe.
 * `aoLinha(r, escrever)` decide o que sai — devolvendo nada, a linha é ignorada.
 */
async function processarArquivo(nome, refDir, aoLinha) {
  if (temCheckpoint(nome)) { console.log(`${nome}: checkpoint ✓ (pulando)`); return; }
  const csv = await baixar(`${nome}.zip`, refDir);
  const ck = abrirCheckpoint(nome);
  try {
    await aoLinha(csv, ck.escrever.bind(ck));
    await ck.concluir();
  } catch (e) {
    ck.abortar();
    throw e;
  }
  descartarCsv(csv);
}

const ESTABS = Array.from({ length: 10 }, (_, i) => `Estabelecimentos${i}`);
const EMPRESAS = Array.from({ length: 10 }, (_, i) => `Empresas${i}`);
const SOCIOS = Array.from({ length: 10 }, (_, i) => `Socios${i}`);

async function carregar() {
  const refDir = REF || await descobrirRefMaisRecente();
  console.log(`Receita ref=${refDir} | filter UF=${UF} municipio="${MUNICIPIO}"`);

  const munCsv = await baixar('Municipios.zip', refDir);
  const munNome = new Map();
  for await (const [cod, nome] of linhasCsv(munCsv)) munNome.set(cod, nome);
  descartarCsv(munCsv);
  console.log(`municipalities: ${munNome.size}`);

  // --- 1) Estabelecimentos: filtra por UF/município ------------------------
  for (const nome of ESTABS) {
    await processarArquivo(nome, refDir, async (csv, escrever) => {
      // Contadores por etapa do filtro: se o municipio não casar (código que
      // não existe no Municipios.csv, por exemplo), o número de "em UF" e o de
      // "no município" ficam iguais e o erro aparece na hora, em vez de virar
      // um índice inchado que ninguém questiona.
      let vistos = 0; let naUf = 0; let noMun = 0;
      for await (const r of linhasCsv(csv)) {
        vistos++;
        if (r[19] !== UF) continue;
        naUf++;
        const munNm = munNome.get(r[20]) ?? '';
        if (MUNICIPIO && norm(munNm) !== norm(MUNICIPIO)) continue;
        noMun++;
        const ddd = r[21]; const tel = r[22];
        await escrever({
          cnpj: r[0] + r[1] + r[2],
          raiz: r[0],
          nome_fantasia: r[4] || null,
          situacao: situacaoTxt(r[5]),
          cnae: r[11] || null,
          cep: onlyDigits(r[18]),
          municipio: munNm || null,
          uf: r[19],
          bairro: r[17] || null,
          logradouro: [r[13], r[14], r[15]].filter(Boolean).join(' ') || null,
          telefone: ddd && tel ? `${ddd}${tel}` : null,
        });
      }
      console.log(`${nome}: ${vistos} linhas | ${naUf} em ${UF} | ${noMun} em "${MUNICIPIO}"`);
    });
  }

  // As raízes que interessam — o recorte de ramo é aplicado AQUI, e não na
  // coleta, por dois motivos: os checkpoints seguem completos (alargar depois
  // não re-baixa nada) e tudo a jusante fica pequeno — buscar sócio de ~60 mil
  // raízes de alimentação em vez das ~2,6 milhões do município inteiro.
  const wantRaiz = new Set();
  let vistosTotal = 0;
  for (const nome of ESTABS) {
    for await (const e of lerCheckpoint(nome)) {
      vistosTotal++;
      if (doRamo(e)) wantRaiz.add(e.raiz);
    }
  }
  console.log(
    `recorte: CNAE [${CNAE_PREFIXOS.join(',') || 'todos'}]`
    + `${SITUACAO_OK ? ` + situação ${SITUACAO_OK}` : ''}`
    + ` → ${wantRaiz.size.toLocaleString('pt-BR')} raízes de ${vistosTotal.toLocaleString('pt-BR')} estabelecimentos`,
  );
  if (!wantRaiz.size) throw new Error('o recorte de CNAE não deixou nenhuma raiz — confira --cnae');

  // --- 2) Empresas: razão social e porte -----------------------------------
  for (const nome of EMPRESAS) {
    await processarArquivo(nome, refDir, async (csv, escrever) => {
      for await (const r of linhasCsv(csv)) {
        if (!wantRaiz.has(r[0])) continue;
        await escrever({ raiz: r[0], razao_social: r[1] || null, porte: porteTxt(r[5]) });
      }
    });
  }

  // --- 3) Sócios: o QSA — é ISTO que fura porteiro -------------------------
  //
  // Tabela de qualificação (código → texto). Arquivo minúsculo e vale muito:
  // saber que a pessoa é SÓCIO-ADMINISTRADOR e não sócio minoritário é o que
  // decide POR QUEM pedir no balcão.
  const qualNome = new Map();
  {
    const csv = await baixar('Qualificacoes.zip', refDir);
    for await (const [cod, texto] of linhasCsv(csv)) qualNome.set(cod, texto);
    descartarCsv(csv);
    console.log(`qualificações: ${qualNome.size}`);
  }

  for (const nome of SOCIOS) {
    await processarArquivo(nome, refDir, async (csv, escrever) => {
      for await (const r of linhasCsv(csv)) {
        if (!wantRaiz.has(r[0])) continue;
        // LAYOUT (conferido no dado bruto em 2026-07-26 — a versão anterior
        // errava a coluna): 0=raiz, 1=tipo(1=PJ,2=PF), 2=nome, 3=CPF/CNPJ do
        // sócio, 4=qualificação, 5=data de entrada.
        //
        // A col[3] é DELIBERADAMENTE ignorada: é o documento do sócio (CPF
        // mascarado pra PF, CNPJ inteiro pra PJ). O código antigo gravava ela
        // no campo `qualificacao` — dado errado E documento pessoal onde o
        // comentário jurava que não havia. Só nome + papel entram.
        await escrever({
          raiz: r[0],
          nome: r[2] || null,
          qualificacao: qualNome.get(r[4]) || r[4] || null,
        });
      }
    });
  }

  // --- 4) Simples/MEI ------------------------------------------------------
  await processarArquivo('Simples', refDir, async (csv, escrever) => {
    for await (const r of linhasCsv(csv)) {
      if (!wantRaiz.has(r[0])) continue;
      await escrever({ raiz: r[0], mei: r[4] === 'S' });
    }
  });

  // --- 5) Fusão: os mapas por raiz cabem na memória (limitados por wantRaiz);
  //        os estabelecimentos NÃO cabem, então saem em stream do checkpoint.
  const empresa = new Map();
  for (const nome of EMPRESAS) for await (const e of lerCheckpoint(nome)) empresa.set(e.raiz, e);
  const socios = new Map();
  for (const nome of SOCIOS) {
    for await (const s of lerCheckpoint(nome)) {
      const arr = socios.get(s.raiz) ?? [];
      arr.push({ nome: s.nome, qualificacao: s.qualificacao });
      socios.set(s.raiz, arr);
    }
  }
  const mei = new Map();
  for await (const m of lerCheckpoint('Simples')) mei.set(m.raiz, m.mei);
  console.log(`empresas: ${empresa.size} | com sócios: ${socios.size} | MEI: ${mei.size}`);

  let buf = [];
  let total = 0;
  for (const nome of ESTABS) {
    for await (const e of lerCheckpoint(nome)) {
      // O recorte é reaplicado aqui de propósito: wantRaiz é por RAIZ, e uma
      // rede pode ter a matriz num CNAE de alimentação e filiais em outro (um
      // escritório administrativo, por ex.). Sem esta linha, essas filiais
      // entrariam de carona no índice.
      if (!doRamo(e)) continue;
      const emp = empresa.get(e.raiz) ?? {};
      const fant = e.nome_fantasia ?? '';
      const raz = emp.razao_social ?? '';
      buf.push({
        cnpj: e.cnpj,
        razao_social: emp.razao_social ?? null,
        nome_fantasia: e.nome_fantasia,
        nome_busca: norm(`${fant} ${raz}`).replace(/\s+/g, ' ').trim(),
        cep: e.cep || null,
        municipio: e.municipio ? norm(e.municipio) : null,
        uf: e.uf,
        bairro: e.bairro,
        logradouro: e.logradouro,
        situacao: e.situacao,
        cnae: e.cnae,
        telefone: e.telefone,
        porte: emp.porte ?? null,
        mei: mei.get(e.raiz) ?? null,
        socios: socios.get(e.raiz) ?? [],
      });
      if (buf.length >= BATCH) {
        await flush(buf); total += buf.length; buf = [];
        if (total % 20000 === 0) console.log(`upsert ${total}`);
      }
    }
  }
  if (buf.length) { await flush(buf); total += buf.length; }
  console.log(`DONE: ${total} establishments in the index (UF=${UF}, municipio="${MUNICIPIO}").`);
}

async function flush(rows) {
  const { error } = await supabase.from('cnpj_index').upsert(rows, { onConflict: 'cnpj' });
  if (error) { console.error('upsert failed:', error.message); process.exit(1); }
}

function situacaoTxt(cod) {
  return ({ '01': 'NULA', '02': 'ATIVA', '03': 'SUSPENSA', '04': 'INAPTA', '08': 'BAIXADA' })[cod] ?? cod ?? null;
}
function porteTxt(cod) {
  return ({ '00': 'NÃO INFORMADO', '01': 'MICRO EMPRESA', '03': 'EPP', '05': 'DEMAIS' })[cod] ?? cod ?? null;
}
/**
 * Competência mais recente publicada. PROPFIND no share (não mais scraping de
 * HTML de "Index of", que sumiu junto com o caminho antigo). Depth:1 lista só
 * os filhos da raiz — as pastas <AAAA-MM>.
 *
 * O fallback pro mês corrente ficou de fora de propósito: a Receita publica a
 * competência com atraso, então chutar o mês de hoje gera 404 no primeiro
 * download e um erro confuso lá na frente. Melhor falhar aqui, explicando.
 */
async function descobrirRefMaisRecente() {
  const resp = await fetch(`${RF_BASE}/`, {
    method: 'PROPFIND',
    headers: { Authorization: RF_AUTH, Depth: '1' },
  });
  if (!resp.ok && resp.status !== 207) {
    throw new Error(
      `não consegui listar o compartilhamento da Receita (HTTP ${resp.status}). `
      + 'O token do share pode ter mudado — confira o recurso "Inscrições no CNPJ" '
      + 'em dados.gov.br e passe o novo via RF_SHARE_TOKEN.',
    );
  }
  const xml = await resp.text();
  const meses = [...xml.matchAll(/<d:href>([^<]+)<\/d:href>/g)]
    .map((m) => decodeURIComponent(m[1]).split('/').filter(Boolean).pop())
    .filter((n) => /^\d{4}-\d{2}$/.test(n))
    .sort();
  if (!meses.length) throw new Error('o compartilhamento respondeu, mas sem nenhuma pasta AAAA-MM');
  return meses[meses.length - 1];
}

carregar().catch((e) => { console.error(e); process.exit(1); });
