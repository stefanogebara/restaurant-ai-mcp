'use strict';

/**
 * Varredura de autoresponders — 12/08/2026.
 *
 * ACHADO. Dos 133 turnos humanos parados esperando resposta, 21 (16%) eram
 * robô: menu de delivery, link de pedido, horário institucional. A Olímpia
 * respondia a todos — gasto de LLM, turno queimado, e a fila entupida
 * escondendo as 2 pessoas que de fato demonstraram interesse.
 *
 * TODA string aqui EXISTIU: saiu de prospect_messages, não da minha cabeça. É
 * a mesma disciplina do claim-linter, que quase deixou passar o próprio
 * incidente que o motivou porque eu tinha testado a frase que imaginei.
 *
 * O teste que mais importa é o ÚLTIMO bloco: falso positivo aqui significa a
 * agente calar com um dono de restaurante de verdade, que custa muito mais
 * caro que gastar um turno com robô.
 */

const { semHumanoNaThread } = require('../_lib/prospecting/prospect-state');

/** Um inbound isolado é robô? (é o que o predicado responde para uma thread de 1) */
const ehRobo = (corpo) => semHumanoNaThread([{ direcao: 'in', tipo: 'text', corpo }]);

// ------------------------------------------------------- a marcação do WhatsApp
describe('marcação do WhatsApp não pode furar a peneira', () => {
  // O Gero Panini escapava de um padrão que JÁ existia: `\b` não vê fronteira
  // entre `_` e `A`. O defeito valia para os 30+ padrões, não só para um.
  const gero = '_Agradecemos seu contato com o Gero Panini Itaim, restaurante do Grupo Fasano '
    + 'dedicado aos sanduíches._\n\nSua mensagem foi recebida e será respondida em breve por nossa equipe.';

  test('itálico no início não esconde mais o autoresponder', () => {
    expect(ehRobo(gero)).toBe(true);
  });

  test('a mesma frase SEM marcação continua pega (não troquei um buraco por outro)', () => {
    expect(ehRobo(gero.replace(/_/g, ''))).toBe(true);
  });
});

// --------------------------------------------------------- os 21 que escapavam
describe('os autoresponders reais que passavam batido', () => {
  const REAIS = {
    'EAP: canal exclusivo para delivery':
      '🚨 Este canal é exclusivo para delivery.\n\nPara assuntos comerciais e vendas:\n📧 E-mail: contato@eapsp.com.br\n☎️ Escritório: 11 3097-0547\n\nAguardamos seu pedido! 💖',
    'Danbam: atendemos por ordem de chegada':
      'Olá. Atendemos por ordem de chegada todos os dias das 17:00~21:00 e almoço somente aos sábados das 12:00~14:00.',
    'Toca do Bu: gostaria de fazer seu pedido':
      'Olá, gostaria de fazer seu pedido?\n** Nosso cardápio esta disponível na aba “catálogo”. **',
    "Daddy's: link de plataforma":
      'Para ver nosso cardápio de hoje e realizar o seu pedido acesse o link abaixo: ⤵\n- https://menu.beefood.com.br/daddyschickenburguer/?w=467bdb23',
    'Açaí Tavares: plataforma de delivery':
      'Gratidão pela preferência 🙏. Acesse nossa plataforma de delivery é rápido, é prático e simples.\nhttps://pedir.delivery/app/acaitavares/menu',
    'Marlene: site novo pra fazer pedido':
      'Oi, tudo bem?\n\nTem site novo pra você fazer seu pedido e ficar por dentro de cada atualização!\n\nhttps://restaurantedamarlene.saipos.com',
    'Maioli: link para pedidos':
      '*Link para Pedidos*\n\nVisando agilizar seu pedido e evitar atrasos, pedimos que usem o link abaixo\n\nhttps://pedemais.net/maioli',
    'Adega do Rafinha: dar uma olhada no cardápio':
      'Oieeee\nQue tal dar uma olhada em nosso cardápio ☺️\n\nhttps://adegadorafinha.wabiz.delivery/',
    'Cantina Mineira: cardápio com dois-pontos':
      'Cardápio:\n\nSe quiser saber mais sobre algum sabor específico, é só me perguntar.',
    'Bodega SP: só nos aplicativos de delivery':
      'Olá, não estamos mais trabalhando com delivery próprio, estamos apenas nos aplicativos de delivery.\nhttps://url-eu.mykeeta.com/js8yisdz',
    'Gênio da Esfiha: atendemos hoje das':
      'Atendemos hoje das 09h45 às 03h30, aproveite e *clique abaixo* para fazer um pedido 🤩\nhttps://deliveryapp.neemo.com.br/pedir/12889/WbyKNmU2',
    'Texas: agilizarmos o seu pedido':
      '☺️Olá, Texas Restaurante agradece o seu contato!\n\n➡️para agilizarmos o seu pedido, solicitamos os seguintes dados:\n-nome\n-endereço',
    'Jardan: tabela de preços de buffet':
      '*Buffet de café à vontade*\nSegunda à sexta: Das 06:00 às 11:00 -  R$56,90\nSábado, Domingo e feriado: Das 06:00 às 11:30 -  R$72,90',
    'Altanur: dê uma olhada em nosso cardápio':
      'Obrigado por entrar em contato com Altanur restaurante Estamos abertos de Terça a sábado das 9:00 às 22:00\nDê uma olhada em nosso cardápio\nhttps://altanur.com.br/cardapio/',
    'Estação: faça seu pedido por este link':
      'Olá, meu nome é *Deyse, do Restaurante Estação!* 🍽️✨\n*Você pode fazer seu pedido diretamente por este link:* https://estacaorestaurante.saipos.com/home',
    'Petí: cardápio atual':
      '👨‍🍳O Restaurante Petí e a Pintar agradecem o seu contato. Como podemos ajudar?👨‍🎨 RESERVAS: https://widget.getinapp.com.br/e63nBx1v CARDÁPIO ATUAL: https://menu.getinapp.com.br/store/Rg1gdb6w',
    'Casa Duas Torres: bateu a fome':
      'Olá! Bateu a fome? 😋 O cardápio está a um toque de distância.\nPeça agora: https://menu.beefood.com.br/casaduastorres?a=408',
    'Formaggio: pedido pelo aplicativo':
      'Bem vindo á Formaggio Mineiro, Campo Belo!\nAgora você faz seu pedido direto pelo nosso aplicativo. Aqui está\n\nhttps://deliverydireto.com.br/formaggiomineiro/brooklin',
    'Santōsushi: preço + horário + endereço':
      'Olá, obrigada por entrar em contato.\n\nSobre o valor do nosso Rodízio: Almoço de Terça a Sexta R$ 89,90\nAlmoço e Jantar aos Sábados R$ 142,90\n\nNossos Horários de atendimento:',
    'Sevillano: agradece o seu contato + como podemos ajudar':
      'Sevillano Bistrô agradece o seu contato. Como podemos ajudar ?',
    'Bar do Portuga: agradece + como podemos ajudar':
      'Olá!! Bar do Portuga agradece o seu contato. Como podemos ajudar você? As mensagens serão respondidas em breve',
  };

  for (const [nome, texto] of Object.entries(REAIS)) {
    test(`pega: ${nome}`, () => expect(ehRobo(texto)).toBe(true));
  }
});

// ------------------------------------------------------ O GUARDA QUE MAIS IMPORTA
describe('gente de verdade NUNCA pode ser marcada como robô', () => {
  // Todas estas saíram do mesmo corpus de 133 turnos. Se alguma virar "robô",
  // a Olímpia cala com um dono de restaurante — o erro caro desta mudança.
  const HUMANOS = [
    '100% balcão',
    'Aqui é comanda individual',
    'Somamos no cx e dividimos',
    'cliente paga e depois pega',
    'Ah não, aqui é tudo automatizado',
    'Os dois',
    'tudo tranquilo',
    'Oi pode ser',
    'Oie.. Não entendi nada :)',
    'Bom dia, tudo bem?',
    'pode deixar iremos encaminhar os eu contato!',
    'O dono e proprietário da marca, você pode está entrando em contato com ele através do nosso email',
    'Bom dia, laiane.souza@continentalshopping.com.br',
    'Poderia entrar em contato conosco por este mesmo número na Segunda',
  ];

  for (const texto of HUMANOS) {
    test(`humano segue humano: «${texto.slice(0, 44)}»`, () => expect(ehRobo(texto)).toBe(false));
  }

  // O caso que desenhou o padrão de "agradece": uma RECUSA humana não pode
  // virar robô, porque o registro de opt-out (LGPD) depende deste predicado.
  test('recusa educada com "agradecemos" continua sendo gente', () => {
    expect(ehRobo('Agradecemos o contato mas não temos interesse no momento')).toBe(false);
    expect(ehRobo('Bom dia Agradeço o contato mas não temos interesse Obrigado')).toBe(false);
  });

  test('dono falando de cardápio SEM link nem oferta continua humano', () => {
    // "nosso cardápio" casa com o padrão; "o cardápio é enxuto" não deve.
    expect(ehRobo('o cardápio é enxuto, só 12 pratos')).toBe(false);
  });
});
