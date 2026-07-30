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

// As 59 colunas de restaurant.restaurant_config, LIDAS DO BANCO em 2026-07-29
// via information_schema (não escritas de memória — a primeira versão desta
// lista foi adivinhada e acusou 6 falsos positivos).
//
// Ao adicionar um campo novo ao payload: 1) escreva a migração em
// supabase/migrations/, 2) aplique, 3) some o nome aqui.
const COLUNAS_CONHECIDAS = new Set([
  'agent_greeting', 'agent_language', 'agent_name', 'agent_updated_at',
  'agent_voice_id', 'agent_voice_name', 'ai_config',
  'average_dining_duration_minutes', 'business_hours', 'city', 'country',
  'created_at', 'demo_contact_email', 'demo_contact_name', 'demo_day3_sent_at',
  'demo_day5_sent_at', 'demo_day7_sent_at', 'demo_expires_at', 'demo_token',
  'elevenlabs_agent_id', 'elevenlabs_phone_number', 'elevenlabs_phone_number_id',
  'email', 'id', 'is_active', 'is_demo', 'learning_status',
  'max_concurrent_reservations', 'menu_url', 'onboarding_completed',
  'openai_voice_id', 'persona_prompt_override', 'phone', 'phone_configured_at',
  'phone_integration_error', 'phone_integration_status', 'profile_generated_at',
  'referral_code', 'reservation_settings', 'restaurant_name',
  'restaurant_profile', 'restaurant_type', 'slug', 'table_configuration',
  'team_members', 'timezone', 'tts_model_id', 'twilio_phone_number',
  'updated_at', 'user_id', 'voice_engine', 'voice_engine_status', 'voice_id',
  'voice_settings', 'voice_ws_endpoint', 'website', 'whatsapp_enabled',
  'whatsapp_phone_number', 'whatsapp_provisioning',
]);

/** Chaves de primeiro nível do literal `restaurantConfigData` no código. */
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
  return chaves;
}

describe('payload do onboarding vs. colunas de restaurant_config', () => {
  test('nenhum campo gravado sem coluna correspondente', () => {
    const chaves = lerChavesDoPayload();
    expect(chaves.size).toBeGreaterThan(5); // sanidade do parser

    const orfas = [...chaves].filter((k) => !COLUNAS_CONHECIDAS.has(k));
    expect(orfas).toEqual([]);
  });

  test('menu_url NÃO está no payload — a coluna não existe em produção', () => {
    // Confirmado via PostgREST no projeto de produção: `select menu_url` devolve
    // 42703 (coluna não existe), enquanto `select website` devolve 42501
    // (permissão) — ou seja, website existe e menu_url não. Enquanto a migração
    // não for aplicada LÁ, incluir esta chave quebra o passo final do
    // onboarding. O valor vive em metric_profile (JSONB).
    expect(lerChavesDoPayload().has('menu_url')).toBe(false);
  });

  test('a migração de menu_url está versionada no repo, esperando aplicação', () => {
    // Fica no repo para ser aplicada no projeto certo. Coluna que existe só num
    // ambiente reaparece como bug em todos os outros.
    const dir = path.join(__dirname, '..', '..', 'supabase', 'migrations');
    const temMigracao = fs.readdirSync(dir).some((f) => {
      if (!f.endsWith('.sql')) return false;
      const sql = fs.readFileSync(path.join(dir, f), 'utf8');
      return /restaurant_config/.test(sql) && /menu_url/.test(sql);
    });
    expect(temMigracao).toBe(true);
  });

  test('o cardápio não é perdido: segue em metric_profile, que é JSONB', () => {
    // JSONB aceita chave nova sem DDL. É por isso que cnpj/razao_social/
    // socio_confirmado nunca quebraram — e é o abrigo do menu_url por ora.
    const src = fs.readFileSync(path.join(__dirname, '..', 'onboarding', 'complete.js'), 'utf8');
    const bloco = src.slice(src.indexOf('metric_profile:'), src.indexOf('onboarding_completed_at'));
    expect(bloco).toMatch(/menu_url/);
  });
});
