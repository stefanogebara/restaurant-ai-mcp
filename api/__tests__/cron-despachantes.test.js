/**
 * OS DESPACHANTES DE CRON — consolidação de 03/09/2026.
 *
 * 36 crons eram 36 funções serverless. Cada uma custa ~3,4s de trace NFT por
 * build, e o build deste projeto era 80,8% da conta de CPU do ciclo. Viraram 3
 * despachantes + o health (que é sob demanda e precisa manter a própria URL).
 *
 * O QUE PODE DAR ERRADO AQUI DÁ ERRADO EM SILÊNCIO, que é por que estes testes
 * existem:
 *
 *  - Um job somer do mapa: o cron dispara, leva 400, e ninguém olha resposta de
 *    cron. O trabalho simplesmente para de acontecer.
 *  - Um job cair no despachante de teto errado: a rodada de 300s é cortada aos
 *    60s no meio, sem erro visível — só resultado pela metade.
 *  - O vercel.json apontar para job inexistente: 400 eterno.
 *
 * Por isso os testes leem o vercel.json de verdade em vez de repetir a lista à
 * mão. Lista escrita à mão em teste só prova que eu copiei igual duas vezes.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const vercel = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));

const DESPACHANTES = {
  'run.js': 60,
  'run-2min.js': 120,
  'run-5min.js': 300,
};

/** Teto efetivo de uma função: explícito em `functions`, senão o default do glob. */
function tetoDe(arquivo) {
  const explicito = vercel.functions[`api/cron/${arquivo}`];
  if (explicito && explicito.maxDuration) return explicito.maxDuration;
  return vercel.functions['api/**/*.js'].maxDuration;
}

const cronsDeApiCron = vercel.crons.filter((c) => c.path.startsWith('/api/cron/'));

describe('roteamento: todo cron agendado chega a um handler', () => {
  test.each(cronsDeApiCron.map((c) => [c.path]))('%s', (caminho) => {
    const [rota, query] = caminho.split('?');
    const arquivo = `${rota.split('/').pop()}.js`;

    // A rota tem que ser um despachante que existe em disco.
    expect(fs.existsSync(path.join(RAIZ, 'api', 'cron', arquivo))).toBe(true);

    const job = new URLSearchParams(query).get('job');
    expect(job).toBeTruthy();

    // E o job tem que estar no mapa DESSE despachante — não de outro.
    const { JOBS_DISPONIVEIS } = require(`../cron/${arquivo}`);
    expect(JOBS_DISPONIVEIS).toContain(job);
  });
});

describe('tetos: nenhum job perdeu tempo de execução na mudança', () => {
  // Antes da consolidação estes tinham maxDuration próprio. Se um deles cair
  // num despachante mais curto, a rodada é cortada no meio sem erro visível.
  const ANTES = {
    'compile-wiki': 300,
    'prospect-score-outcomes': 300,
    'prospect-dispatch': 120,
    'prospect-flush': 120,
    'prospect-nudge': 120,
    'prospect-enrich': 60,
    'prospect-founder-email': 60,
    'prospect-handoff-digest': 60,
  };

  test.each(Object.entries(ANTES))('%s mantém >= %is', (job, tetoAntigo) => {
    const arquivo = Object.keys(DESPACHANTES).find((f) => {
      const { JOBS_DISPONIVEIS } = require(`../cron/${f}`);
      return JOBS_DISPONIVEIS.includes(job);
    });
    expect(arquivo).toBeDefined();
    expect(tetoDe(arquivo)).toBeGreaterThanOrEqual(tetoAntigo);
  });

  test('cada despachante tem o teto que o nome promete', () => {
    for (const [arquivo, teto] of Object.entries(DESPACHANTES)) {
      expect(tetoDe(arquivo)).toBe(teto);
    }
  });
});

describe('nenhum handler ficou órfão', () => {
  test('todo arquivo em api/_crons está em algum despachante', () => {
    const emDisco = fs.readdirSync(path.join(RAIZ, 'api', '_crons'))
      .filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3));
    const mapeados = Object.keys(DESPACHANTES)
      .flatMap((f) => require(`../cron/${f}`).JOBS_DISPONIVEIS);

    expect(emDisco.sort()).toEqual([...mapeados].sort());
  });

  test('health continua com função própria — é endpoint sob demanda, sem cron', () => {
    // Movê-lo para o despachante faria GET /api/cron/health virar 404 em
    // silêncio para quem monitora de fora.
    expect(fs.existsSync(path.join(RAIZ, 'api', 'cron', 'health.js'))).toBe(true);
    const nenhum = Object.keys(DESPACHANTES)
      .flatMap((f) => require(`../cron/${f}`).JOBS_DISPONIVEIS);
    expect(nenhum).not.toContain('health');
  });
});

describe('job desconhecido devolve 400, nunca 404', () => {
  // 404 é o sintoma de a função ter sumido do manifesto da Vercel (a NFT remove
  // em silêncio quem dá require em handler irmão). Se o próprio código também
  // devolvesse 404, "rota existe, job errado" ficaria indistinguível de
  // "função não foi publicada" — e essa distinção é a única forma de conferir
  // o deploy de fora.
  const resposta = () => {
    const r = { code: null, corpo: null };
    r.status = (c) => { r.code = c; return r; };
    r.json = (b) => { r.corpo = b; return r; };
    return r;
  };

  test.each(['run.js', 'run-2min.js', 'run-5min.js'])('%s sem job', async (arquivo) => {
    const res = resposta();
    await require(`../cron/${arquivo}`)({ query: {} }, res);
    expect(res.code).toBe(400);
    expect(Array.isArray(res.corpo.jobs)).toBe(true);
  });

  test('job que não existe', async () => {
    const res = resposta();
    await require('../cron/run.js')({ query: { job: 'nao-existe' } }, res);
    expect(res.code).toBe(400);
  });
});
