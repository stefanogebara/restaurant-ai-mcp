'use strict';

/**
 * UMA REDE, UMA INTRO — conserto de 03/09/2026.
 *
 * `qualificar()` já colapsava telefone repetido, mas só DENTRO do lote. Entre
 * rodadas, as outras unidades da mesma rede seguiam com `whatsapp_sent_at`
 * null e voltavam a ser elegíveis. Medido em produção:
 *
 *     +5511946310342 (Mania de Churrasco) ..... 7 intros, 06/07 a 06/08
 *     outros oito números ..................... 2+ intros cada
 *
 * Do lado de quem recebe, são sete mensagens frias da mesma empresa no mesmo
 * WhatsApp. Custa reputação na Meta e queima um número que já tinha decidido
 * não responder.
 *
 * Ficou urgente agora porque a caça ao celular voltou a achar número (#138) e
 * rede com site único e WhatsApp central é comum: o Bráz Pizzaria e o Câmara
 * Fria publicam o MESMO celular, cada um com o texto do link personalizado
 * para a sua casa.
 */

jest.mock('../_lib/secure-logger', () => ({
  createSecureLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

let mockLote;      // o que o seletor principal devolve
let mockJaFalados; // o que a guarda devolve
let mockErroGuarda;

/**
 * Duas consultas saem de `from('prospect_leads')`: a do seletor, que termina em
 * `.limit()`, e a da guarda, que é aguardada direto no fim do encadeamento. O
 * mock precisa servir as duas — por isso a cadeia é "thenable".
 */
function mockCriarCadeia() {
  const q = {
    select: () => q,
    eq: () => q,
    is: () => q,
    not: () => q,
    in: () => q,
    or: () => q,
    gte: () => q,
    lte: () => q,
    order: () => q,
    limit: async () => ({ data: mockLote, error: null }),
    // A guarda faz `await ...not(...)` sem `.limit()`.
    then: (res) => res(mockErroGuarda
      ? { data: null, error: { message: mockErroGuarda } }
      : { data: mockJaFalados, error: null }),
  };
  return q;
}

jest.mock('../_lib/supabase', () => ({
  supabaseAdmin: { from: () => mockCriarCadeia() },
}));

const { selectIntroCandidates } = require('../_lib/prospecting/prospect-store');

/** Lead elegível: celular válido, dentro da faixa de qualidade, nome de casa. */
const casa = (nome, telefone) => ({
  id: nome, name: nome, whatsapp_phone: telefone,
  whatsapp_status: 'pending', reviews_count: 300, rating: 4.6,
  google_place_id: `place-${nome}`,
});

beforeEach(() => { mockErroGuarda = null; mockJaFalados = []; });

describe('selectIntroCandidates — número já abordado por outra unidade da rede', () => {
  it('descarta a unidade cujo número já recebeu intro por um irmão', async () => {
    mockLote = [casa('Sukiya Butantã', '+5511976580784')];
    mockJaFalados = [{ whatsapp_phone: '+5511976580784' }]; // Sukiya Barra Funda já foi

    expect(await selectIntroCandidates(10)).toEqual([]);
  });

  it('deixa passar quem nunca foi abordado', async () => {
    mockLote = [casa('Bar do Zé', '+5511987654321')];
    mockJaFalados = [];

    const r = await selectIntroCandidates(10);
    expect(r.map((l) => l.name)).toEqual(['Bar do Zé']);
  });

  it('cruza as duas grafias: gravado com + colide com gravado sem +', async () => {
    // O mesmo número aparece nas duas formas conforme a origem do dado. Sem a
    // normalização por dígitos, a guarda não pegaria nada justamente na rede
    // importada por outro caminho.
    mockLote = [casa('Habib\'s Tucuruvi', '+5511946310342')];
    mockJaFalados = [{ whatsapp_phone: '5511946310342' }];

    expect(await selectIntroCandidates(10)).toEqual([]);
  });

  it('FALHA FECHADA: erro de leitura descarta o lote em vez de arriscar repetir', async () => {
    // Ao contrário do `isOptedOut`, que falha aberto. Lá o pior caso é uma
    // mensagem a mais; aqui é repetir a intro numa rede inteira, e o custo de
    // fechar é só o lote esperar a próxima rodada.
    mockLote = [casa('Bar do Zé', '+5511987654321')];
    mockErroGuarda = 'connection reset';

    expect(await selectIntroCandidates(10)).toEqual([]);
  });

  it('só a unidade nova da rede passa quando nenhuma foi abordada ainda', async () => {
    // Duas casas, MESMO número, nenhuma abordada: a dedup de lote (qualificar)
    // continua valendo e entrega uma só — não duas.
    mockLote = [casa('Bráz Pinheiros', '+5511943643170'), casa('Câmara Fria', '+5511943643170')];
    mockJaFalados = [];

    expect(await selectIntroCandidates(10)).toHaveLength(1);
  });
});
