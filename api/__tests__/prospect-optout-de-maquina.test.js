'use strict';

/**
 * Robô nunca recusa. Só gente recusa.
 *
 * ACHADO DO EVAL-003 (03/08, corpus pós-conserto): em 3 de 4 threads o
 * interlocutor era 100% autoatendimento e a conversa terminou em estado errado.
 * O pior caso foi o ESPETO DO LELECO: a URA ENTREGOU o WhatsApp do decisor
 * ("envie sua proposta diretamente para o WhatsApp do negócio") e a Olímpia
 * respondeu marcando OPTOUT. Perdemos o lead no exato momento em que ele se
 * abriu. O Banzeiro virou 'recusou' sem nenhum humano ter dito não.
 *
 * O bloco INTERLOCUTOR já proibia VENDER para máquina, mas não proibia
 * ENCERRAR por causa dela.
 *
 * POR QUE `semHumanoNaThread` E NÃO `ecoDeMaquina`:
 * ecoDeMaquina olha só o último inbound e pegaria mais casos — inclusive um
 * humano que recusou e depois teve um autoresponder disparado por cima. Optout
 * é registro de LGPD e é irreversível pela tela: ignorar uma recusa REAL é pior
 * que deixar um lead-robô aberto mais tempo. Então a trava só age quando NINGUÉM
 * humano falou na thread — aí não existe recusa possível, por definição.
 */

const { semHumanoNaThread } = require('../_lib/prospecting/prospect-state');
const { optoutIndevido } = require('../_lib/prospecting/prospect-state');

const saudacaoURA = 'Atendente Virtual: Olá! Seja bem-vindo. Para te ajudar melhor, escolha uma opção do menu abaixo.';
const uraComContato = 'Além disso, você pode enviar sua proposta diretamente para o WhatsApp do negócio: +55 11 94991-2248';
const out = (t) => ({ direcao: 'out', tipo: 'texto', corpo: t });
const inb = (t) => ({ direcao: 'in', tipo: 'texto', corpo: t });

describe('optout vindo de máquina é indevido', () => {
  test('o caso ESPETO DO LELECO: URA entrega o contato e vira optout', () => {
    const historico = [out('Oi! Sou a Olímpia...'), inb(saudacaoURA), out('...'), inb(uraComContato)];
    expect(optoutIndevido(historico)).toBe(true);
  });

  test('o caso Banzeiro: thread só de autoatendimento', () => {
    const historico = [out('Oi!'), inb(saudacaoURA), out('...'), inb(saudacaoURA)];
    expect(optoutIndevido(historico)).toBe(true);
  });
});

describe('recusa de HUMANO continua valendo — isto é LGPD', () => {
  test('humano pediu para parar: optout é legítimo', () => {
    const historico = [out('Oi!'), inb('não quero receber mais nada, obrigado')];
    expect(optoutIndevido(historico)).toBe(false);
  });

  test('humano falou em qualquer momento da thread, ainda que antes do robô', () => {
    // Deliberadamente NÃO usamos ecoDeMaquina aqui: se um humano recusou e um
    // autoresponder disparou depois, a recusa continua sendo dele. Ignorá-la
    // seria pior que o problema que estamos consertando.
    const historico = [inb('me tira da lista'), out('ok'), inb(saudacaoURA)];
    expect(optoutIndevido(historico)).toBe(false);
  });

  test('thread sem inbound nenhum não é "só máquina" — é silêncio', () => {
    expect(optoutIndevido([out('Oi!'), out('...')])).toBe(false);
  });

  test('entradas degeneradas não travam optout por acidente', () => {
    expect(optoutIndevido(null)).toBe(false);
    expect(optoutIndevido([])).toBe(false);
  });
});

describe('entregar contato NUNCA é recusar', () => {
  /**
   * Esta regra existe porque a primeira versão de optoutIndevido tinha SÓ o
   * critério de "ninguém humano falou" — e o teste do Leleco falhou. A frase da
   * URA que entrega o número é corrida, não parece menu, então
   * semHumanoNaThread devolve false. O sinal certo era outro: quem passa o
   * contato do decisor está ABRINDO a porta.
   */
  test('humano que passa o contato do responsável não está recusando', () => {
    const historico = [out('quem cuida das reservas?'), inb('pode falar com o gerente no 11 97321-0441')];
    expect(semHumanoNaThread(historico)).toBe(false);  // é gente
    expect(optoutIndevido(historico)).toBe(true);      // mas não é recusa
  });

  test('humano que recusa SEM dar contato continua sendo recusa válida', () => {
    const historico = [out('oi'), inb('não temos interesse, obrigado')];
    expect(optoutIndevido(historico)).toBe(false);
  });

  test('número sem contexto de contato não conta como entrega', () => {
    const historico = [out('oi'), inb('somos 11 97321-0441 funcionários, e não temos interesse')];
    expect(optoutIndevido(historico)).toBe(false);
  });
});
