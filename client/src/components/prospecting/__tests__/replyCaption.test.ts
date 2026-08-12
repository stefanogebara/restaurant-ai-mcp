import { describe, it, expect } from 'vitest';
import { replyCaption } from '../../../pages/OlimpiaOps';

/**
 * A legenda das respostas.
 *
 * POR QUE (12/08/2026). O painel dizia "45 respostas · 65,2% — acima do
 * baseline genérico (2%)", que se lê como triunfo. Medido na base inteira: de
 * 350 leads que "responderam", 168 (48%) nunca tiveram uma palavra digitada por
 * gente — é o WhatsApp Business da casa respondendo sozinho.
 *
 * Comparar autoresponder com o baseline de cold outreach é elogio inventado, e
 * um KPI que elogia esconde o estado real. Estes testes travam que a taxa saia
 * sobre GENTE sempre que dá pra saber.
 */
describe('replyCaption', () => {
  it('calcula a taxa sobre as respostas HUMANAS, não sobre o total', () => {
    // 100 enviadas, 45 respostas, das quais 20 humanas → 20%, não 45%.
    expect(replyCaption(100, 45, 20)).toContain('20% de gente');
    expect(replyCaption(100, 45, 20)).not.toContain('45%');
  });

  it('mostra quantas foram de robô, para o número não parecer uma queda', () => {
    expect(replyCaption(100, 45, 20)).toContain('25 de robô');
  });

  it('sem robô nenhum, não polui a legenda', () => {
    expect(replyCaption(100, 20, 20)).not.toContain('de robô');
  });

  it('quando o recorte falha (null), cai no total em vez de sumir', () => {
    // Degradar para o número antigo é melhor que legenda vazia: o operador
    // continua vendo alguma coisa.
    const c = replyCaption(100, 45, null);
    expect(c).toContain('45%');
    expect(c).not.toContain('de robô');
  });

  it('classifica contra o baseline genérico de 2% usando a taxa humana', () => {
    expect(replyCaption(100, 90, 10)).toContain('acima do baseline');   // 10%
    expect(replyCaption(100, 90, 3)).toContain('no baseline');          // 3%
    expect(replyCaption(100, 90, 1)).not.toContain('baseline');         // 1%
  });

  it('sem envios não inventa legenda', () => {
    expect(replyCaption(0, 0, 0)).toBeUndefined();
  });
});
