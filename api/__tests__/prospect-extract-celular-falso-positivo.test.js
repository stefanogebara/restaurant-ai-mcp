/**
 * A REGEX DE TEXTO SOLTO ERA UMA FÁBRICA DE FALSO POSITIVO — conserto de
 * 02/09/2026.
 *
 * Medido em campo contra 19 sites reais da fila de prospecção: o extrator
 * devolveu DEZ "celulares", e os dez eram lixo. Vinham de dentro de nome de
 * classe CSS e de literal de ponto flutuante, porque a regex rodava sobre o
 * HTML CRU e sem fronteira de dígito — casava no meio de qualquer corrida
 * longa de números.
 *
 * Por que isso é grave e não cosmético: um número desses é gravado em
 * `whatsapp_phone` com status 'pending', e o disparo manda a intro do Olímpia
 * para um DESCONHECIDO. Custa a mensagem, custa reputação do número na Meta, e
 * o dono do celular recebe spam de uma empresa que nunca procurou.
 *
 * Só não aconteceu em produção porque a SCRAPINGDOG_API_KEY nunca esteve
 * configurada — a caça nunca leu um site. O acidente é que salvou.
 *
 * As duas strings do topo são REAIS, copiadas do HTML servido pelos sites.
 */

const { extrairCelularDoSite, textoVisivel } = require('../_lib/prospecting/prospect-extract');

// rascal.com.br — nome de classe gerado pelo WPBakery. Continha "15 93019 5425".
const CLASSE_WPBAKERY = '.vc_custom_1593019542599{margin-bottom: 0px !important;}';
// magicchicken.com.br — float na configuração do Elementor. Continha "99 99977 7955".
const FLOAT_ELEMENTOR = '{"scale_effect_mobile":{"unit":"px","size":0.59999999999999997779553950749686919152736663818359375}}';

describe('o lixo que passava antes', () => {
  test('nome de classe CSS dentro de <style> não vira celular', () => {
    const html = `<html><head><style>${CLASSE_WPBAKERY}</style></head><body>Ráscal</body></html>`;
    expect(extrairCelularDoSite(html, '11')).toBeNull();
  });

  test('float em JSON dentro de <script> não vira celular', () => {
    const html = `<html><body><script>${FLOAT_ELEMENTOR}</script>Magic Chicken</body></html>`;
    expect(extrairCelularDoSite(html, '11')).toBeNull();
  });

  test('mesmo SOLTO no corpo, a corrida de dígitos não casa (fronteira)', () => {
    // Sem a âncora, a regex entrava no meio destes dígitos. Aqui não há tag
    // nenhuma para remover: quem tem que barrar é a fronteira.
    const html = `<html><body>pedido 1593019542599 confirmado, telefone da loja</body></html>`;
    expect(extrairCelularDoSite(html, '11')).toBeNull();
  });

  test('CNPJ na mesma frase que a palavra "contato" não vira celular', () => {
    const html = '<html><body>Contato · CNPJ 19.930.195.4254/0001-99</body></html>';
    expect(extrairCelularDoSite(html, '11')).toBeNull();
  });

  test('celular de verdade, mas sem nenhuma pista de telefone por perto', () => {
    // O caminho solto existe para achar WhatsApp. Um celular boiando sozinho é
    // tão provavelmente um número de pedido quanto um contato — não arrisca.
    const html = '<html><body>Prêmio sorteado: 11 98765 4321. Boa sorte!</body></html>';
    expect(extrairCelularDoSite(html, '11')).toBeNull();
  });
});

describe('o que ainda tem que funcionar', () => {
  test('wa.me continua sendo a fonte de maior confiança', () => {
    const html = '<a href="https://wa.me/5511987654321">Fale conosco</a>';
    expect(extrairCelularDoSite(html, '11')).toEqual({ numero: '+5511987654321', fonte: 'wa_link' });
  });

  test('wa.me vence mesmo com lixo de CSS na mesma página', () => {
    const html = `<style>${CLASSE_WPBAKERY}</style><a href="https://wa.me/5511987654321">zap</a>`;
    expect(extrairCelularDoSite(html, '11')).toEqual({ numero: '+5511987654321', fonte: 'wa_link' });
  });

  test('tel: com celular é aceito', () => {
    const html = '<a href="tel:+5511987654321">Ligue</a>';
    expect(extrairCelularDoSite(html, '11')).toEqual({ numero: '+5511987654321', fonte: 'tel_href' });
  });

  test('tel: com FIXO continua sendo rejeitado — WhatsApp não existe em fixo', () => {
    const html = '<a href="tel:+551135785228">Ligue</a>';
    expect(extrairCelularDoSite(html, '11')).toBeNull();
  });

  test('texto visível COM pista de telefone ainda é achado', () => {
    const html = '<html><body><p>WhatsApp: (11) 98765-4321</p></body></html>';
    expect(extrairCelularDoSite(html, '11')).toEqual({ numero: '+5511987654321', fonte: 'texto' });
  });

  test.each([
    ['Whats', '<p>Whats (11) 98765-4321</p>'],
    ['zap', '<p>chama no zap 11 98765 4321</p>'],
    ['celular', '<p>celular: 11987654321</p>'],
    ['reserva', '<p>Reservas: (11) 98765-4321</p>'],
    ['pista DEPOIS do número', '<p>(11) 98765-4321 — WhatsApp</p>'],
  ])('pista "%s" habilita o caminho de texto', (_rotulo, html) => {
    const r = extrairCelularDoSite(html, '11');
    expect(r && r.numero).toBe('+5511987654321');
  });

  test('número partido por &nbsp; ainda casa', () => {
    const html = '<p>WhatsApp:&nbsp;(11)&nbsp;98765-4321</p>';
    expect(extrairCelularDoSite(html, '11')).toEqual({ numero: '+5511987654321', fonte: 'texto' });
  });
});

describe('markup que a fronteira sozinha NÃO barra', () => {
  // As âncoras de dígito só salvam quando o lixo está numa corrida LONGA de
  // números. Um celular válido e bem delimitado, escondido num atributo ao
  // lado de uma palavra-pista, passa por elas sem esforço — e é aqui que
  // remover markup é a única defesa. Este é o teste que prova o textoVisivel.
  test('celular dentro de atributo data-* não vira achado', () => {
    const html = '<div data-telefone="11987654321">Contato</div>';
    expect(extrairCelularDoSite(html, '11')).toBeNull();
  });

  test('celular dentro de <script>, bem delimitado e com pista, não vira achado', () => {
    const html = '<body><script>var contato = "11987654321";</script>Bem-vindo</body>';
    expect(extrairCelularDoSite(html, '11')).toBeNull();
  });
});

describe('textoVisivel', () => {
  test('descarta script, style, comentário e atributos', () => {
    const html = '<div class="vc_custom_1593019542599" data-x="11987654321">'
      + '<script>var a=1593019542599;</script><style>.b{}</style><!-- 11987654321 -->'
      + 'Bem-vindo</div>';
    const t = textoVisivel(html);

    expect(t).toContain('Bem-vindo');
    // Os quatro esconderijos do lixo que enganou a regex.
    expect(t).not.toContain('1593019542599');
    expect(t).not.toContain('11987654321');
    expect(t).not.toContain('vc_custom');
  });
});

/**
 * TRILHA NOVA, MESMA VIGILÂNCIA — 03/09/2026.
 *
 * A config de widget em <script> é a trilha mais exposta ao problema que este
 * arquivo inteiro documenta: ela lê justamente a região do HTML que
 * `textoVisivel` remove por ser cheia de lixo numérico. Por isso é ancorada em
 * CHAVE NOMEADA, e não em "qualquer 55DDD9XXXXXXX dentro do script".
 *
 * Veio de achado real: o Magic Chicken tinha o celular no HTML o tempo todo,
 * em `ht_ctc_chat_var = {"number":"5511945422056"}` (plugin Click to Chat).
 * É o caso que pagaria `dynamic=true` no Scrapingdog — e sai de graça.
 */
describe('JSON em <script> — acha o certo sem reabrir o buraco', () => {
  it('acha em schema.org JSON-LD (Câmara Fria, HTML real)', () => {
    // A família MAIS valiosa das duas: não é widget, é o telefone que a casa
    // declara em dado estruturado para buscador. Apareceu medindo 65 sites.
    const html = '<script type="application/ld+json">'
      + '{"@type":"Restaurant","url":"https://camarafriabar.com.br/",'
      + '"telephone":"+5511943643170"}</script>';

    expect(extrairCelularDoSite(html, '11')).toEqual({
      numero: '+5511943643170', fonte: 'script_json',
    });
  });

  it('acha na config do Click to Chat (Magic Chicken, HTML real)', () => {
    const html = '<script id="ht_ctc_app_js-js-extra">'
      + 'var ht_ctc_chat_var = {"number":"5511945422056","pre_filled":"Como podemos ajudar?"};'
      + '</script>';

    expect(extrairCelularDoSite(html, '11')).toEqual({
      numero: '+5511945422056', fonte: 'script_json',
    });
  });

  it('aceita aspas simples e a chave `whatsapp`', () => {
    const html = "<script>window.cfg = {'whatsapp': '+5521987654321'}</script>";

    expect(extrairCelularDoSite(html, '11').numero).toBe('+5521987654321');
  });

  it('RECUSA fixo na config — fixo não tem WhatsApp, é canal que não existe', () => {
    expect(extrairCelularDoSite('<script>var v={"number":"551133334444"}</script>', '11')).toBeNull();
  });

  it('RECUSA dígito solto no script — timestamp, id de pixel e seed moram lá', () => {
    // Têm a forma EXATA de um celular. O que os barra é não haver chave nomeada
    // da lista — que é a única defesa possível dentro de <script>.
    const html = '<script>var t={"ts":5511945422056,"id":"5511945422056","seed":"5511945422056"}</script>';

    expect(extrairCelularDoSite(html, '11')).toBeNull();
  });

  it('não atropela o wa.me — link segue sendo a fonte de maior confiança', () => {
    const html = '<a href="https://wa.me/5511911112222">zap</a>'
      + '<script>var ht_ctc_chat_var={"number":"5511933334444"}</script>';

    expect(extrairCelularDoSite(html, '11')).toEqual({
      numero: '+5511911112222', fonte: 'wa_link',
    });
  });
});
