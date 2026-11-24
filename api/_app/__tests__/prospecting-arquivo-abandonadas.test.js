'use strict';

/**
 * Arquivamento automático de conversa abandonada.
 *
 * ORIGEM (12/08/2026): 27 conversas com a última palavra do LEAD, entre 28 e 37
 * dias sem resposta nossa. Fora da janela de 24h da Meta o texto livre não é
 * entregue, então elas nunca mais seriam respondidas por caminho nenhum — mas
 * seguiam em estado ativo, mantendo o alerta de "esperando resposta" vermelho
 * para sempre e escondendo a única casa que dava pra responder na hora.
 *
 * Esta é a ÚNICA rotina do sistema que muta lead sozinha por decurso de prazo.
 * O erro caro não é deixar de arquivar — é arquivar conversa viva. Por isso a
 * maior parte deste arquivo testa o que NÃO deve ser arquivado.
 */

const { elegivelParaArquivar, ARQUIVO_DIAS_PADRAO } = require('../_lib/prospecting/prospect-state');

const AGORA = Date.parse('2026-08-12T12:00:00.000Z');
const DIA = 24 * 60 * 60 * 1000;
const emDias = (n) => AGORA - n * DIA;
const base = { state: 'conversando', ultimaDirecao: 'in', nowMs: AGORA };

describe('o caso que motivou: lead falou por último e sumimos', () => {
  test('37 dias, estado ativo, nada agendado → arquiva', () => {
    const r = elegivelParaArquivar({ ...base, ultimaMs: emDias(37) });
    expect(r).toEqual({ arquivar: true, motivo: 'abandonada_fora_da_janela' });
  });

  test('o padrão são 30 dias', () => {
    expect(ARQUIVO_DIAS_PADRAO).toBe(30);
    expect(elegivelParaArquivar({ ...base, ultimaMs: emDias(31) }).arquivar).toBe(true);
    expect(elegivelParaArquivar({ ...base, ultimaMs: emDias(29) }).arquivar).toBe(false);
  });

  test('vale para os três estados ativos', () => {
    for (const state of ['aguardando', 'conversando', 'agendando']) {
      expect(elegivelParaArquivar({ ...base, state, ultimaMs: emDias(40) }).arquivar).toBe(true);
    }
  });
});

describe('O QUE NUNCA PODE SER ARQUIVADO', () => {
  test('nós falamos por último: o silêncio é DELE, não abandono nosso', () => {
    // Este é o caso do resgate/reengage, que tem tetos próprios. Arquivar aqui
    // mataria o follow-up normal de todo lead que não respondeu em 30 dias.
    const r = elegivelParaArquivar({ ...base, ultimaDirecao: 'out', ultimaMs: emDias(40) });
    expect(r).toEqual({ arquivar: false, motivo: 'nos_falamos_por_ultimo' });
  });

  test('handoff não é do cron: o fundador assumiu', () => {
    expect(elegivelParaArquivar({ ...base, state: 'handoff', ultimaMs: emDias(60) }).motivo)
      .toBe('estado_nao_ativo');
  });

  test('ganho (cliente fechado) jamais é tocado', () => {
    expect(elegivelParaArquivar({ ...base, state: 'ganho', ultimaMs: emDias(90) }).arquivar).toBe(false);
  });

  test('optout continua terminal, não vira pausada', () => {
    expect(elegivelParaArquivar({ ...base, state: 'optout', ultimaMs: emDias(90) }).arquivar).toBe(false);
  });

  test('resposta já enfileirada → o flush vai responder, não arquive', () => {
    const r = elegivelParaArquivar({ ...base, ultimaMs: emDias(40), replyApos: '2026-08-12T13:00:00Z' });
    expect(r).toEqual({ arquivar: false, motivo: 'resposta_enfileirada' });
  });

  test('retorno datado no futuro → alguém prometeu chamar de volta', () => {
    const r = elegivelParaArquivar({ ...base, ultimaMs: emDias(40), retornoEm: '2026-08-20T10:00:00Z' });
    expect(r.motivo).toBe('retorno_datado');
  });

  test('em soneca → o operador adiou de propósito', () => {
    const r = elegivelParaArquivar({ ...base, ultimaMs: emDias(40), snoozedUntil: '2026-09-01T10:00:00Z' });
    expect(r.motivo).toBe('em_soneca');
  });

  test('reunião marcada no futuro → conversa VIVA, ainda que velha', () => {
    const r = elegivelParaArquivar({ ...base, ultimaMs: emDias(40), reuniaoAt: '2026-08-15T14:00:00Z' });
    expect(r.motivo).toBe('reuniao_marcada');
  });

  test('compromisso VENCIDO não protege para sempre', () => {
    // Um retorno prometido para 6 meses atrás e nunca cumprido não pode manter
    // a conversa viva eternamente — senão o buraco volta por outra porta.
    const r = elegivelParaArquivar({ ...base, ultimaMs: emDias(40), retornoEm: '2026-02-01T10:00:00Z' });
    expect(r.arquivar).toBe(true);
  });

  test('sem instante da última mensagem, não arrisca', () => {
    expect(elegivelParaArquivar({ ...base, ultimaMs: NaN }).motivo).toBe('sem_instante');
    expect(elegivelParaArquivar({ ...base, ultimaMs: undefined }).motivo).toBe('sem_instante');
  });

  test('chamada sem argumento nenhum não arquiva', () => {
    expect(elegivelParaArquivar().arquivar).toBe(false);
    expect(elegivelParaArquivar({}).arquivar).toBe(false);
  });
});

describe('o limite é configurável por chamada', () => {
  test('dias custom manda no corte', () => {
    expect(elegivelParaArquivar({ ...base, ultimaMs: emDias(10), dias: 7 }).arquivar).toBe(true);
    expect(elegivelParaArquivar({ ...base, ultimaMs: emDias(10), dias: 60 }).arquivar).toBe(false);
  });
});

// ------------------------------------------------ o defeito que o dry-run achou
/**
 * FOME DA VARREDURA (achado rodando `?dry=1` em produção, 12/08/2026).
 *
 * A primeira versão lia 50 candidatos ordenados por last_in_at ASC e decidia um
 * a um com um loadHistory por lead. O dry-run devolveu "candidatos: 50,
 * arquivadas: 0" — e o 50 cravado no teto era o sintoma.
 *
 * Leads antigos que JÁ foram respondidos nunca mudam de estado, então ocupariam
 * as mesmas 50 vagas todo dia, para sempre. Uma conversa de fato abandonada,
 * com last_in_at um pouco mais novo, jamais chegaria a ser avaliada: a
 * varredura rodaria diariamente, sem erro e sem log, arquivando nada.
 *
 * O teste abaixo é sobre a REGRA que sustenta a correção em lote: quem falou
 * por último se decide comparando a última saída com o último inbound, sem
 * consultar a thread lead a lead.
 */
describe('quem falou por último, decidido em lote', () => {
  const decidir = ({ entradaDias, saidaDias }) => elegivelParaArquivar({
    state: 'conversando',
    ultimaDirecao: saidaDias !== null && emDias(saidaDias) > emDias(entradaDias) ? 'out' : 'in',
    ultimaMs: emDias(entradaDias),
    nowMs: AGORA,
  });

  test('saída DEPOIS da entrada → respondemos, não arquiva', () => {
    // lead falou há 40 dias, nós respondemos há 39 → conversa atendida
    expect(decidir({ entradaDias: 40, saidaDias: 39 }).motivo).toBe('nos_falamos_por_ultimo');
  });

  test('saída ANTES da entrada → ele falou por último, arquiva', () => {
    // nós falamos há 41 dias, ele respondeu há 40 e sumimos
    expect(decidir({ entradaDias: 40, saidaDias: 41 }).arquivar).toBe(true);
  });

  test('nunca respondemos nada → ele falou por último', () => {
    expect(decidir({ entradaDias: 40, saidaDias: null }).arquivar).toBe(true);
  });

  test('respondemos no MESMO instante não conta como depois', () => {
    // Empate é o caso duvidoso; tratar como "nós falamos depois" arquivaria uma
    // conversa que talvez tenha sido respondida. Empate NÃO é depois.
    expect(decidir({ entradaDias: 40, saidaDias: 40 }).arquivar).toBe(true);
  });
});
