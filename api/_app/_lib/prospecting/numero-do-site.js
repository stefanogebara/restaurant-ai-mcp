'use strict';

/**
 * Celular publicado no SITE da casa, para leads cujo telefone é fixo.
 *
 * PROBLEMA: 2675 leads (57% do pool) têm fixo. Fixo quase nunca está no
 * WhatsApp — dos 9 que receberam tentativa de envio, 8 voltaram `missing`.
 * São inalcançáveis pela agente, e o site é onde a casa publica o número que
 * ela realmente atende.
 *
 * MEDIÇÃO (03/08/2026, 30 leads fixos com site): 21% dos sites que abrem trazem
 * um celular, e os 5 acertos vieram TODOS de `href` — nenhum do texto visível.
 * Daí a decisão de desenho: este módulo lê LINK, não prosa.
 *
 * A ARMADILHA: regex de telefone no HTML cru casa lixo de bundle minificado.
 * Uma única página (L'Entrecote de Paris) produziu 115 "celulares" falsos como
 * 84981350859 e 14946994036. Por isso só vale número dentro de um link
 * reconhecido; dígito solto no meio do documento é ignorado por princípio.
 */

/** Formas de link que restaurante usa de verdade. A ordem é a da confiança. */
const PADROES = [
  { via: 'wa.me', re: /wa\.me\/(?:%2B|\+)?(?:55)?(\d{10,11})(?!\d)/gi },
  { via: 'api.whatsapp', re: /(?:api|web)\.whatsapp\.com\/send\/?\?[^"'\s]*phone=(?:%2B|\+)?(?:55)?(\d{10,11})(?!\d)/gi },
  { via: 'whatsapp://', re: /whatsapp:\/\/send\?[^"'\s]*phone=(?:%2B|\+)?(?:55)?(\d{10,11})(?!\d)/gi },
  { via: 'tel', re: /href=["']tel:(?:%2B|\+)?(?:55)?(\d{10,11})["']/gi },
];

/** DDDs que existem no Brasil. */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68,
  69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95,
  96, 97, 98, 99,
]);

const nacional = (s) => String(s || '').replace(/\D/g, '').replace(/^55/, '');

/** Celular brasileiro: 11 dígitos, DDD válido, nono dígito 9. */
function ehCelularValido(n) {
  return n.length === 11 && DDDS.has(Number(n.slice(0, 2))) && n[2] === '9';
}

/**
 * PURE: acha um celular no HTML do site.
 *
 * @param {string|null} html
 * @param {{numeroAtual?: string|null}} opts número que já temos (o fixo), para
 *   não "descobrir" o que já está no cadastro e para comparar o DDD.
 * @returns {{numero: string, via: string, dddDiferente: boolean}|null}
 */
function extrairCelularDoSite(html, { numeroAtual } = {}) {
  const doc = String(html || '');
  if (!doc.trim()) return null;

  const atual = nacional(numeroAtual);
  const dddAtual = atual.slice(0, 2);

  for (const { via, re } of PADROES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(doc)) !== null) {
      const n = nacional(m[1]);
      if (!ehCelularValido(n)) continue;      // fixo, truncado ou DDD inventado
      if (atual && n === atual) continue;     // é o que já temos
      return {
        numero: `+55${n}`,
        via,
        // Central da rede em vez da unidade: achado real no "Água Doce
        // Cachaçaria", lead de SP publicando celular DDD 47. Vale registrar,
        // mas o painel precisa avisar — senão a agente fala com a
        // franqueadora achando que fala com a casa.
        dddDiferente: Boolean(dddAtual) && n.slice(0, 2) !== dddAtual,
      };
    }
  }
  return null;
}

module.exports = { extrairCelularDoSite, ehCelularValido };
