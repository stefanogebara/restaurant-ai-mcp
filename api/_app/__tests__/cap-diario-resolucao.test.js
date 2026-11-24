'use strict';

/**
 * De onde vem o teto de disparo do dia.
 *
 * Até aqui o teto vinha só de PROSPECTING_DAILY_CAP, variável de ambiente da
 * Vercel. Mudar o ritmo da prospecção exigia editar env E redeployar, e o
 * valor efetivo ficava invisível para quem opera pelo cockpit: a nota do
 * cron_config dizia "40/dia" porque alguém escreveu isso à mão.
 *
 * Agora o teto mora no banco (cron_config.daily_cap), que é editável sem
 * deploy. O env vira fallback e a rampa continua sendo o padrão de quem não
 * configurou nada.
 *
 * O TETO DURO importa: este número controla quantas mensagens frias saem do
 * WhatsApp da empresa por dia. Um dedo gordo (1000 em vez de 100) queimaria a
 * reputação do número, que é ativo caro e lento de recuperar. Valor fora da
 * faixa é IGNORADO, não clampeado em silêncio — clampe silencioso esconde o
 * erro de digitação e faz a pessoa achar que configurou o que não configurou.
 */

const { resolverCap, TETO_ABSOLUTO } = require('../_lib/prospecting/prospect-warmup');

describe('resolverCap: precedência banco > env > rampa', () => {
  test('banco vence o env e a rampa', () => {
    expect(resolverCap({ dbCap: 100, envCap: 40, rampa: 250 })).toEqual({ cap: 100, origem: 'banco' });
  });

  test('sem banco, o env vale', () => {
    expect(resolverCap({ dbCap: null, envCap: 40, rampa: 250 })).toEqual({ cap: 40, origem: 'env' });
  });

  test('sem banco e sem env, a rampa manda', () => {
    expect(resolverCap({ dbCap: null, envCap: null, rampa: 90 })).toEqual({ cap: 90, origem: 'rampa' });
  });

  test('valor do banco acima do teto é ignorado, não clampeado', () => {
    const r = resolverCap({ dbCap: 1000, envCap: 40, rampa: 250 });
    expect(r.cap).toBe(40);
    expect(r.origem).toBe('env');
    expect(r.recusado).toBe(1000);
  });

  test('zero e negativo no banco são ignorados (nao viram "pare de mandar")', () => {
    expect(resolverCap({ dbCap: 0, envCap: 40, rampa: 250 }).cap).toBe(40);
    expect(resolverCap({ dbCap: -5, envCap: 40, rampa: 250 }).cap).toBe(40);
  });

  test('lixo no banco nao derruba o disparo: cai pro proximo da fila', () => {
    for (const v of ['cem', NaN, {}, [], true, 1.5]) {
      expect(resolverCap({ dbCap: v, envCap: 40, rampa: 250 }).cap).toBe(40);
    }
  });

  test('env invalido tambem e ignorado', () => {
    expect(resolverCap({ dbCap: null, envCap: 0, rampa: 90 })).toEqual({ cap: 90, origem: 'rampa' });
    expect(resolverCap({ dbCap: null, envCap: 99999, rampa: 90 }).origem).toBe('rampa');
  });

  test('o teto absoluto e o mesmo do topo da rampa', () => {
    expect(TETO_ABSOLUTO).toBe(250);
    expect(resolverCap({ dbCap: TETO_ABSOLUTO, envCap: null, rampa: 40 }).cap).toBe(250);
  });

  test('nada configurado e rampa ausente: sobra o piso conservador', () => {
    expect(resolverCap({ dbCap: null, envCap: null, rampa: null }).cap).toBe(40);
  });
});
