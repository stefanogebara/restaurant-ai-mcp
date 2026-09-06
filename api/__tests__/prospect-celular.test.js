/**
 * A CAÇA AO CELULAR — 26/08/2026.
 *
 * Contexto medido em produção: 1.392 casas passam o filtro de qualidade e 1.389
 * têm SÓ FIXO. WhatsApp não existe em fixo, então a rodada das 13:10 de 26/08
 * veio `candidates: 0`. Dessas 1.389, 847 têm site — e o WhatsApp está lá, no
 * botão flutuante.
 *
 * O que estes testes travam, em ordem de importância:
 *   1. o CARIMBO sempre gravado, ache ou não — é o que faz a fila andar;
 *   2. o fixo nunca vira `whatsapp_phone`;
 *   3. a ordem de confiança das fontes (wa.me > tel: > texto solto).
 */

var mockUpdate;
var mockEq;
var mockSupabaseAdmin = { from: jest.fn() };

jest.mock('../_lib/supabase', () => ({ supabaseAdmin: mockSupabaseAdmin }));
jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));

const {
  cacarCelular, cacarCelularPendentes, jaTemCelular,
} = require('../_lib/prospecting/prospect-celular');
const { extrairCelularDoSite } = require('../_lib/prospecting/prospect-extract');

/** Captura o patch enviado ao banco. */
function capturarUpdate() {
  const capturado = {};
  mockEq = jest.fn().mockResolvedValue({ error: null });
  mockUpdate = jest.fn().mockImplementation((patch) => {
    capturado.patch = patch;
    return { eq: mockEq };
  });
  mockSupabaseAdmin.from.mockReturnValue({ update: mockUpdate });
  return capturado;
}

const leadBase = (over = {}) => ({
  id: 'lead-1',
  name: 'Cantina do Zé',
  website: 'https://cantinadoze.com.br',
  whatsapp_phone: '+551133334444', // FIXO — é o caso real dos 1.389
  address: 'Rua X, São Paulo',
  enrich_status: { cnpj: 'missing' },
  ...over,
});

beforeEach(() => jest.clearAllMocks());

describe('extrairCelularDoSite — ordem de confiança', () => {
  it('prefere wa.me a qualquer outra coisa na página', () => {
    // A página tem os três; o wa.me é o único que PROVA que o canal é WhatsApp.
    const html = `
      <a href="tel:+551133334444">fixo</a>
      <p>Reservas: (11) 97777-1111</p>
      <a href="https://wa.me/5511988887777">WhatsApp</a>`;
    expect(extrairCelularDoSite(html)).toEqual({ numero: '+5511988887777', fonte: 'wa_link' });
  });

  it('cai para tel: quando não há link de WhatsApp', () => {
    const html = '<a href="tel:11 96666-5555">chame</a><p>ou (11) 3333-4444</p>';
    expect(extrairCelularDoSite(html)).toEqual({ numero: '+5511966665555', fonte: 'tel_href' });
  });

  it('aceita api.whatsapp.com/send?phone=', () => {
    const html = '<a href="https://api.whatsapp.com/send?phone=5521998887777&text=oi">';
    expect(extrairCelularDoSite(html)).toEqual({ numero: '+5521998887777', fonte: 'wa_link' });
  });

  /**
   * O fixo é EXATAMENTE o que já temos e o que não serve. Uma página que só
   * tem fixo precisa devolver null, não o fixo.
   */
  it('nunca devolve fixo', () => {
    expect(extrairCelularDoSite('<a href="tel:1133334444">ligue</a>')).toBeNull();
    expect(extrairCelularDoSite('<a href="https://wa.me/551133334444">')).toBeNull();
    expect(extrairCelularDoSite('Telefone: (11) 3333-4444')).toBeNull();
  });

  it('não confunde CNPJ, CEP nem preço com telefone', () => {
    expect(extrairCelularDoSite('CNPJ 12.345.678/0001-90 — CEP 04567-000 — R$ 99,90')).toBeNull();
  });

  it('rejeita DDD que não existe', () => {
    expect(extrairCelularDoSite('<a href="https://wa.me/5500999998888">')).toBeNull();
  });

  it('página vazia ou nula não explode', () => {
    expect(extrairCelularDoSite('')).toBeNull();
    expect(extrairCelularDoSite(null)).toBeNull();
    expect(extrairCelularDoSite(undefined)).toBeNull();
  });

  it('não vaza lastIndex entre chamadas (regex global reusada)', () => {
    const html = '<a href="https://wa.me/5511988887777">';
    expect(extrairCelularDoSite(html)).toEqual(extrairCelularDoSite(html));
  });
});

describe('cacarCelular — o que vai para o banco', () => {
  it('troca o fixo pelo celular achado e marca a fonte', async () => {
    const cap = capturarUpdate();
    const lerPagina = jest.fn().mockResolvedValue('<a href="https://wa.me/5511988887777">zap</a>');

    const r = await cacarCelular(leadBase(), lerPagina);

    expect(r).toEqual({ ok: true, numero: '+5511988887777', fonte: 'wa_link' });
    expect(cap.patch.whatsapp_phone).toBe('+5511988887777');
    expect(cap.patch.whatsapp_source).toBe('site_wa_link');
    // 'pending', não 'found': ainda não sabemos se o número tem WhatsApp. Quem
    // descobre é o primeiro envio (131026 → 'missing' pelo handler de recibos).
    expect(cap.patch.whatsapp_status).toBe('pending');
  });

  /**
   * O TESTE QUE MAIS IMPORTA. Sem o carimbo, a rodada seguinte relê exatamente
   * as mesmas páginas, para sempre, e nenhum lead novo é tentado — sem erro,
   * sem log, sem sintoma. É a fome de fila que este projeto já teve três vezes
   * (arquivamento 12/08, pontuação 13/08, enrich 24/08).
   */
  it('carimba site_wa_at MESMO quando não acha nada', async () => {
    const cap = capturarUpdate();
    const r = await cacarCelular(leadBase(), jest.fn().mockResolvedValue('<p>sem telefone</p>'));

    expect(r.ok).toBe(false);
    expect(cap.patch.enrich_status.site_wa).toBe('missing');
    expect(cap.patch.enrich_status.site_wa_at).toEqual(expect.any(String));
    // E não mexe no telefone quando não achou.
    expect(cap.patch).not.toHaveProperty('whatsapp_phone');
  });

  it('carimba também quando o scrape falha', async () => {
    const cap = capturarUpdate();
    const r = await cacarCelular(leadBase(), jest.fn().mockRejectedValue(new Error('502')));

    expect(r).toEqual({ ok: false, motivo: 'sem_html' });
    expect(cap.patch.enrich_status.site_wa_at).toEqual(expect.any(String));
  });

  it('preserva o resto do enrich_status (não pisa no trabalho do CNPJ)', async () => {
    const cap = capturarUpdate();
    await cacarCelular(
      leadBase({ enrich_status: { cnpj: 'ok', dono: 'ok', attempted_at: '2026-08-01T00:00:00Z' } }),
      jest.fn().mockResolvedValue(''));

    expect(cap.patch.enrich_status.cnpj).toBe('ok');
    expect(cap.patch.enrich_status.dono).toBe('ok');
    expect(cap.patch.enrich_status.attempted_at).toBe('2026-08-01T00:00:00Z');
  });
});

describe('jaTemCelular', () => {
  it('reconhece celular e recusa fixo', () => {
    expect(jaTemCelular({ whatsapp_phone: '+5511988887777' })).toBe(true);
    expect(jaTemCelular({ whatsapp_phone: '+551133334444' })).toBe(false);
    expect(jaTemCelular({ whatsapp_phone: null })).toBe(false);
    expect(jaTemCelular({})).toBe(false);
  });
});

describe('cacarCelularPendentes', () => {
  it('recusa rodar sem o leitor de página injetado', async () => {
    const r = await cacarCelularPendentes({});
    expect(r.erro).toBe('lerPagina obrigatório');
    expect(r.processados).toBe(0);
  });
});

/**
 * O CONSERTO DA MÉTRICA — 26/08/2026, depois da primeira rodada em produção.
 *
 * Ela voltou `{processados: 6, achados: 0, sem_numero: 6}` e esse número não
 * responde a pergunta que importa: os 6 sites abriram e não tinham WhatsApp,
 * ou os 6 não abriram? São causas OPOSTAS — a primeira condena a tática, a
 * segunda condena o scrape. Somadas no mesmo balde, não dizem nada, e um zero
 * ambíguo é pior que nenhum número porque convida a concluir a errada.
 *
 * É o mesmo erro de camada que este projeto passou dois dias consertando nos
 * outros crons, repetido dentro do conserto.
 */
describe('cacarCelularPendentes — sem_html não é sem_numero', () => {
  function filaCom(leads) {
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({ data: leads, error: null }),
      update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
    };
    mockSupabaseAdmin.from.mockReturnValue(chain);
  }

  // Dentro da faixa de qualidade e com nome de casa de mesa, senão a mira nova
  // (correta) derruba o lead antes de chegar ao balde que este teste mede.
  const fixo = (i) => ({
    id: `l${i}`, name: `Cantina ${i}`, website: `https://casa${i}.com.br`,
    reviews_count: 300, rating: 4.6,
    whatsapp_phone: '+551133334444', enrich_status: {},
  });

  it('separa scrape morto de site sem WhatsApp', async () => {
    filaCom([fixo(1), fixo(2)]);
    // Um site abre e não tem número; o outro não abre.
    const lerPagina = jest.fn()
      .mockResolvedValueOnce('<p>Bem-vindo ao nosso site</p>')
      .mockResolvedValueOnce('');

    const r = await cacarCelularPendentes({ lerPagina });

    expect(r.processados).toBe(2);
    expect(r.sem_numero).toBe(1);
    expect(r.sem_html).toBe(1);
    expect(r.achados).toBe(0);
  });

  it('conta o achado sem contaminar os outros baldes', async () => {
    filaCom([fixo(1)]);
    const lerPagina = jest.fn().mockResolvedValue('<a href="https://wa.me/5511988887777">');

    const r = await cacarCelularPendentes({ lerPagina });

    expect(r).toEqual({ processados: 1, achados: 1, sem_numero: 0, sem_html: 0, falhas: 0 });
  });
});

/**
 * A MIRA — o defeito que a primeira rodada revelou, 26/08/2026.
 *
 * A rodada das 15:20 e 16:20 gastou TODAS as raspagens em: Shopping Iguatemi,
 * Morumbi Shopping, Center Norte, Shopping Metrô Itaquera, Shopping Campo
 * Limpo, Coco Bambu, Mercado Municipal, CTN.
 *
 * Nenhum deles receberia intro: o disparo exige reviews_count entre 120 e 5000
 * e passa pelo filtro de ICP. Shopping tem dezenas de milhares de avaliações,
 * então a ordenação `reviews_count DESC` o punha no topo e ele tomava todas as
 * vagas — para sempre, porque o cooldown é de 7 dias e a fila é grande.
 *
 * O zero daquela rodada não mediu a tática: mediu a arma apontada para o lado
 * errado. Gastar raspagem paga em quem nunca será alvo é pior que não raspar,
 * porque produz um número que PARECE veredito.
 *
 * Este teste falha na versão anterior: sem a faixa de qualidade e sem foraDoIcp,
 * o shopping entra na fila.
 */
describe('selecionarSemCelular — mira igual à do disparo', () => {
  const { selecionarSemCelular } = require('../_lib/prospecting/prospect-celular');

  /** Fila fake que APLICA os filtros de faixa, como o PostgREST faria. */
  function bancoCom(leads) {
    const estado = { min: null, max: null, nota: null };
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      gte: jest.fn((col, v) => { if (col === 'reviews_count') estado.min = v; else estado.nota = v; return chain; }),
      lte: jest.fn((col, v) => { estado.max = v; return chain; }),
      limit: jest.fn().mockImplementation(() => Promise.resolve({
        data: leads.filter((l) => (estado.min === null || l.reviews_count >= estado.min)
          && (estado.max === null || l.reviews_count <= estado.max)
          && (estado.nota === null || l.rating >= estado.nota)),
        error: null,
      })),
    };
    mockSupabaseAdmin.from.mockReturnValue(chain);
    return estado;
  }

  const casa = (name, reviews, rating = 4.6) => ({
    id: name, name, website: `https://x.com/${name}`, reviews_count: reviews, rating,
    whatsapp_phone: '+551133334444', enrich_status: {},
  });

  it('não gasta raspagem em shopping — fora da faixa de avaliações', async () => {
    bancoCom([
      casa('Shopping Iguatemi', 87000),
      casa('Morumbi Shopping', 62000),
      casa('Cantina do Zé', 340),
    ]);

    const fila = await selecionarSemCelular(8);
    const nomes = fila.map((l) => l.name);

    expect(nomes).toEqual(['Cantina do Zé']);
  });

  it('aplica o filtro de ICP — mercado e hortifruti na faixa também ficam fora', async () => {
    bancoCom([
      casa('Ayumi Supermercados', 584),
      casa('Nordeste Hortifruti', 572),
      casa('Panobianco Academia', 400),
      casa('Bar do Juca', 300),
    ]);

    const fila = await selecionarSemCelular(8);

    expect(fila.map((l) => l.name)).toEqual(['Bar do Juca']);
  });

  it('a faixa vem do mesmo lugar que o disparo usa', async () => {
    const estado = bancoCom([]);
    await selecionarSemCelular(8);
    const store = require('../_lib/prospecting/prospect-store');

    // Fonte única: se alguém mudar o piso no store, a caça acompanha sozinha.
    expect(estado.min).toBe(store.QUALIDADE_MIN_AVALIACOES);
    expect(estado.max).toBe(store.QUALIDADE_MAX_AVALIACOES);
    expect(estado.nota).toBe(store.QUALIDADE_MIN_NOTA);
  });
});

/**
 * DOIS LEITORES, O GRÁTIS PRIMEIRO — 03/09/2026.
 *
 * O defeito que estes testes travam custou 752 leads carimbados com zero
 * achados: o leitor pago (Scrapingdog) era dependência DURA, e como a chave
 * nunca chegou ao ambiente de produção, a caça não tentava NADA. "Não tentei"
 * ficava indistinguível de "tentei e o site não tinha".
 *
 * O que cada teste prova, em ordem de importância:
 *   1. sem chave a caça FUNCIONA (degrada para só-direto, não para nada);
 *   2. o pago não é chamado quando o grátis já achou — é dinheiro;
 *   3. `sem_html` continua significando "nenhum leitor abriu a página", que é
 *      a distinção que este arquivo inteiro existe para preservar.
 */
describe('caça ao celular — leitor direto primeiro, pago como fallback', () => {
  // wa.me é a fonte de maior confiança; serve de "achou" inequívoco.
  const HTML_COM_WA = '<a href="https://wa.me/5511998887777">WhatsApp</a>';
  const HTML_SEM_NUMERO = '<html><body>Bem-vindo ao restaurante</body></html>';

  test('SEM leitor pago, o direto sozinho acha e grava — o caso dos 752 leads', async () => {
    const cap = capturarUpdate();
    const direto = jest.fn().mockResolvedValue(HTML_COM_WA);

    const r = await cacarCelular(leadBase(), direto, undefined);

    expect(r.ok).toBe(true);
    expect(cap.patch.whatsapp_phone).toBe('+5511998887777');
    expect(direto).toHaveBeenCalledTimes(1);
  });

  test('o pago NÃO é chamado quando o direto já achou — cada chamada é crédito', async () => {
    capturarUpdate();
    const direto = jest.fn().mockResolvedValue(HTML_COM_WA);
    const pago = jest.fn().mockResolvedValue(HTML_COM_WA);

    await cacarCelular(leadBase(), direto, pago);

    expect(pago).not.toHaveBeenCalled();
  });

  test('o pago é chamado quando o direto abriu mas não tinha número', async () => {
    capturarUpdate();
    const direto = jest.fn().mockResolvedValue(HTML_SEM_NUMERO);
    const pago = jest.fn().mockResolvedValue(HTML_COM_WA);

    const r = await cacarCelular(leadBase(), direto, pago);

    expect(pago).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    expect(r.numero).toBe('+5511998887777');
  });

  test('o pago é chamado quando o direto ESTOUROU — anti-bot é o caso de uso dele', async () => {
    capturarUpdate();
    const direto = jest.fn().mockRejectedValue(new Error('HTTP 403'));
    const pago = jest.fn().mockResolvedValue(HTML_COM_WA);

    const r = await cacarCelular(leadBase(), direto, pago);

    expect(pago).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
  });

  test('direto abriu sem número e SEM pago → sem_numero, nunca sem_html', async () => {
    capturarUpdate();
    const direto = jest.fn().mockResolvedValue(HTML_SEM_NUMERO);

    const r = await cacarCelular(leadBase(), direto, undefined);

    // A distinção é o ponto: 'sem_numero' diz "a tática é fraca aqui",
    // 'sem_html' diz "o scrape está quebrado". Trocar uma pela outra manda
    // consertar a coisa errada.
    expect(r.motivo).toBe('sem_numero');
  });

  test('direto estourou mas o pago abriu sem número → sem_numero, não sem_html', async () => {
    capturarUpdate();
    const direto = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const pago = jest.fn().mockResolvedValue(HTML_SEM_NUMERO);

    const r = await cacarCelular(leadBase(), direto, pago);

    // ALGUM leitor abriu a página. Reportar 'sem_html' aqui culparia o scrape
    // por um site que de fato abriu e de fato não tinha WhatsApp.
    expect(r.motivo).toBe('sem_numero');
  });

  test('os dois estouraram → sem_html, que é o alarme de scrape morto', async () => {
    capturarUpdate();
    const direto = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const pago = jest.fn().mockRejectedValue(new Error('HTTP 402'));

    const r = await cacarCelular(leadBase(), direto, pago);

    expect(r.motivo).toBe('sem_html');
  });

  test('o lote repassa o leitor pago aos leads e conta o achado dele', async () => {
    // Mesma fila fake do describe de cima: dentro da faixa de qualidade e com
    // nome de casa de mesa, senão a mira derruba o lead antes do balde.
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      is: jest.fn().mockReturnThis(),
      not: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue({
        data: [{
          id: 'l1', name: 'Cantina 1', website: 'https://casa1.com.br',
          reviews_count: 300, rating: 4.6,
          whatsapp_phone: '+551133334444', enrich_status: {},
        }],
        error: null,
      }),
      update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }),
    };
    mockSupabaseAdmin.from.mockReturnValue(chain);

    const direto = jest.fn().mockResolvedValue(HTML_SEM_NUMERO);
    const pago = jest.fn().mockResolvedValue(HTML_COM_WA);

    const r = await cacarCelularPendentes({ lerPagina: direto, lerPaginaFallback: pago, limit: 1 });

    expect(pago).toHaveBeenCalledTimes(1);
    expect(r.achados).toBe(1);
  });
});
