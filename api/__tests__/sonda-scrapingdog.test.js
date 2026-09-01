/**
 * A SONDA QUE FALTAVA — 01/09/2026.
 *
 * De 26 a 31/08 a caça ao celular carimbou 752 leads e achou zero, e ninguém
 * conseguia dizer por quê. `SCRAPINGDOG_API_KEY` está marcada "Sensitive" na
 * Vercel: `vercel env pull` devolve "[SENSITIVE]", então nem a pergunta mais
 * básica — "a variável existe em produção?" — tinha resposta de fora.
 *
 * O caso do 429 é o que mais importa. A documentação do Scrapingdog diz que
 * estourar conexões simultâneas devolve 429 com a chave VÁLIDA. Se a sonda
 * tratasse isso como "chave recusada", mandaria trocar a chave quando o certo
 * é subir o plano — conserto errado, dinheiro gasto à toa.
 */

const { sondarScrapingdog, NIVEIS } = require('../_lib/integration-probes');

const CHAVE = 'sd_chave_secreta_de_teste_1234567890';

beforeEach(() => { global.fetch = jest.fn(); });

const responder = (status) => {
  global.fetch.mockResolvedValue({ status, json: async () => ({}) });
};

describe('sondarScrapingdog', () => {
  test('sem a variável: diz exatamente isso, e não chama o fornecedor', async () => {
    const r = await sondarScrapingdog({});

    // Este é o ramo que responde a pergunta que ninguém conseguia responder.
    expect(r.nivel).toBe(NIVEIS.NAO_CONFIGURADO);
    expect(r.detalhe).toContain('SCRAPINGDOG_API_KEY');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('200: chave válida e com cota', async () => {
    responder(200);
    const r = await sondarScrapingdog({ SCRAPINGDOG_API_KEY: CHAVE });
    expect(r.nivel).toBe(NIVEIS.OK);
  });

  test('429 NÃO é chave recusada: manda subir o plano, não trocar a chave', async () => {
    responder(429);
    const r = await sondarScrapingdog({ SCRAPINGDOG_API_KEY: CHAVE });

    expect(r.nivel).toBe(NIVEIS.FALHA);
    expect(r.detalhe).toContain('429');
    // O ponto do teste: o diagnóstico tem que dizer que a CHAVE VALE.
    // Sem isso, o conserto sugerido é o errado.
    expect(r.detalhe).toMatch(/chave VALE/i);
  });

  test.each([[401], [403]])('HTTP %i: chave recusada, e o conselho é trocar', async (status) => {
    responder(status);
    const r = await sondarScrapingdog({ SCRAPINGDOG_API_KEY: CHAVE });
    expect(r.nivel).toBe(NIVEIS.FALHA);
    expect(r.detalhe).toMatch(/trocar a chave/i);
  });

  test('402: sem crédito, o conselho é recarregar', async () => {
    responder(402);
    const r = await sondarScrapingdog({ SCRAPINGDOG_API_KEY: CHAVE });
    expect(r.nivel).toBe(NIVEIS.FALHA);
    expect(r.detalhe).toMatch(/recarregar/i);
  });

  test('5xx é atenção, não falha: problema deles, não nosso', async () => {
    responder(503);
    const r = await sondarScrapingdog({ SCRAPINGDOG_API_KEY: CHAVE });
    expect(r.nivel).toBe(NIVEIS.ATENCAO);
  });

  test('a sondagem não paga por renderização de JS', async () => {
    responder(200);
    await sondarScrapingdog({ SCRAPINGDOG_API_KEY: CHAVE });

    const url = global.fetch.mock.calls[0][0];
    expect(url).not.toContain('dynamic=true');
  });

  test('a chave nunca aparece na resposta, em nenhum status', async () => {
    for (const status of [200, 401, 402, 429, 503, 418]) {
      responder(status);
      const r = await sondarScrapingdog({ SCRAPINGDOG_API_KEY: CHAVE });
      // A chave viaja na query string; ecoar a URL num detalhe seria vazá-la,
      // e este endpoint existe pra ser colado em chat e ticket.
      expect(JSON.stringify(r)).not.toContain(CHAVE);
    }
  });
});
