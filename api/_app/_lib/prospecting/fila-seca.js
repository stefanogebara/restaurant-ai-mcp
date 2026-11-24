'use strict';

/**
 * A fila de intro secou e ninguém foi avisado — camada pura.
 *
 * MEDIDO EM 13/09/2026, e é por isto que este arquivo existe. Aplicando TODOS
 * os filtros que o dispatch aplica de verdade (prospect_state 'aguardando',
 * whatsapp_status pending/found, máscara de celular, piso 120 / teto 5000 de
 * avaliações, nota >= 4.3, fora-do-ICP, número já abordado por outra unidade
 * da rede), a fila de candidatos dispensáveis estava em **2 leads**. Dois.
 *
 * O teto diário de warm-up é 100. A prospecção não estava sendo segurada por
 * teto, por janela, por disjuntor nem por bug: não havia mais a quem escrever.
 *
 * E o silêncio disso é perfeito. Cada execução do cron de dispatch terminava
 * com `{ candidates: 0, sent: 0 }` e HTTP 200 — o mesmo 200 de um dia em que
 * não havia nada a fazer. O vigia de cron via o job rodando na hora certa. O
 * `cron_config` estava ligado. Nada em lugar nenhum dizia "acabou".
 *
 * POR QUE A FILA SECOU: a base inteira (4688 leads) foi raspada num surto de
 * três semanas em julho/2026 e NUNCA MAIS. Zero leads novos em 30 dias. O
 * `prospect-discovery-worker` existe, funciona e se auto-encadeia, mas é
 * disparado à mão pelo console — quer dizer, a única fonte de suprimento
 * depende de alguém lembrar. É exatamente o defeito que o cron de dispatch
 * consertou no disparo em 05/08 ("dente de serra é gente lembrando, não
 * máquina rodando"), um degrau acima na esteira.
 *
 * ESTE ARQUIVO NÃO CONSERTA O SUPRIMENTO. Conserta o silêncio: faz a fila
 * vazia virar um alerta que chega no celular do fundador junto com o resto da
 * saúde diária. Reabastecer é decisão de quem paga a conta do Places.
 *
 * ONDE ISTO É CHAMADO: `api/_crons/health-alert.js`, o alerta diário que já
 * existe para cron parado e integração fora do ar. Fila seca é a mesma classe
 * de problema — operação parada sem ninguém saber — e entra pelo mesmo canal.
 * Sem cron novo, sem invocação nova, sem segundo lugar para configurar número.
 *
 * PURO: sem I/O. Quem conta a fila é o cron (chamando o MESMO
 * `selectIntroCandidates` que o dispatch usa, para não existir uma segunda
 * cópia da regra de elegibilidade); quem julga é aqui.
 */

/**
 * Abaixo disto a fila é considerada seca.
 *
 * NÃO é o teto diário (100). É menos, de propósito: o alerta precisa ser
 * inequívoco. A fila saudável tinha milhares; a fila quebrada tinha 2. Um
 * limiar de 40 separa os dois casos com margem enorme e não dispara por
 * flutuação — e 40 ainda é menos de um dia de teto, então quando ele dispara
 * a frase "não dá para encher nem um dia" é literalmente verdadeira.
 */
const PISO_DA_FILA = Number(process.env.PROSPECTING_FILA_MINIMA) || 40;

/**
 * PURA. Julga o suprimento de leads a partir de quantos candidatos
 * QUALIFICADOS o seletor conseguiu devolver.
 *
 * `disponiveis` deve vir de `selectIntroCandidates(piso)` — o mesmo caminho do
 * dispatch, já com ICP, dedup e guarda de rede aplicados. Contar por SQL solto
 * aqui daria um número maior e mais otimista que o real: no dia da medição o
 * SQL cru dizia 18 e o caminho de verdade entregava 2.
 *
 * `erroNaContagem` existe porque `selectIntroCandidates` devolve [] tanto para
 * "não há ninguém" quanto para "a guarda de rede falhou e o lote foi descartado
 * de propósito". Os dois merecem alerta, mas dizem coisas opostas ao leitor, e
 * um alerta que mente sobre a causa manda o fundador procurar no lugar errado.
 *
 * @param {{disponiveis:number, piso?:number, capDiario?:number|null, erroNaContagem?:boolean}} args
 * @returns {{seco:boolean, disponiveis:number, piso:number, diasDeFolga:number|null, causa:string}}
 */
function avaliarSuprimento({ disponiveis, piso = PISO_DA_FILA, capDiario = null, erroNaContagem = false } = {}) {
  const n = Number.isFinite(disponiveis) ? Math.max(0, Math.trunc(disponiveis)) : 0;
  const limite = Number.isFinite(piso) && piso > 0 ? Math.trunc(piso) : PISO_DA_FILA;
  const cap = Number.isFinite(capDiario) && capDiario > 0 ? Math.trunc(capDiario) : null;

  return {
    seco: erroNaContagem || n < limite,
    disponiveis: n,
    piso: limite,
    // Quantos dias de disparo a fila ainda aguenta. Só faz sentido com o teto
    // conhecido; sem ele o alerta fala em número absoluto e não inventa prazo.
    diasDeFolga: cap ? Math.floor(n / cap) : null,
    causa: erroNaContagem ? 'contagem_falhou' : 'fila_abaixo_do_piso',
  };
}

/**
 * PURA. As linhas do alerta, no formato do health-alert (WhatsApp, negrito com
 * asterisco). Devolve [] quando não há o que dizer, para o chamador poder
 * concatenar sem condicional.
 *
 * O texto diz O QUE FAZER. Um alerta que só informa "fila vazia" devolve ao
 * leitor o trabalho de lembrar que existe um worker de descoberta — e a última
 * vez que alguém lembrou foi há sete semanas.
 */
function linhasDoAlerta(estado) {
  if (!estado || !estado.seco) return [];

  if (estado.causa === 'contagem_falhou') {
    return ['', '*Fila de prospecção: não deu para contar*',
      '  - a seleção de candidatos falhou (guarda de rede ou banco).',
      '  - o dispatch pode estar parado sem aparecer aqui. Ver log de selectIntroCandidates.'];
  }

  const linhas = ['', '*Fila de prospecção seca*',
    `  - ${estado.disponiveis} lead(s) despacháveis (piso do alerta: ${estado.piso}).`];
  if (estado.diasDeFolga !== null) {
    linhas.push(`  - dá para ~${estado.diasDeFolga} dia(s) de teto diário.`);
  }
  linhas.push('  - o dispatch segue rodando e mandando 0: não é bug, é falta de lead.',
    '  - reabastecer: console de prospecção → discovery-job (território novo).');
  return linhas;
}

module.exports = { avaliarSuprimento, linhasDoAlerta, PISO_DA_FILA };
