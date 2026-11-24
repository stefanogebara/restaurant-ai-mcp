'use strict';

/**
 * Autoresponder em RAJADA — o caso La Braciera (30/jul).
 *
 * O bot da pizzaria mandou DUAS mensagens seguidas. A primeira é inequívoca e o
 * detector pegou (bem-vindo / horário de atendimento / iFood). A segunda é mais
 * macia e não bateu em padrão nenhum — e como `ecoDeMaquina` avalia só o ÚLTIMO
 * inbound, a flag caiu e a Olímpia conversou com o robô.
 *
 * A regra do último inbound é DELIBERADA (ver comentário em prospect-state.js):
 * permite que o dono retome depois da saudação automática. Mexer nela troca um
 * falso negativo barato (tokens) por um falso positivo caro (não responder a um
 * lead real). Então o conserto é reconhecer a SEGUNDA mensagem pelo que ela é —
 * texto institucional — e não afrouxar a regra do turno.
 *
 * Os textos abaixo são a transcrição literal do que chegou em produção.
 */

const {
  pareceAutoAtendimento, ecoDeMaquina, semHumanoNaThread,
} = require('../_lib/prospecting/prospect-state');

// Primeira do bot — já era detectada antes deste conserto.
const BOT_1 = `Bem vindo(a) a *La Braciera* 🍕🇮🇹

Os *Pedidos de Delivery* podem ser  feitos diretamente em nosso *Whatsapp* ou *Ifood*🪵🔥
Link para pedidos no *Ifood* 👇
 https://ifoodbr.onelink.me/F4X4/GrupoLaBraciera
Para pedidos aqui no WhatsApp basta nos informar o seu CEP e endereço completo e aguardar nossas atendentes! 👩🏻‍💻👩🏻‍💻🧑🏻‍💻
✔️Horário de atendimento *Delivery*: *17:00 as 22h45 🛵*
✔️Horário e atendimento *Salão*: *18:00 as 23h00* 🍕✨
✔️As reservas não são obrigatórias
✔️ Aceitamos crédito 💳, vale refeição, link de pagamento`;

// Segunda do bot — a que escapou e fez a Olímpia responder pra máquina.
const BOT_2 = `🇮🇹🍕 Olá, que incrível você aqui ✨

No momento estamos fechados, mas reabrimos às 15:30 com atendimento VIP.

📦 Delivery: 17h00 – 22h45
🏛️ Salão: 18h00 – 23h00

Agradecemos a compreensão e até já! ❤️😎

🔖 Reservas

Não são obrigatórias, mas, se quiser garantir seu lugar, faça a sua pelo link abaixo:
👉 Clique aqui para reservar
https://usetag.me/labraciera

Estamos esperando por vocês cada visita é uma festa em nossos corações! 🥹🥳`;

describe('a mensagem que escapou', () => {
  test('BOT_1 já era pega (não regredir)', () => {
    expect(pareceAutoAtendimento(BOT_1)).toBe(true);
  });

  test('BOT_2 passa a ser reconhecida como institucional', () => {
    expect(pareceAutoAtendimento(BOT_2)).toBe(true);
  });

  // O que a flag dispara (prospect-responder.js:470): modo PORTEIRO — a Olímpia
  // para de vender e passa a pedir quem decide; após PORTEIRO_MAX tentativas o
  // lead é parqueado em 'porteiro' e sai dos seletores proativos. Não é
  // silêncio, é mudar de objetivo ao perceber que do outro lado tem máquina.
  test('a rajada inteira é eco de máquina — liga o modo porteiro', () => {
    const historico = [
      { direcao: 'out', corpo: '[template:olimpia_intro]' },
      { direcao: 'in', corpo: BOT_1 },
      { direcao: 'in', corpo: BOT_2 },
    ];
    expect(ecoDeMaquina(historico)).toBe(true);
    expect(semHumanoNaThread(historico)).toBe(true);
  });
});

describe('o que NÃO pode quebrar — falso positivo custa um lead', () => {
  // A regra do último inbound existe pra isto: dono retomando depois do robô.
  test('humano respondendo DEPOIS da saudação automática continua sendo gente', () => {
    const historico = [
      { direcao: 'out', corpo: '[template:olimpia_intro]' },
      { direcao: 'in', corpo: BOT_1 },
      { direcao: 'in', corpo: 'opa, boa noite! me explica melhor como funciona?' },
    ];
    expect(ecoDeMaquina(historico)).toBe(false);
    expect(semHumanoNaThread(historico)).toBe(false);
  });

  test('resposta humana curta e seca não vira robô', () => {
    for (const texto of [
      'quanto custa?',
      'manda mais info',
      'não tenho interesse agora, obrigado',
      'estamos fechados hoje, me chama amanhã',
      'oi, tudo bem? quem fala?',
    ]) {
      expect(pareceAutoAtendimento(texto)).toBe(false);
    }
  });

  test('dono falando de horário no meio de conversa real não vira robô', () => {
    // "a gente fecha às 23h" é fala de gente; o padrão precisa da forma
    // institucional ("Horário de atendimento:", bloco rotulado), não de
    // qualquer menção a hora.
    expect(pareceAutoAtendimento('a gente fecha às 23h, pode me ligar antes disso')).toBe(false);
    expect(pareceAutoAtendimento('hoje reabrimos mais tarde, teve um problema na cozinha')).toBe(false);
  });
});
