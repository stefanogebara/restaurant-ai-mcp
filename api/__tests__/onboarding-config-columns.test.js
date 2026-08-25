'use strict';

/**
 * Guarda de contrato: todo campo que o onboarding grava em
 * `restaurant.restaurant_config` precisa EXISTIR como coluna.
 *
 * Por que este teste existe: em 2460482f o onboarding passou a enviar
 * `menu_url` no payload sem que a coluna tivesse sido criada. O PostgREST
 * rejeita coluna desconhecida (PGRST204), então o passo FINAL do onboarding
 * falhava — o dono preenchia seis passos e não conseguia concluir. Nenhum teste
 * pegou, porque a suíte mocka o Supabase: um mock aceita qualquer chave.
 *
 * Este teste não fala com o banco (a suíte roda sem credenciais). Ele compara o
 * payload do código com a lista de colunas conhecidas, mantida logo abaixo.
 * Adicionar campo ao payload obriga a atualizar esta lista — e é aí que se
 * pergunta "a migração existe?".
 */

const fs = require('fs');
const path = require('path');

// As 69 colunas de restaurant.restaurant_config, lidas do projeto de PRODUÇÃO
// (ckforlwdhewexyqljsaf) em 2026-08-02 via information_schema.
// Histórico: 64 em 30/07 → 67 em 01/08 (menu_url, restaurant_profile,
// profile_generated_at) → 69 em 02/08 (metric_profile e owner_metric_profile,
// que vieram de restaurant_info quando ela foi aposentada).
//
// A versão anterior desta lista tinha 59 nomes e estava ERRADA: veio de um
// `information_schema` consultado no projeto Supabase errado (o MCP desta
// sessão aponta para outro projeto). Ela continha 14 colunas que não existem em
// produção (agent_voice_id, restaurant_aliases, tts_model_id, twilio_phone_number,
// voice_settings, …) e omitia 18 que existem (staffing_config, deposit_config,
// survey_config, manager_phone, …). Um teste de contrato alimentado por dados do
// ambiente errado dá falso verde — pior que não existir.
//
// Ao adicionar um campo novo ao payload: 1) escreva a migração em
// supabase/migrations/, 2) APLIQUE NO PROJETO DE PRODUÇÃO, 3) some o nome aqui.
const COLUNAS_CONHECIDAS = new Set([
  'agent_greeting', 'agent_language', 'agent_name', 'ai_config', 'ai_personality',
  'ai_strategy_doc', 'ai_strategy_updated_at', 'average_dining_duration_minutes',
  'business_hours', 'city', 'country', 'cover_image_url', 'created_at',
  'demo_contact_email', 'demo_contact_name', 'demo_day3_sent_at',
  'demo_day5_sent_at', 'demo_day7_sent_at', 'demo_expires_at', 'demo_token',
  'deposit_config', 'elevenlabs_agent_id', 'elevenlabs_kb_doc_id',
  'elevenlabs_webhook_secret', 'email', 'feedback_config', 'id',
  'instagram_tone_profile', 'is_active', 'is_demo', 'learning_status',
  'manager_phone', 'manager_whatsapp_code', 'manager_whatsapp_code_expires_at',
  'manager_whatsapp_verified', 'max_concurrent_reservations', 'menu_url',
  'metric_profile',
  'notification_preferences', 'onboarding_completed', 'openai_voice_id',
  'owner_metric_profile',
  'persona_prompt_override', 'phone', 'profile_generated_at', 'referral_code',
  'reminder_voice_notes_enabled', 'reservation_settings', 'restaurant_name',
  'restaurant_profile', 'restaurant_type', 'scraped_data', 'slug',
  'staffing_config', 'survey_config',
  'table_configuration', 'team_members', 'timezone', 'updated_at', 'user_id',
  'voice_engine', 'voice_engine_status', 'voice_id', 'voice_ws_endpoint',
  'website', 'whatsapp_enabled', 'whatsapp_phone_number', 'whatsapp_provider',
  'whatsapp_provisioning',
]);

/**
 * Chaves de primeiro nível do literal `restaurantConfigData` MAIS as
 * atribuições `restaurantConfigData.x = ...` feitas depois dele (o
 * conhecimento do demo entra assim, condicionalmente). Sem a segunda parte o
 * guarda tinha um ponto cego: campo novo fora do literal escapava da
 * checagem de coluna — exatamente a classe de bug que este teste existe para
 * pegar.
 */
function lerChavesDoPayload() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'onboarding', 'complete.js'), 'utf8'
  );
  const ini = src.indexOf('const restaurantConfigData = {');
  expect(ini).toBeGreaterThan(-1);

  // Varre equilibrando chaves para achar o fim exato do literal.
  const abre = src.indexOf('{', ini);
  let nivel = 0, fim = -1;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === '{') nivel++;
    else if (src[i] === '}') { nivel--; if (nivel === 0) { fim = i; break; } }
  }
  expect(fim).toBeGreaterThan(abre);

  const corpo = src.slice(abre + 1, fim);
  const chaves = new Set();
  let profundidade = 0;
  for (const linha of corpo.split('\n')) {
    const semComentario = linha.replace(/\/\/.*$/, '');
    // Só o primeiro nível interessa: valores aninhados (business_hours,
    // reservation_settings) são JSONB e aceitam qualquer forma interna.
    if (profundidade === 0) {
      const m = semComentario.match(/^\s*([a-z_][a-z0-9_]*)\s*:/i);
      if (m) chaves.add(m[1]);
    }
    profundidade += (semComentario.match(/[{[]/g) || []).length;
    profundidade -= (semComentario.match(/[}\]]/g) || []).length;
  }
  for (const m of src.matchAll(/restaurantConfigData\.([a-z_][a-z0-9_]*)\s*=/gi)) {
    if (m[1] !== 'reservation_settings') chaves.add(m[1]);
  }

  return chaves;
}

describe('payload do onboarding vs. colunas de restaurant_config', () => {
  test('nenhum campo gravado sem coluna correspondente', () => {
    const chaves = lerChavesDoPayload();
    expect(chaves.size).toBeGreaterThan(5); // sanidade do parser

    const orfas = [...chaves].filter((k) => !COLUNAS_CONHECIDAS.has(k));
    expect(orfas).toEqual([]);
  });

  test('menu_url ESTÁ no payload — a coluna foi criada em produção', () => {
    // Invertido em 01/08/2026. A coluna foi aplicada em ckforlwdhewexyqljsaf e
    // verificada por dois caminhos: information_schema lista `menu_url`, e o
    // PostgREST responde 200 a `select=menu_url` (era 42703). É o cache do
    // PostgREST que derrubava o passo final do onboarding, então ele é o que
    // precisa enxergar.
    expect(lerChavesDoPayload().has('menu_url')).toBe(true);
  });

  test('a migração de menu_url está versionada no repo', () => {
    // Coluna que existe só num ambiente reaparece como bug em todos os outros.
    const dir = path.join(__dirname, '..', '..', 'supabase', 'migrations');
    const temMigracao = fs.readdirSync(dir).some((f) => {
      if (!f.endsWith('.sql')) return false;
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      return /restaurant_config/.test(sql) && /menu_url/.test(sql);
    });
    expect(temMigracao).toBe(true);
  });

  test('uma verdade só: o cardápio saiu do abrigo JSONB', () => {
    // metric_profile (em restaurant_info) hospedou menu_url enquanto a coluna
    // não existia. Manter os dois deixaria dois lugares dizendo a mesma coisa e
    // ninguém sabendo qual manda. Nenhum dado se perdeu na troca: o abrigo
    // estava vazio em todas as linhas existentes.
    const src = fs.readFileSync(path.join(__dirname, '..', 'onboarding', 'complete.js'), 'utf8');
    const bloco = src.slice(src.indexOf('metric_profile:'), src.indexOf('onboarding_completed_at'));
    const chaveViva = bloco.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(chaveViva).not.toMatch(/menu_url\s*:/);
  });
});
