'use strict';

/**
 * "O envio falhou — e daí?"
 *
 * Existe porque, até jul/2026, nenhum dos 7 `sendMessage` do processador
 * checava o retorno. `sendViaMeta` e `sendViaTwilio` **não lançam**: devolvem
 * `{ success: false, error }`. O resultado era o pior tipo de defeito — o
 * cliente não recebia nada, o histórico gravava a resposta do assistente como
 * se tivesse saído, e o restaurante ficava com uma conversa que parece completa
 * e um cliente que sumiu sem explicação.
 *
 * Classificar não é firula: a CATEGORIA muda o que a pessoa faz.
 *
 *   janela de 24h fechada → regra da Meta, não defeito. Precisa de template.
 *                           Alertar todo dia aqui treina o dono a ignorar
 *                           alerta — o mesmo erro do radar que contava teste
 *                           como cliente.
 *   token recusado        → o produto está fora do ar AGORA. Alerta.
 *   número sem WhatsApp   → problema do destinatário. Registra, não alerta.
 *   desconhecido          → alerta. Na dúvida, avisa: silêncio já custou caro.
 *
 * Puro: sem I/O. Quem loga e quem alerta é o chamador.
 */

const { redigir } = require('../integration-probes');

const CATEGORIAS = {
  JANELA_24H: 'janela_24h',
  CREDENCIAL: 'credencial',
  DESTINATARIO: 'destinatario',
  CONTA: 'conta',
  LIMITE: 'limite',
  CONFIGURACAO: 'configuracao',
  DESCONHECIDO: 'desconhecido',
};

/**
 * Códigos da Cloud API que a gente sabe interpretar. O que não estiver aqui cai
 * em DESCONHECIDO e alerta — preferimos ruído a mensagem perdida em silêncio.
 */
const POR_CODIGO = {
  131047: CATEGORIAS.JANELA_24H,   // Re-engagement: passou das 24h
  131026: CATEGORIAS.DESTINATARIO, // número não recebe (não tem WhatsApp)
  131051: CATEGORIAS.DESTINATARIO, // tipo de mensagem não suportado pelo destino
  190: CATEGORIAS.CREDENCIAL,      // token inválido/expirado
  131031: CATEGORIAS.CONTA,        // conta bloqueada/restrita
  133010: CATEGORIAS.CONTA,        // número não registrado
  80007: CATEGORIAS.LIMITE,        // limite de chamadas
  131048: CATEGORIAS.LIMITE,       // limite de spam/qualidade
};

/** Quando não veio código, o texto do fornecedor ainda diz muita coisa. */
const POR_TEXTO = [
  [/re-?engagement|24\s*hour|outside the (allowed )?window/i, CATEGORIAS.JANELA_24H],
  [/access token|oauth|session (has )?expired|validating access/i, CATEGORIAS.CREDENCIAL],
  [/not configured|missing (credential|env|token)/i, CATEGORIAS.CONFIGURACAO],
  [/undeliverable|not a valid whatsapp|recipient/i, CATEGORIAS.DESTINATARIO],
  [/rate limit|too many requests|throttl/i, CATEGORIAS.LIMITE],
];

/**
 * Categorias que NÃO acordam ninguém.
 *
 * As duas são estados normais de operação, não incidentes: cliente que sumiu
 * há mais de um dia, e número que não tem WhatsApp. Configuração também fica de
 * fora porque a sonda de integrações já cobre isso melhor, no lugar certo.
 */
const SILENCIOSAS = new Set([
  CATEGORIAS.JANELA_24H,
  CATEGORIAS.DESTINATARIO,
  CATEGORIAS.CONFIGURACAO,
]);

const ACOES = {
  [CATEGORIAS.JANELA_24H]: 'passou das 24h desde a última mensagem do cliente — só template aprovado entrega agora',
  [CATEGORIAS.CREDENCIAL]: 'token da Meta recusado — renovar WHATSAPP_ACCESS_TOKEN, o WhatsApp está fora do ar',
  [CATEGORIAS.DESTINATARIO]: 'o número do cliente não recebe WhatsApp',
  [CATEGORIAS.CONTA]: 'a conta/número está restrito pela Meta — verificar no Business Manager',
  [CATEGORIAS.LIMITE]: 'limite de envio atingido — mensagens estão sendo descartadas',
  [CATEGORIAS.CONFIGURACAO]: 'credencial de WhatsApp ausente no ambiente',
  [CATEGORIAS.DESCONHECIDO]: 'falha não catalogada — ver o erro cru do fornecedor',
};

function classificar(codigo, texto) {
  if (codigo != null && POR_CODIGO[codigo]) return POR_CODIGO[codigo];
  for (const [re, cat] of POR_TEXTO) if (re.test(texto)) return cat;
  return CATEGORIAS.DESCONHECIDO;
}

/**
 * @param {{success?: boolean, error?: string, code?: number}} resultado
 *        o que o sender devolveu. `null`/`undefined`/formato errado contam como
 *        FALHA — um adapter que esqueça de retornar não pode passar por
 *        "entregue".
 * @returns {{entregue: boolean, categoria: string|null, alertavel: boolean,
 *            acao: string|null, resumo: string|null}}
 *          `resumo` é uma linha pronta pra log, já sem segredo, marcada com
 *          [SEND_FAIL] pra ser encontrada por grep e por alerta.
 */
function avaliarEnvio(resultado) {
  const r = (resultado && typeof resultado === 'object') ? resultado : {};

  if (r.success === true) {
    return { entregue: true, categoria: null, alertavel: false, acao: null, resumo: null };
  }

  const texto = String(r.error || '');
  const categoria = classificar(r.code, texto);
  const alertavel = !SILENCIOSAS.has(categoria);
  const acao = ACOES[categoria];

  // redigir(): a Meta às vezes devolve o token dentro da mensagem de erro, e
  // esta linha vai pro log — que é lido, colado em chat e mandado em ticket.
  const detalhe = redigir(texto) || 'sem detalhe do fornecedor';
  const cod = r.code != null ? ` code=${r.code}` : '';

  return {
    entregue: false,
    categoria,
    alertavel,
    acao,
    resumo: `[SEND_FAIL] categoria=${categoria}${cod} — ${acao}. Fornecedor: ${detalhe}`,
  };
}

module.exports = { CATEGORIAS, avaliarEnvio };
