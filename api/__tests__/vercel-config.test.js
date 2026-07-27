'use strict';

/**
 * Sanidade do vercel.json — o build inteiro depende disto e ele quebra calado.
 *
 * Caso real (26/jul → 27/jul/2026): alguém acrescentou
 * `"api/cron/prospect-enrich.js"` DEPOIS do curinga `"api/**\/*.js"` no bloco
 * `functions`. A Vercel casa os padrões em ordem: o curinga já havia
 * reivindicado todas as funções, então a entrada específica não sobrou par e o
 * build falhou com
 *
 *   unused_function: The pattern "api/cron/prospect-enrich.js" defined in
 *   `functions` doesn't match any Serverless Functions inside the `api` directory.
 *
 * QUATRO commits seguidos falharam o deploy sem que ninguém notasse — produção
 * ficou dois dias servindo build velho enquanto o repositório seguia em frente.
 * Push verde no git não é deploy verde. Estes testes fazem a suíte falhar antes.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const config = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));
const padroes = Object.keys(config.functions || {});
const CURINGA = 'api/**/*.js';

describe('vercel.json — bloco functions', () => {
  test('o curinga api/**/*.js é a ÚLTIMA entrada', () => {
    const i = padroes.indexOf(CURINGA);
    if (i === -1) return; // sem curinga, a regra não se aplica
    const depois = padroes.slice(i + 1);
    expect(depois).toEqual([]); // qualquer coisa aqui quebra o build na Vercel
  });

  test('toda entrada específica aponta para um arquivo que existe', () => {
    const ausentes = padroes
      .filter((p) => !p.includes('*'))
      .filter((p) => !fs.existsSync(path.join(RAIZ, p)));
    expect(ausentes).toEqual([]);
  });

  test('todo cron agendado tem um handler correspondente no disco', () => {
    // Cron apontando para rota inexistente não quebra o build, mas gasta
    // invocação todo dia batendo em 404 — e some no meio do ruído.
    const semHandler = (config.crons || [])
      .map((c) => String(c.path).split('?')[0])
      .filter((rota) => {
        const base = path.join(RAIZ, rota.replace(/^\//, ''));
        // A rota pode ser servida pelo arquivo direto ou por um rewrite.
        if (fs.existsSync(`${base}.js`)) return false;
        const temRewrite = (config.rewrites || [])
          .some((r) => r.source === rota || r.source === `${rota}/`);
        return !temRewrite;
      });
    expect(semHandler).toEqual([]);
  });
});
