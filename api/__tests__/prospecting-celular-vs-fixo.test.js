'use strict';

/**
 * WhatsApp não existe em telefone FIXO — mandar template para um é queimar
 * mensagem e reputação do número.
 *
 * INCIDENTE (01/08/2026): um lote de 5 intros falhou 5/5 com o erro 131026 da
 * Meta ("Message undeliverable"). Não foi azar: `selectIntroCandidates` ordena
 * por `reviews_count DESC`, e restaurante grande publica o FIXO do salão no
 * Google Maps. Medido em produção no mesmo dia:
 *
 *     top 10 da fila de disparo ... 100% fixo
 *     pool elegível inteiro ....... 82% fixo (819 de 1000)
 *
 * Ou seja, a ordenação por porte seleciona justamente os menos alcançáveis. O
 * sistema só descobria isso DEPOIS de gastar o envio (o recibo 131026 marca
 * `whatsapp_status='missing'` e o lead sai do pool). Como o formato brasileiro
 * distingue celular de fixo de forma determinística, dá para saber antes e de
 * graça: celular tem 9 dígitos após o DDD e começa com 9; fixo tem 8.
 *
 * Nota de escopo: isto responde "esta linha PODE ter WhatsApp?", não "tem".
 * Um celular sem WhatsApp instalado ainda falha — e continua sendo tratado
 * pelo caminho do recibo, que segue necessário.
 */

const { ehCelularBr } = require('../_lib/prospecting/prospect-extract');

describe('ehCelularBr — celular pode ter WhatsApp, fixo nunca', () => {
  test('os 5 números reais que falharam com 131026 são reconhecidos como fixo', () => {
    // Fixtures do incidente, na forma em que estão gravados no banco.
    const queimados = [
      '+551120683000', // Nico Pasta & Basta
      '+551126144672', // Tojiro Sushi Zona Norte
      '+551136751193', // Manihi Sushi Perdizes
      '+551134764650', // Si Señor! Moema
      '+551123862462', // Kenichi Sushi Mooca
    ];
    for (const n of queimados) expect(ehCelularBr(n)).toBe(false);
  });

  test('celular E.164 é aceito', () => {
    expect(ehCelularBr('+5511987654321')).toBe(true);
    expect(ehCelularBr('+5521991234567')).toBe(true);
  });

  test('aceita sem o + e com máscara — o formato de origem varia', () => {
    expect(ehCelularBr('5511987654321')).toBe(true);
    expect(ehCelularBr('+55 (11) 98765-4321')).toBe(true);
    expect(ehCelularBr('55 11 3476-4650')).toBe(false);
  });

  test('DDD inexistente é rejeitado mesmo com 9 dígitos', () => {
    // 20 não é DDD brasileiro. Sem esta checagem, lixo com o comprimento certo
    // entraria na fila e falharia no envio do mesmo jeito.
    expect(ehCelularBr('+5520987654321')).toBe(false);
  });

  test('nono dígito obrigatório: 9 dígitos que não começam com 9 não é celular', () => {
    expect(ehCelularBr('+5511387654321')).toBe(false);
  });

  test('entrada vazia/nula é false, não exceção', () => {
    // Roda dentro do seletor de disparo: uma exceção aqui derrubaria o lote.
    for (const v of [null, undefined, '', '   ', 'sem numero', 12345]) {
      expect(ehCelularBr(v)).toBe(false);
    }
  });

  test('número internacional não-BR é false', () => {
    expect(ehCelularBr('+13475551234')).toBe(false);
  });
});
