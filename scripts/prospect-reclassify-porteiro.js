#!/usr/bin/env node
'use strict';

/**
 * Sweep de reclassificação: quantos dos leads em 'conversando' nunca tiveram
 * gente do outro lado?
 *
 * A auditoria de 2026-07-23 (14 conversas travadas, 98 em 'conversando', ZERO
 * reuniões) achou um denominador contaminado: em 4 das 14 NENHUM humano digitou
 * uma palavra — eram autoresponder, menu de bot ou a lista de transmissão de
 * marketing do próprio lead. O funil contava eco de máquina como "conversando",
 * inflando a taxa de resposta de 37,4% e queimando template de resgate contra
 * secretária eletrônica.
 *
 * Este script NÃO ENVIA NADA. Ele só lê o histórico e, com --apply, parqueia em
 * 'porteiro' (estado reversível: qualquer inbound humano volta a ser respondido,
 * e estadoAposAcao('responder') devolve o lead pra 'conversando').
 *
 * O resultado do --dry é um GATE: se marcar muito além do esperado, o predicado
 * está agressivo demais e o modo porteiro não deve subir como está.
 *
 * Uso:
 *   node scripts/prospect-reclassify-porteiro.js            # dry-run (padrão)
 *   node scripts/prospect-reclassify-porteiro.js --apply    # grava
 *   node scripts/prospect-reclassify-porteiro.js --state conversando --limit 500
 *
 * Requer SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no ambiente (.env do repo).
 */

require('dotenv').config();

const { semHumanoNaThread, pareceAutoAtendimento } = require('../api/_lib/prospecting/prospect-state');
const {
  listProspectLeads, loadHistory, patchLead, recordEvent,
} = require('../api/_lib/prospecting/prospect-store');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const APPLY = has('--apply');
const STATE = val('--state', 'conversando');
const LIMIT = Math.min(parseInt(val('--limit', '500'), 10) || 500, 500);

/** Classifica uma thread pra explicar POR QUE ela caiu no balde de máquina. */
function motivo(history) {
  const ins = (history || []).filter((h) => h && h.tipo !== 'sys' && h.direcao === 'in');
  const semTexto = ins.filter((h) => !h.corpo || !String(h.corpo).trim()).length;
  const auto = ins.filter((h) => h.corpo && pareceAutoAtendimento(h.corpo)).length;
  if (auto && semTexto) return 'auto-atendimento + mídia sem texto';
  if (auto) return 'auto-atendimento';
  if (semTexto === ins.length) return 'só mídia sem texto (broadcast)';
  return 'repetição literal';
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no ambiente.');
    process.exit(1);
  }

  console.log(`\nsweep porteiro · estado '${STATE}' · ${APPLY ? 'APPLY (grava)' : 'DRY-RUN (não grava)'}\n`);

  const leads = await listProspectLeads({ state: STATE, limit: LIMIT });
  if (!leads.length) {
    console.log('nenhum lead nesse estado.');
    return;
  }

  const maquina = [];
  const humanos = [];
  let semHistorico = 0;

  for (const lead of leads) {
    const history = await loadHistory(lead.id, 80);
    const ins = history.filter((h) => h.direcao === 'in' && h.tipo !== 'sys');
    if (!ins.length) { semHistorico++; continue; }
    if (semHumanoNaThread(history)) maquina.push({ lead, motivo: motivo(history), ins: ins.length });
    else humanos.push(lead);
  }

  for (const { lead, motivo: m, ins } of maquina) {
    console.log(`  🚪 ${String(lead.name || lead.id).slice(0, 46).padEnd(48)} ${String(ins).padStart(2)} in · ${m}`);
    if (APPLY) {
      const r = await patchLead(lead.id, { prospect_state: 'porteiro' });
      if (r.ok) await recordEvent(lead.id, `🚪 reclassificado pelo sweep: nenhum humano na thread (${m})`);
    }
  }

  const total = leads.length;
  const pct = (n) => `${((100 * n) / total).toFixed(1)}%`;
  console.log('\n' + '─'.repeat(64));
  console.log(`  analisados            ${total}`);
  console.log(`  humano de verdade     ${humanos.length}  (${pct(humanos.length)})`);
  console.log(`  só eco de máquina     ${maquina.length}  (${pct(maquina.length)})  ${APPLY ? '→ parqueados em porteiro' : '→ seriam parqueados'}`);
  console.log(`  sem inbound nenhum    ${semHistorico}  (${pct(semHistorico)})  → intocados`);
  console.log('─'.repeat(64));
  if (!APPLY) console.log('\ndry-run: nada foi gravado. rode com --apply pra parquear.\n');
  else console.log('\nfeito. \'porteiro\' é reversível: inbound humano revive o lead.\n');
}

main().catch((err) => {
  console.error('sweep falhou:', err.message);
  process.exit(1);
});
