'use strict';

/**
 * Tira travessão e meia-risca do texto que a Olímpia manda.
 *
 * POR QUE: no teclado do celular não existe tecla de travessão. Ninguém digita
 * "fundador do Racha — o pagar a conta" numa conversa de WhatsApp. Quem recebe
 * não lê elegância, lê máquina — e o pitch morre na primeira linha.
 *
 * ONDE: no sendReply, que é o único ponto por onde passa todo texto livre da
 * agente. A maior parte das frases nasce do modelo em tempo de execução, então
 * limpar só as strings do código deixaria o buraco aberto justamente onde o
 * travessão mais aparece. O texto limpo é também o que fica gravado no
 * histórico, então o próprio prompt para de ensinar o vício de volta.
 *
 * O QUE NÃO É TOCADO: o hífen (-). Ele é pontuação legítima de telefone
 * ("97711-7070"), palavra composta ("auto-atendimento") e URL. Trocar hífen
 * quebraria o número que o lead precisa discar — o oposto do objetivo.
 */

/** Travessão (—) e meia-risca (–). O hífen comum fica de fora de propósito. */
const TRACO_LONGO = /[—–]/;

/**
 * PURA: devolve o texto sem travessão, com pontuação natural no lugar.
 *
 * @param {string|null|undefined} texto
 * @returns {string} '' quando a entrada é vazia/nula
 */
function semTravessao(texto) {
  if (texto === null || texto === undefined) return '';
  let s = String(texto);
  // Atalho: a esmagadora maioria das mensagens não tem travessão nenhum, e
  // devolver a mesma string garante que nada mais no texto seja mexido.
  if (!TRACO_LONGO.test(s)) return s;

  // 1. Travessão de diálogo abrindo linha: só sai.
  s = s.replace(/^[ \t]*[—–][ \t]*/gm, '');

  // 2. Logo depois de pontuação, a pausa já está marcada — o travessão vira
  //    ruído duplicado ("beleza! — te mando" nunca vira "beleza!, te mando").
  s = s.replace(/([,.!?;:])[ \t]*[—–][ \t]*/g, '$1 ');

  // 3. O resto é pausa de fala: vírgula é como a pessoa escreveria.
  s = s.replace(/[ \t]*[—–][ \t]*/g, ', ');

  // 4. Arremate: nunca espaço antes da vírgula, nunca vírgula dobrada, nunca
  //    espaço duplo. \n não entra nas classes acima porque a quebra de
  //    parágrafo é o que o multipart usa para separar bolhas.
  s = s.replace(/[ \t]+,/g, ',')
    .replace(/,[ \t]*,/g, ',')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]*,[ \t]*$/gm, '');

  return s;
}

module.exports = { semTravessao };
