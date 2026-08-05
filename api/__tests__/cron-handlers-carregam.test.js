'use strict';

/**
 * Todo handler de cron precisa CARREGAR, não só existir.
 *
 * INCIDENTE (05/08/2026): o cron de disparo de intro subiu para produção com
 * um erro de sintaxe. Escrever uma crontab de 15 em 15 minutos (asterisco,
 * barra, quinze) dentro de um comentário de bloco FECHA o comentário na barra,
 * e o resto da frase vira código solto. A função respondia
 * FUNCTION_INVOCATION_FAILED em toda chamada, e a agenda da Vercel bateu na
 * porta por horas sem nada acontecer.
 *
 * (Sim: a primeira versão DESTE arquivo repetiu o mesmo erro ao descrever o
 * erro. Por isso a sequência está escrita por extenso acima.)
 *
 * A suíte estava verde com 3148 testes. O teste do vigia lê o handler como
 * TEXTO (regex procurando logCronRun) e nunca faz require — então provava que
 * a string existia no arquivo, não que o arquivo executa. Cobertura que lê sem
 * executar é a mesma família de "registro sem batimento": parece proteção.
 *
 * Este teste é barato e pega a classe inteira: erro de sintaxe, import
 * quebrado, throw em tempo de carga.
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'cron');
const handlers = fs.readdirSync(DIR).filter((f) => f.endsWith('.js'));

describe('handlers de cron carregam e exportam função', () => {
  test('a pasta tem handlers (o teste não pode passar vazio)', () => {
    expect(handlers.length).toBeGreaterThan(10);
  });

  test.each(handlers)('%s', (arquivo) => {
    // require() lança em erro de sintaxe, import quebrado ou throw de carga.
    const mod = require(path.join(DIR, arquivo));
    // health.js exporta o registro além do handler; aceita objeto com função.
    const ehFuncao = typeof mod === 'function' || typeof (mod && mod.default) === 'function';
    const ehModuloDeApoio = mod && typeof mod === 'object' && Object.keys(mod).length > 0;
    expect(ehFuncao || ehModuloDeApoio).toBe(true);
  });
});
