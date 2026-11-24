'use strict';

/**
 * Recuperar o CELULAR de um lead cujo telefone é fixo, lendo o site da casa.
 *
 * O PROBLEMA: 2675 leads (57% do pool) têm telefone fixo. Fixo raramente está
 * no WhatsApp — dos 9 que já receberam tentativa de envio, 8 voltaram
 * `missing`. Eles são inalcançáveis pela agente.
 *
 * A MEDIÇÃO (03/08, amostra de 30 leads fixos com site): 21% dos sites que
 * abrem publicam um celular, e TODOS os acertos vieram de `href` — link de
 * WhatsApp ou `tel:`. Nenhum veio do texto visível. Por isso este extrator
 * olha LINK, não prosa.
 *
 * A ARMADILHA que define o desenho: varrer o HTML cru com regex de telefone
 * casa lixo de JavaScript minificado. No site do L'Entrecote de Paris apareceram
 * 115 "celulares" e 734 "fixos" num texto de 780 caracteres — todos falsos
 * (84981350859, 14946994036…). Por isso só contam números dentro de um link
 * reconhecido, e nunca dígitos soltos.
 */

const { extrairCelularDoSite } = require('../_lib/prospecting/numero-do-site');

const FIXO_DA_CASA = '+551133334444';

describe('formas reais de link de WhatsApp', () => {
  const casos = [
    ['<a href="https://wa.me/5511981527095">Reservas</a>', '+5511981527095'],
    ['<a href="https://api.whatsapp.com/send?phone=5511975096150&text=oi">', '+5511975096150'],
    ['<a href="https://web.whatsapp.com/send/?phone=5511915176945">', '+5511915176945'],
    ['<a href="whatsapp://send?phone=5511996791717">', '+5511996791717'],
    ['<a href="https://wa.me/11981527095">sem o 55</a>', '+5511981527095'],
    ['<a href="tel:+5511987654321">Ligue</a>', '+5511987654321'],
  ];
  test.each(casos)('%s', (html, esperado) => {
    expect(extrairCelularDoSite(html, { numeroAtual: FIXO_DA_CASA })?.numero).toBe(esperado);
  });
});

describe('o que NÃO pode ser confundido com celular', () => {
  test('lixo de JavaScript minificado (o caso L\'Entrecote)', () => {
    // Sequências longas de dígitos dentro de bundle/base64. Sem a exigência de
    // link, isto produzia 115 falsos positivos numa única página.
    const html = `<script>var t=[84981350859,14946994036,66979668247];</script>
      <div>id-11987654321-hash</div><span>5511999998888</span>`;
    expect(extrairCelularDoSite(html, { numeroAtual: FIXO_DA_CASA })).toBeNull();
  });

  test('link de telefone FIXO não serve — é o que já temos', () => {
    expect(extrairCelularDoSite('<a href="tel:+551133334444">', { numeroAtual: FIXO_DA_CASA })).toBeNull();
    expect(extrairCelularDoSite('<a href="tel:+551129998888">', { numeroAtual: FIXO_DA_CASA })).toBeNull();
  });

  test('o próprio número da casa, mesmo escrito diferente', () => {
    expect(extrairCelularDoSite('<a href="https://wa.me/551133334444">', { numeroAtual: FIXO_DA_CASA })).toBeNull();
  });

  test('DDD inexistente', () => {
    expect(extrairCelularDoSite('<a href="https://wa.me/5501991234567">', { numeroAtual: FIXO_DA_CASA })).toBeNull();
  });

  test('número truncado ou longo demais', () => {
    expect(extrairCelularDoSite('<a href="https://wa.me/55119912345">', { numeroAtual: FIXO_DA_CASA })).toBeNull();
    expect(extrairCelularDoSite('<a href="https://wa.me/551199123456789">', { numeroAtual: FIXO_DA_CASA })).toBeNull();
  });

  test('html vazio ou lixo não explode', () => {
    expect(extrairCelularDoSite(null, {})).toBeNull();
    expect(extrairCelularDoSite('', {})).toBeNull();
    expect(extrairCelularDoSite('<html><body>sem contato</body></html>', {})).toBeNull();
  });
});

describe('procedência para o fundador julgar', () => {
  test('avisa quando o DDD do celular difere do fixo da casa', () => {
    // Achado real: "Água Doce Cachaçaria" (lead de SP) publicava um celular
    // DDD 47. É central nacional da rede, não a casa. Vale registrar — mas o
    // painel precisa dizer, senão a Olímpia fala com a franqueadora achando
    // que fala com a unidade.
    const r = extrairCelularDoSite('<a href="https://wa.me/5547996442727">', { numeroAtual: FIXO_DA_CASA });
    expect(r.numero).toBe('+5547996442727');
    expect(r.dddDiferente).toBe(true);
  });

  test('mesmo DDD não levanta a bandeira', () => {
    const r = extrairCelularDoSite('<a href="https://wa.me/5511981527095">', { numeroAtual: FIXO_DA_CASA });
    expect(r.dddDiferente).toBe(false);
  });

  test('diz por qual link achou', () => {
    expect(extrairCelularDoSite('<a href="https://wa.me/5511981527095">', {}).via).toBe('wa.me');
    expect(extrairCelularDoSite('<a href="tel:+5511981527095">', {}).via).toBe('tel');
  });
});
