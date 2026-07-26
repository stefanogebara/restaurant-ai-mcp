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

import { createReadStream, createWriteStream, mkdirSync, existsSync, rmSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import os from 'node:os';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse';
import AdmZip from 'adm-zip';

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

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing env SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const norm = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const onlyDigits = (s) => (s ?? '').replace(/\D/g, '');

async function baixar(nomeZip, refDir) {
  mkdirSync(TMP, { recursive: true });
  const zipPath = path.join(TMP, nomeZip);
  if (!existsSync(zipPath)) {
    const url = `${RF_BASE}/${refDir}/${nomeZip}`;
    console.log('downloading', url);
    const resp = await fetch(url, { headers: { Authorization: RF_AUTH } });
    if (!resp.ok) throw new Error(`download ${nomeZip}: HTTP ${resp.status}`);
    await pipeline(resp.body, createWriteStream(zipPath));
  }
  const zip = new AdmZip(zipPath);
  const entry = zip.getEntries()[0];
  const csvPath = path.join(TMP, nomeZip.replace(/\.zip$/i, '.csv'));
  if (!existsSync(csvPath)) zip.extractEntryTo(entry, TMP, false, true, false, path.basename(csvPath));
  return csvPath;
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

async function carregar() {
  const refDir = REF || await descobrirRefMaisRecente();
  console.log(`Receita ref=${refDir} | filter UF=${UF} municipio="${MUNICIPIO}"`);

  const munCsv = await baixar('Municipios.zip', refDir);
  const munNome = new Map();
  for await (const [cod, nome] of linhasCsv(munCsv)) munNome.set(cod, nome);
  descartarCsv(munCsv);
  console.log(`municipalities: ${munNome.size}`);

  const wantRaiz = new Set();
  const estabs = [];
  for (let i = 0; i < 10; i++) {
    const csv = await baixar(`Estabelecimentos${i}.zip`, refDir);
    for await (const r of linhasCsv(csv)) {
      const uf = r[19];
      if (uf !== UF) continue;
      const munCod = r[20];
      const munNm = munNome.get(munCod) ?? '';
      if (MUNICIPIO && norm(munNm) !== norm(MUNICIPIO)) continue;
      const raiz = r[0];
      wantRaiz.add(raiz);
      const cnpj = r[0] + r[1] + r[2];
      const cep = onlyDigits(r[18]);
      const ddd = r[21], tel = r[22];
      estabs.push({
        cnpj, raiz,
        nome_fantasia: r[4] || null,
        situacao: situacaoTxt(r[5]),
        cnae: r[11] || null,
        cep,
        municipio: munNm || null,
        uf,
        bairro: r[17] || null,
        logradouro: [r[13], r[14], r[15]].filter(Boolean).join(' ') || null,
        telefone: ddd && tel ? `${ddd}${tel}` : null,
      });
    }
    descartarCsv(csv);
    console.log(`Estabelecimentos${i}: ${estabs.length} accumulated in filter`);
  }

  const empresa = new Map();
  for (let i = 0; i < 10; i++) {
    const csv = await baixar(`Empresas${i}.zip`, refDir);
    for await (const r of linhasCsv(csv)) {
      if (!wantRaiz.has(r[0])) continue;
      empresa.set(r[0], { razao_social: r[1] || null, porte: porteTxt(r[5]) });
    }
    descartarCsv(csv);
  }

  const socios = new Map();
  for (let i = 0; i < 10; i++) {
    const csv = await baixar(`Socios${i}.zip`, refDir);
    for await (const r of linhasCsv(csv)) {
      if (!wantRaiz.has(r[0])) continue;
      const arr = socios.get(r[0]) ?? [];
      arr.push({ nome: r[2] || null, qualificacao: r[3] || null }); // NO CPF — LGPD
      socios.set(r[0], arr);
    }
    descartarCsv(csv);
  }

  const mei = new Map();
  {
    const csv = await baixar('Simples.zip', refDir);
    for await (const r of linhasCsv(csv)) {
      if (!wantRaiz.has(r[0])) continue;
      mei.set(r[0], r[4] === 'S');
    }
    descartarCsv(csv);
  }

  let buf = [];
  let total = 0;
  for (const e of estabs) {
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
    if (buf.length >= BATCH) { await flush(buf); total += buf.length; buf = []; if (total % 20000 === 0) console.log(`upsert ${total}`); }
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
