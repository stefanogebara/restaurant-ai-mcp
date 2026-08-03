#!/usr/bin/env node
'use strict';

/**
 * Recupera o CELULAR de leads cujo telefone é fixo, lendo o site da casa.
 *
 * POR QUE: 2675 leads (57% do pool) têm fixo, e fixo quase nunca está no
 * WhatsApp — dos 9 que receberam tentativa, 8 voltaram `missing`. Eles estão
 * no banco e são inalcançáveis. 1625 deles têm site.
 *
 * TAXA MEDIDA antes de construir (amostra de 30): 21% dos sites que abrem
 * publicam um celular. Sobre 1625, isso é ~340 leads recuperados.
 *
 * O QUE ESCREVE: `whatsapp_phone` = celular, `whatsapp_source` = 'site'.
 * O fixo NÃO se perde: `phone` guarda o original (conferido — os dois campos
 * são idênticos em todos os 4678 leads hoje, então sobrescrever o WhatsApp
 * preserva o fixo em `phone`).
 *
 * USO:
 *   node scripts/recuperar-celular-do-site.js            # dry-run, não grava
 *   node scripts/recuperar-celular-do-site.js --gravar   # grava de verdade
 *   node scripts/recuperar-celular-do-site.js --limite=50
 *
 * Dry-run é o padrão de propósito: mexer no número de contato de 1600 leads é
 * irreversível na prática (o fixo fica, mas a fila de disparo muda).
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
for (const arquivo of ['.env.production.local', '.env']) {
  const p = path.join(RAIZ, arquivo);
  if (!fs.existsSync(p)) continue;
  for (const linha of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const { supabaseAdmin } = require(path.join(RAIZ, 'api/_lib/supabase.js'));
const { extrairCelularDoSite } = require(path.join(RAIZ, 'api/_lib/prospecting/numero-do-site.js'));

const args = process.argv.slice(2);
const GRAVAR = args.includes('--gravar');
const LIMITE = Number((args.find((a) => a.startsWith('--limite=')) || '').split('=')[1]) || 0;
const PAUSA_MS = 250;   // gentileza com sites pequenos; não é corrida
const TIMEOUT_MS = 12000;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const soDigitos = (s) => String(s || '').replace(/\D/g, '').replace(/^55/, '');
const ehFixo = (s) => soDigitos(s).length === 10;

async function baixar(url) {
  const alvo = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(alvo, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SeatableBot/1.0; +https://seatable.one)' },
    });
    if (!r.ok) return { erro: `HTTP ${r.status}` };
    return { html: await r.text() };
  } catch (err) {
    return { erro: err.name === 'AbortError' ? 'timeout' : String(err.message).slice(0, 40) };
  } finally {
    clearTimeout(t);
  }
}

/** Carrega TODOS os candidatos, paginando — sem isso o PostgREST devolve 1000. */
async function carregarCandidatos() {
  const todos = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabaseAdmin
      .from('prospect_leads')
      .select('id, name, phone, whatsapp_phone, website, whatsapp_status')
      .not('website', 'is', null)
      .neq('website', '')
      .eq('whatsapp_status', 'pending')
      .range(de, de + 999);
    if (error) throw new Error(`consulta falhou: ${error.message}`);
    if (!data || !data.length) break;
    todos.push(...data);
    if (data.length < 1000) break;
  }
  return todos.filter((l) => ehFixo(l.whatsapp_phone || l.phone));
}

(async () => {
  console.log(GRAVAR ? '### MODO GRAVAÇÃO ###' : '--- dry-run (use --gravar para valer) ---');

  let candidatos = await carregarCandidatos();
  if (LIMITE) candidatos = candidatos.slice(0, LIMITE);
  console.log(`leads fixos com site: ${candidatos.length}\n`);

  // Números que JÁ pertencem a algum lead. Um celular recuperado que colide com
  // outro cadastro é central de rede, não a casa.
  const jaEmUso = new Map();
  for (let de = 0; ; de += 1000) {
    const { data } = await supabaseAdmin.from('prospect_leads')
      .select('id, name, whatsapp_phone').not('whatsapp_phone', 'is', null).range(de, de + 999);
    if (!data || !data.length) break;
    for (const l of data) jaEmUso.set(soDigitos(l.whatsapp_phone), l.name);
    if (data.length < 1000) break;
  }

  const r = {
    achou: 0, central: 0, semCelular: 0, siteFora: 0,
    gravou: 0, marcouCentral: 0, falhaGravacao: 0,
  };
  /** Números atribuídos NESTE run — o Coco Bambu apareceu 3x na amostra de 60. */
  const usadoNesteRun = new Map();

  for (let i = 0; i < candidatos.length; i++) {
    const lead = candidatos[i];
    const resp = await baixar(lead.website);
    if (resp.erro) { r.siteFora++; await dormir(PAUSA_MS); continue; }

    const achado = extrairCelularDoSite(resp.html, { numeroAtual: lead.whatsapp_phone || lead.phone });
    if (!achado) { r.semCelular++; await dormir(PAUSA_MS); continue; }

    r.achou++;
    const dig = soDigitos(achado.numero);

    // CENTRAL DE REDE: o mesmo celular servindo vários cadastros. Descoberto no
    // dry-run — +5511910081990 apareceu em três leads "Coco Bambu". Gravar isso
    // como telefone dos três faria a Olímpia mandar três mensagens para o mesmo
    // WhatsApp, cada uma sobre uma casa diferente. É assim que se ganha bloqueio.
    //
    // O DDD não denuncia (todos eram 11); a repetição sim.
    const donoAnterior = jaEmUso.get(dig) || usadoNesteRun.get(dig);
    if (donoAnterior) {
      r.central++;
      console.log(`  ~ ${achado.numero}  ${lead.name.slice(0, 34)}  → já é de "${String(donoAnterior).slice(0, 24)}"`);
      if (GRAVAR) {
        // NÃO vira o telefone dele. Fica registrado como indicação, que o
        // cockpit já mostra, para você decidir com qual unidade falar.
        const { error } = await supabaseAdmin.from('prospect_leads').update({
          numero_indicado: achado.numero,
          numero_indicado_contexto: `site da casa (${achado.via}) — número compartilhado com "${donoAnterior}", provável central da rede`,
          numero_indicado_em: new Date().toISOString(),
        }).eq('id', lead.id);
        if (error) { r.falhaGravacao++; console.log(`     !! falhou: ${error.message}`); }
        else r.marcouCentral++;
      }
      await dormir(PAUSA_MS);
      continue;
    }

    usadoNesteRun.set(dig, lead.name);
    console.log(`  ${achado.numero}  ${achado.dddDiferente ? '(DDD difere) ' : ''}${lead.name.slice(0, 40)}`);

    if (GRAVAR) {
      // POR ID, um de cada vez. Update em massa por padrão é como se apaga
      // coisa sem perceber.
      const { error } = await supabaseAdmin.from('prospect_leads').update({
        whatsapp_phone: achado.numero,
        whatsapp_source: achado.dddDiferente ? 'site_ddd_outro' : 'site',
      }).eq('id', lead.id);
      if (error) { r.falhaGravacao++; console.log(`     !! falhou: ${error.message}`); }
      else r.gravou++;
    }
    await dormir(PAUSA_MS);
  }

  const abriram = candidatos.length - r.siteFora;
  console.log('\n' + '='.repeat(58));
  console.log(`sites que abriram : ${abriram} (${r.siteFora} fora do ar)`);
  console.log(`celular achado    : ${r.achou}  (${abriram ? Math.round((100 * r.achou) / abriram) : 0}% dos que abriram)`);
  console.log(`  recuperáveis    : ${r.achou - r.central}  → viram o WhatsApp do lead`);
  console.log(`  central de rede : ${r.central}  → só registrados como indicação, telefone intacto`);
  console.log(`sem celular       : ${r.semCelular}`);
  if (GRAVAR) console.log(`GRAVADOS          : ${r.gravou} telefones + ${r.marcouCentral} indicações  (falhas: ${r.falhaGravacao})`);
  else console.log('\nnada foi gravado. rode com --gravar para aplicar.');
})().catch((err) => {
  console.error('erro fatal:', err.message);
  process.exit(1);
});
