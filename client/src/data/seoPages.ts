/**
 * SEO Landing Pages Data
 *
 * Each entry defines a programmatic SEO page targeting
 * "melhor sistema de reservas para [cuisine] em [city]".
 * Content is unique per cuisine+city to avoid thin-content penalties.
 */

export interface SeoPainPoint {
  readonly title: string;
  readonly description: string;
}

export interface SeoStats {
  readonly noShowRate: string;
  readonly avgTicket: string;
  readonly peakHours: string;
  readonly weeklyReservations: string;
}

export interface SeoFaq {
  readonly question: string;
  readonly answer: string;
}

export interface SeoPageData {
  readonly slug: string;
  readonly cuisine: string;
  readonly city: string;
  readonly state: string;
  readonly painPoints: readonly SeoPainPoint[];
  readonly stats: SeoStats;
  readonly faqs: readonly SeoFaq[];
  readonly competitors: readonly string[];
  readonly ctaText: string;
  readonly metaDescription: string;
}

// ─── São Paulo ──────────────────────────────────────────────────

const SP_PAGES: readonly SeoPageData[] = [
  {
    slug: 'pizzaria-sao-paulo',
    cuisine: 'Pizzarias',
    city: 'São Paulo',
    state: 'SP',
    painPoints: [
      { title: 'Alto volume de walk-ins', description: 'Pizzarias recebem um fluxo intenso de clientes sem reserva, especialmente aos fins de semana. Sem um sistema inteligente, a fila cresce e clientes desistem.' },
      { title: 'Rodízio exige controle de tempo', description: 'Com mesas girando a cada 90 minutos no rodízio, a gestão manual de tempo gera atrasos e insatisfação.' },
      { title: 'No-shows em dias de jogo', description: 'Eventos esportivos aumentam reservas mas também os no-shows. Sem previsão, mesas ficam vazias nos horários de maior demanda.' },
    ],
    stats: { noShowRate: '18%', avgTicket: 'R$ 65', peakHours: '19h–22h', weeklyReservations: '180+' },
    faqs: [
      { question: 'O sistema funciona com rodízio de pizza?', answer: 'Sim. O Seatable controla automaticamente o tempo de cada mesa no rodízio, enviando alertas quando o período está próximo do fim e gerenciando a fila de espera em tempo real.' },
      { question: 'Consigo receber reservas pelo WhatsApp?', answer: 'Com certeza. A IA do Seatable responde automaticamente no WhatsApp da sua pizzaria, confirma horários disponíveis e faz a reserva sem intervenção humana.' },
      { question: 'Como funciona a previsão de no-show?', answer: 'Nosso algoritmo de ML analisa o histórico de cada cliente e fatores externos (clima, eventos) para prever a probabilidade de no-show e sugerir overbooking inteligente.' },
      { question: 'Posso usar em delivery também?', answer: 'O Seatable é focado em reservas e gestão de salão. Para delivery, integramos com iFood e Rappi para que sua operação fique centralizada.' },
      { question: 'Quanto custa para uma pizzaria?', answer: 'A partir de R$ 497/mês no plano Essencial. Para pizzarias com alto volume, o plano Profissional (R$ 1.497/mês) inclui IA por voz e analytics avançado.' },
    ],
    competitors: ['Caderno de reservas', 'WhatsApp manual', 'Planilha Excel'],
    ctaText: 'Teste grátis na sua pizzaria',
    metaDescription: 'Sistema de reservas com IA para pizzarias em São Paulo. Reduza no-shows em 40%, gerencie walk-ins e rodízio com automação inteligente via WhatsApp.',
  },
  {
    slug: 'japonesa-sao-paulo',
    cuisine: 'Restaurantes Japoneses',
    city: 'São Paulo',
    state: 'SP',
    painPoints: [
      { title: 'Reservas de omakase são complexas', description: 'Menus omakase exigem confirmação antecipada de restrições alimentares e preferências. Comunicação manual por telefone gera erros e esquecimentos.' },
      { title: 'Balcão de sushi tem rotatividade alta', description: 'Assentos no balcão giram rápido, mas sem controle preciso, clientes esperam mais do que o necessário e a experiência cai.' },
      { title: 'Público exigente e reviews críticos', description: 'Clientes de culinária japonesa avaliam rigorosamente no Google. Uma experiência ruim na reserva já começa com nota baixa.' },
    ],
    stats: { noShowRate: '12%', avgTicket: 'R$ 120', peakHours: '19h30–22h', weeklyReservations: '90+' },
    faqs: [
      { question: 'A IA entende restrições alimentares japonesas?', answer: 'Sim. O chatbot do Seatable pergunta sobre alergias, preferências (sem frutos do mar cru, vegetariano) e registra tudo para a cozinha antes da chegada.' },
      { question: 'Funciona para reservas de balcão de sushi?', answer: 'Perfeitamente. Você configura assentos de balcão separadamente, com tempo de rotação diferente das mesas tradicionais.' },
      { question: 'Consigo enviar o menu omakase antes da visita?', answer: 'A IA pode enviar automaticamente o menu do dia via WhatsApp para clientes com reserva confirmada, incluindo harmonização de bebidas.' },
      { question: 'Tem integração com Google Maps?', answer: 'Sim. Seu perfil no Google Maps se atualiza automaticamente com horários de funcionamento e link direto para reservas.' },
      { question: 'Como funciona para grupos grandes?', answer: 'O Seatable gerencia reservas de grupos com configuração automática de mesas combinadas, menu fixo e depósito antecipado para garantir a reserva.' },
    ],
    competitors: ['Telefone', 'Instagram DM', 'Google Forms'],
    ctaText: 'Teste grátis no seu japonês',
    metaDescription: 'Sistema de reservas para restaurantes japoneses em São Paulo. IA que entende omakase, gerencia balcão de sushi e reduz no-shows com automação via WhatsApp.',
  },
  {
    slug: 'italiana-sao-paulo',
    cuisine: 'Restaurantes Italianos',
    city: 'São Paulo',
    state: 'SP',
    painPoints: [
      { title: 'Jantares longos ocupam mesas por horas', description: 'A cultura italiana valoriza refeições longas, mas isso reduz o giro de mesas. Sem previsão de duração, o segundo turno atrasa.' },
      { title: 'Datas especiais lotam semanas antes', description: 'Dia dos Namorados, Natal e aniversários geram picos de demanda. Sem waitlist automatizada, clientes vão para a concorrência.' },
      { title: 'Harmonização de vinhos exige planejamento', description: 'Reservas com menu degustação e harmonização precisam de preparação antecipada. Comunicação manual falha com frequência.' },
    ],
    stats: { noShowRate: '15%', avgTicket: 'R$ 95', peakHours: '20h–23h', weeklyReservations: '120+' },
    faqs: [
      { question: 'Como gerencio dois turnos de jantar?', answer: 'O Seatable configura automaticamente turnos com intervalos de limpeza. A IA sugere horários otimizados para maximizar a ocupação sem apressar os clientes.' },
      { question: 'Consigo cobrar depósito antecipado?', answer: 'Sim. Para datas especiais ou menus degustação, o Seatable cobra um depósito via Stripe no momento da reserva, devolvendo automaticamente após a visita.' },
      { question: 'Funciona com menu fixo de fim de semana?', answer: 'O chatbot pode apresentar o menu da semana e confirmar a escolha do cliente no momento da reserva, enviando tudo direto para a cozinha.' },
      { question: 'Como lidar com reservas de última hora?', answer: 'A IA do Seatable verifica disponibilidade em tempo real e oferece alternativas de horário, inclusive sugerindo o bar para espera quando não há mesas.' },
      { question: 'Tem relatórios de ocupação?', answer: 'Dashboard completo com ocupação por dia/horário, receita prevista, tempo médio de mesa e tendências semanais para otimizar sua operação.' },
    ],
    competitors: ['Caderno de reservas', 'Telefone fixo', 'WhatsApp pessoal do maître'],
    ctaText: 'Teste grátis no seu italiano',
    metaDescription: 'Sistema de reservas para restaurantes italianos em São Paulo. Gerencie turnos, harmonizações e datas especiais com IA via WhatsApp e voz.',
  },
  {
    slug: 'churrascaria-sao-paulo',
    cuisine: 'Churrascarias',
    city: 'São Paulo',
    state: 'SP',
    painPoints: [
      { title: 'Rodízio com tempo fixo gera conflitos', description: 'Clientes que ultrapassam o tempo do rodízio atrasam a próxima rodada. Sem controle automático, o estresse recai sobre o garçom.' },
      { title: 'Grupos corporativos exigem customização', description: 'Eventos empresariais precisam de menu especial, conta dividida e espaço reservado. Coordenar tudo manualmente é caótico.' },
      { title: 'Fins de semana com fila de 2+ horas', description: 'A fila de espera em churrascarias populares chega a 2 horas. Sem gestão digital, clientes não sabem quando serão chamados.' },
    ],
    stats: { noShowRate: '20%', avgTicket: 'R$ 85', peakHours: '12h–15h, 19h–22h', weeklyReservations: '250+' },
    faqs: [
      { question: 'A IA gerencia a fila de espera?', answer: 'Sim. O Seatable envia uma mensagem via WhatsApp quando a mesa está quase pronta, com tempo estimado atualizado em tempo real.' },
      { question: 'Funciona para almoço e jantar?', answer: 'Configuração independente para cada turno, com capacidades e tempos de mesa diferentes. Ideal para churrascarias que operam nos dois períodos.' },
      { question: 'Como lidar com grupos de 15+ pessoas?', answer: 'O sistema combina mesas automaticamente, sugere menu fixo para grupos e permite cobrança de depósito proporcional ao tamanho do grupo.' },
      { question: 'Consigo prever a demanda do fim de semana?', answer: 'O dashboard mostra previsões baseadas em histórico, permitindo ajustar estoque de carnes e equipe com antecedência.' },
      { question: 'Integra com meu sistema de ponto de venda?', answer: 'O Seatable se integra com os principais PDVs do mercado, sincronizando mesas ocupadas, contas fechadas e tempo de permanência.' },
    ],
    competitors: ['Fila presencial', 'Caderno do gerente', 'WhatsApp do restaurante'],
    ctaText: 'Teste grátis na sua churrascaria',
    metaDescription: 'Sistema de reservas para churrascarias em São Paulo. Gerencie rodízio, fila de espera e grupos corporativos com IA via WhatsApp.',
  },
  {
    slug: 'fine-dining-sao-paulo',
    cuisine: 'Fine Dining',
    city: 'São Paulo',
    state: 'SP',
    painPoints: [
      { title: 'Cada reserva exige atenção personalizada', description: 'Clientes de fine dining esperam reconhecimento. Sem histórico digital, o maître não sabe preferências nem ocasiões especiais.' },
      { title: 'No-shows custam centenas de reais por mesa', description: 'Com ticket médio acima de R$ 250, cada no-show é um prejuízo significativo. Depósitos manuais são constrangedores.' },
      { title: 'Lista de espera para meses exige gestão', description: 'Restaurantes premiados têm waitlist de semanas. Gerenciar prioridades e confirmações manualmente é insustentável.' },
    ],
    stats: { noShowRate: '8%', avgTicket: 'R$ 280', peakHours: '20h–23h', weeklyReservations: '60+' },
    faqs: [
      { question: 'A IA mantém perfil do cliente?', answer: 'Sim. O Seatable registra preferências, alergias, datas especiais e histórico de visitas. Na próxima reserva, a equipe já sabe exatamente como receber o cliente.' },
      { question: 'Posso cobrar depósito sem ser invasivo?', answer: 'O processo é elegante: o cliente recebe um link de pagamento via WhatsApp, integrado ao Stripe, com devolução automática após a visita.' },
      { question: 'Como funciona a lista de espera VIP?', answer: 'Priorização automática baseada em frequência, gasto total e indicações. VIPs recebem notificação primeiro quando uma mesa abre.' },
      { question: 'Tem integração com Google Business?', answer: 'Sim. Botão "Reservar" direto no seu perfil do Google, com disponibilidade em tempo real e confirmação automática.' },
      { question: 'O sistema é discreto o suficiente para fine dining?', answer: 'Totalmente. A interface é minimalista e o chatbot é personalizado com o tom e a linguagem do seu restaurante. Nenhum cliente perceberá que é IA.' },
    ],
    competitors: ['OpenTable', 'Telefone com secretária', 'Email pessoal do chef'],
    ctaText: 'Agende uma demonstração exclusiva',
    metaDescription: 'Sistema de reservas premium para fine dining em São Paulo. Perfil VIP, depósitos elegantes e IA personalizada para restaurantes de alta gastronomia.',
  },
  {
    slug: 'bar-sao-paulo',
    cuisine: 'Bares e Pubs',
    city: 'São Paulo',
    state: 'SP',
    painPoints: [
      { title: 'Happy hour sem controle de capacidade', description: 'Das 17h às 20h, a casa lota rapidamente. Sem gestão de capacidade, ultrapassa o limite do bombeiro e cria riscos.' },
      { title: 'Reservas de área VIP são informais', description: 'Espaços VIP reservados por WhatsApp pessoal sem depósito resultam em no-shows frequentes e perda de receita.' },
      { title: 'Eventos ao vivo complicam a logística', description: 'Shows e DJ sets alteram a capacidade e o layout. Gerenciar reservas em noites de evento exige flexibilidade que o caderno não tem.' },
    ],
    stats: { noShowRate: '25%', avgTicket: 'R$ 55', peakHours: '18h–01h', weeklyReservations: '150+' },
    faqs: [
      { question: 'Funciona para reserva de área VIP?', answer: 'Sim. Configure áreas VIP com consumação mínima, cobrando depósito automático via Stripe. A IA confirma e envia as regras da casa.' },
      { question: 'Consigo limitar a capacidade por horário?', answer: 'Perfeitamente. Defina capacidade máxima por turno (happy hour, noite, madrugada) e o sistema para de aceitar reservas ao atingir o limite.' },
      { question: 'O sistema funciona até de madrugada?', answer: 'A IA do Seatable funciona 24/7. Reservas chegam pelo WhatsApp a qualquer hora e são confirmadas automaticamente.' },
      { question: 'Posso usar em noites de evento?', answer: 'Crie configurações especiais para noites de evento com capacidade, preço e layout diferentes do dia a dia.' },
      { question: 'Como reduzir no-shows no happy hour?', answer: 'Lembretes automáticos via WhatsApp 2h antes, combinados com depósito para grupos grandes, reduzem no-shows em até 40%.' },
    ],
    competitors: ['WhatsApp pessoal', 'Lista na porta', 'Instagram DM'],
    ctaText: 'Teste grátis no seu bar',
    metaDescription: 'Sistema de reservas para bares e pubs em São Paulo. Gerencie happy hour, áreas VIP e eventos com IA via WhatsApp. Reduza no-shows em 40%.',
  },
  {
    slug: 'cafe-sao-paulo',
    cuisine: 'Cafés e Bistrôs',
    city: 'São Paulo',
    state: 'SP',
    painPoints: [
      { title: 'Brunch de fim de semana sem gestão de fila', description: 'O brunch se tornou fenômeno em SP, gerando filas de 1h+ em cafés populares. Sem waitlist digital, clientes saem frustrados.' },
      { title: 'Espaço limitado com alta demanda', description: 'Bistrôs com 20-30 lugares não podem perder uma única mesa. Cada no-show representa 5% da receita do turno.' },
      { title: 'Coworking informal compete com reservas', description: 'Clientes que ficam horas trabalhando no laptop reduzem o giro. Sem política clara de tempo, o conflito é inevitável.' },
    ],
    stats: { noShowRate: '22%', avgTicket: 'R$ 45', peakHours: '9h–14h', weeklyReservations: '100+' },
    faqs: [
      { question: 'Funciona para reserva de brunch?', answer: 'Sim. Configure turnos de brunch com tempo máximo de mesa e o Seatable gerencia a rotação automaticamente, mantendo a fila organizada.' },
      { question: 'Posso definir tempo máximo de permanência?', answer: 'Configurável por período. Para brunch de fim de semana, defina 90 minutos; para dias de semana, sem limite. A IA avisa educadamente o cliente.' },
      { question: 'O chatbot funciona para perguntas sobre o menu?', answer: 'A IA responde perguntas sobre ingredientes, opções sem glúten/lactose e especiais do dia, além de fazer a reserva.' },
      { question: 'Consigo usar em um bistrô com 15 mesas?', answer: 'Ideal para operações menores. O plano Essencial (R$ 497/mês) é perfeito para bistrôs, com reservas por WhatsApp e dashboard básico.' },
      { question: 'Tem relatório de horários de pico?', answer: 'Sim. O analytics mostra exatamente quais horários e dias têm maior demanda, ajudando a planejar equipe e estoque.' },
    ],
    competitors: ['Instagram', 'Google reservas genérico', 'Sem sistema'],
    ctaText: 'Teste grátis no seu café',
    metaDescription: 'Sistema de reservas para cafés e bistrôs em São Paulo. Gerencie brunch, fila de espera e mesas com IA via WhatsApp. Ideal para espaços pequenos.',
  },
  {
    slug: 'mexicana-sao-paulo',
    cuisine: 'Restaurantes Mexicanos',
    city: 'São Paulo',
    state: 'SP',
    painPoints: [
      { title: 'Noites de terça de tacos lotam sem aviso', description: 'Promoções semanais como "Taco Tuesday" geram picos imprevisíveis. Sem previsão, a cozinha e o salão ficam sobrecarregados.' },
      { title: 'Grupos de happy hour são barulhentos e longos', description: 'Margaritas e nachos atraem grupos grandes que ficam horas. Sem controle de tempo, o segundo turno desaparece.' },
      { title: 'Pedidos de customização por WhatsApp', description: 'Clientes pedem alterações no menu (sem pimenta, extra guacamole) via WhatsApp. Gerenciar manualmente é caótico.' },
    ],
    stats: { noShowRate: '19%', avgTicket: 'R$ 60', peakHours: '19h–23h', weeklyReservations: '130+' },
    faqs: [
      { question: 'A IA lida com promoções semanais?', answer: 'Sim. Configure noites especiais com capacidade e tempo de mesa diferentes. O chatbot informa clientes sobre a promoção e faz a reserva.' },
      { question: 'Funciona para grupos de happy hour?', answer: 'Perfeitamente. Defina tempo máximo para happy hour e o sistema avisa educadamente quando está próximo do fim. Para grupos grandes, cobra depósito.' },
      { question: 'Consigo personalizar o chatbot em espanhol?', answer: 'O Seatable suporta PT-BR, espanhol e inglês. O chatbot responde no idioma do cliente automaticamente.' },
      { question: 'Como gerencio mesas internas e externas?', answer: 'Configure áreas separadas (salão, terraço, bar) com capacidades independentes. Clientes podem escolher a preferência na reserva.' },
      { question: 'Tem como enviar o menu antes da visita?', answer: 'A IA envia automaticamente o cardápio do dia via WhatsApp 2h antes da reserva, incluindo sugestões de drinks e promoções.' },
    ],
    competitors: ['WhatsApp do restaurante', 'Caderno', 'Sem reservas'],
    ctaText: 'Teste grátis no seu mexicano',
    metaDescription: 'Sistema de reservas para restaurantes mexicanos em São Paulo. Gerencie Taco Tuesday, happy hour e grupos com IA via WhatsApp.',
  },
  {
    slug: 'hamburguer-sao-paulo',
    cuisine: 'Hamburguerias',
    city: 'São Paulo',
    state: 'SP',
    painPoints: [
      { title: 'Filas enormes nos fins de semana', description: 'Hamburguerias artesanais de SP enfrentam filas de 40min+ nas sextas e sábados. Sem waitlist digital, clientes vão embora.' },
      { title: 'Delivery compete com o salão', description: 'Pedidos de iFood e Rappi competem com a cozinha do salão. Sem visibilidade de capacidade, os dois lados sofrem.' },
      { title: 'Menu rotativo confunde reservas', description: 'Burgers especiais da semana geram alta demanda pontual. Sem comunicação prévia, clientes se frustram quando acaba.' },
    ],
    stats: { noShowRate: '23%', avgTicket: 'R$ 50', peakHours: '19h–22h30', weeklyReservations: '200+' },
    faqs: [
      { question: 'A waitlist digital reduz mesmo a desistência?', answer: 'Clientes que recebem atualizações por WhatsApp sobre sua posição na fila têm 3x menos chance de desistir comparado a filas presenciais.' },
      { question: 'Funciona mesmo sem reserva obrigatória?', answer: 'Sim. Use o Seatable apenas para fila de espera digital, sem exigir reserva antecipada. Ideal para hamburguerias que preferem walk-in.' },
      { question: 'Consigo mostrar o menu especial da semana?', answer: 'A IA informa sobre o burger da semana, disponibilidade e pode até recomendar combos. Tudo via WhatsApp automático.' },
      { question: 'Como lidar com famílias com crianças?', answer: 'Configure áreas familiares com prioridade e tempo de mesa adequado. O chatbot pode perguntar se há crianças na reserva.' },
      { question: 'Tem versão mais barata para hamburgueria pequena?', answer: 'O plano Essencial (R$ 497/mês) é perfeito para operações com até 50 reservas/mês. Para alto volume, o Profissional oferece analytics e voz.' },
    ],
    competitors: ['Fila presencial', 'Caderno', 'Get In Line'],
    ctaText: 'Teste grátis na sua hamburgueria',
    metaDescription: 'Sistema de reservas para hamburguerias em São Paulo. Fila de espera digital, WhatsApp automático e gestão de walk-ins. Reduza desistências em 60%.',
  },
  {
    slug: 'vegano-sao-paulo',
    cuisine: 'Restaurantes Veganos',
    city: 'São Paulo',
    state: 'SP',
    painPoints: [
      { title: 'Público consciente exige transparência', description: 'Clientes veganos pesquisam antes de ir. Sem informações claras sobre ingredientes e processos, a desconfiança afasta potenciais clientes.' },
      { title: 'Eventos temáticos são frequentes', description: 'Jantares veganos temáticos, workshops de culinária e degustações são comuns. Cada evento tem logística diferente de reserva.' },
      { title: 'Base de clientes fiel mas nicho', description: 'Com público menor mas engajado, cada cliente vale muito. Perder um por experiência ruim na reserva é inadmissível.' },
    ],
    stats: { noShowRate: '10%', avgTicket: 'R$ 55', peakHours: '12h–14h, 19h–21h', weeklyReservations: '70+' },
    faqs: [
      { question: 'A IA responde perguntas sobre ingredientes?', answer: 'Sim. O chatbot é treinado com seu cardápio completo e responde sobre ingredientes, alérgenos, origem dos produtos e processos.' },
      { question: 'Funciona para eventos de degustação?', answer: 'Crie eventos especiais com vagas limitadas, menu fixo e cobrança antecipada. O Seatable gerencia inscrições e lista de espera.' },
      { question: 'Consigo segmentar clientes por preferência?', answer: 'O sistema registra preferências (vegano, crudívoro, sem glúten) e envia comunicações personalizadas sobre novos pratos relevantes.' },
      { question: 'Tem programa de fidelidade integrado?', answer: 'O Seatable rastreia frequência de visitas e permite criar campanhas de retenção segmentadas para seus clientes mais fiéis.' },
      { question: 'O chatbot entende o público vegano?', answer: 'Totalmente personalizável. O tom do chatbot reflete os valores do seu restaurante — sustentabilidade, bem-estar animal, saúde.' },
    ],
    competitors: ['Instagram', 'Google Forms para eventos', 'WhatsApp pessoal'],
    ctaText: 'Teste grátis no seu vegano',
    metaDescription: 'Sistema de reservas para restaurantes veganos em São Paulo. IA que entende ingredientes, gestão de eventos temáticos e fidelização de clientes.',
  },
];

// ─── Rio de Janeiro ────────────────────────────────────────────

const RJ_PAGES: readonly SeoPageData[] = [
  {
    slug: 'pizzaria-rio-de-janeiro',
    cuisine: 'Pizzarias',
    city: 'Rio de Janeiro',
    state: 'RJ',
    painPoints: [
      { title: 'Picos de demanda em dias de praia', description: 'Após um dia de sol, a demanda por pizza explode à noite. Sem previsão baseada em clima, a operação não se prepara.' },
      { title: 'Entrega e salão competem pela cozinha', description: 'No Rio, delivery de pizza é fortíssimo. Sem balanceamento entre salão e entrega, um dos dois sofre.' },
      { title: 'Turistas aumentam a imprevisibilidade', description: 'Bairros como Copacabana e Ipanema recebem turistas que não conhecem os costumes locais de reserva.' },
    ],
    stats: { noShowRate: '20%', avgTicket: 'R$ 60', peakHours: '19h30–23h', weeklyReservations: '160+' },
    faqs: [
      { question: 'O sistema se adapta a picos climáticos?', answer: 'O Seatable analisa padrões e sugere ajustes de capacidade. Em dias de praia no Rio, a demanda noturna é prevista automaticamente.' },
      { question: 'Funciona com delivery integrado?', answer: 'O foco é reservas de salão, mas integramos com iFood para visibilidade completa da operação.' },
      { question: 'A IA fala inglês para turistas?', answer: 'Sim. O chatbot detecta o idioma do cliente e responde em português, inglês ou espanhol automaticamente.' },
      { question: 'Consigo gerenciar filiais?', answer: 'Cada unidade tem seu painel independente, com dados isolados e configurações próprias.' },
      { question: 'Qual o ROI típico para pizzarias no Rio?', answer: 'Pizzarias que usam o Seatable reduzem no-shows em 40% e aumentam o giro de mesas em 25%, recuperando o investimento no primeiro mês.' },
    ],
    competitors: ['Caderno', 'WhatsApp', 'Telefone'],
    ctaText: 'Teste grátis na sua pizzaria carioca',
    metaDescription: 'Sistema de reservas para pizzarias no Rio de Janeiro. IA multilíngue, previsão de demanda e gestão de walk-ins via WhatsApp.',
  },
  {
    slug: 'churrascaria-rio-de-janeiro',
    cuisine: 'Churrascarias',
    city: 'Rio de Janeiro',
    state: 'RJ',
    painPoints: [
      { title: 'Turismo corporativo exige profissionalismo', description: 'Grupos de executivos estrangeiros esperam reservas confirmadas com antecedência. Falhas manuais afetam a reputação.' },
      { title: 'Almoço de domingo é caótico', description: 'A tradição carioca do churrasco de domingo gera filas imensas. Sem gestão digital, a equipe fica sobrecarregada.' },
      { title: 'Rodízio com muitas opções confunde o tempo', description: 'Com 15+ cortes no rodízio, prever o tempo de cada mesa é impossível sem dados históricos.' },
    ],
    stats: { noShowRate: '18%', avgTicket: 'R$ 90', peakHours: '12h–15h', weeklyReservations: '200+' },
    faqs: [
      { question: 'Funciona para turismo receptivo?', answer: 'Sim. O Seatable aceita reservas em 3 idiomas e permite pré-pagamento internacional via Stripe.' },
      { question: 'Como organizo o almoço de domingo?', answer: 'Configure capacidade especial para domingos, com turnos de 2h e waitlist automática por WhatsApp.' },
      { question: 'A IA sabe recomendar cortes?', answer: 'O chatbot pode informar os cortes disponíveis, sugerir harmonizações e apresentar o menu do rodízio.' },
      { question: 'Posso usar para eventos corporativos?', answer: 'Crie pacotes corporativos com menu fixo, salão reservado e faturamento. O sistema gerencia tudo desde a cotação.' },
      { question: 'Quanto tempo leva para implementar?', answer: 'Em 15 minutos. Cadastre seu restaurante, configure mesas e horários, e o WhatsApp AI já está funcionando.' },
    ],
    competitors: ['Telefone', 'Email corporativo', 'Agências de turismo'],
    ctaText: 'Teste grátis na sua churrascaria',
    metaDescription: 'Sistema de reservas para churrascarias no Rio de Janeiro. Gestão de rodízio, turismo corporativo e almoço de domingo com IA via WhatsApp.',
  },
  {
    slug: 'frutos-do-mar-rio-de-janeiro',
    cuisine: 'Restaurantes de Frutos do Mar',
    city: 'Rio de Janeiro',
    state: 'RJ',
    painPoints: [
      { title: 'Sazonalidade do pescado afeta o menu', description: 'Disponibilidade de peixes e frutos do mar muda semanalmente. Clientes reservam esperando pratos que podem não estar no cardápio.' },
      { title: 'Mesas com vista são disputadíssimas', description: 'Em restaurantes de frutos do mar à beira-mar, as mesas com vista valem ouro. Sem priorização, clientes VIP ficam insatisfeitos.' },
      { title: 'Almoço casual vs jantar sofisticado', description: 'O mesmo restaurante opera como casual no almoço e fine dining no jantar. Duas operações diferentes no mesmo espaço.' },
    ],
    stats: { noShowRate: '14%', avgTicket: 'R$ 110', peakHours: '12h–15h, 19h–22h', weeklyReservations: '80+' },
    faqs: [
      { question: 'Consigo diferenciar mesas por localização?', answer: 'Sim. Configure áreas como "vista mar", "salão interno" e "deck". Clientes escolhem na reserva e VIPs têm prioridade.' },
      { question: 'A IA informa sobre o pescado do dia?', answer: 'O chatbot pode enviar o menu atualizado com o pescado fresco do dia, incluindo sugestões de preparo e harmonização.' },
      { question: 'Funciona para almoço e jantar com preços diferentes?', answer: 'Configure menus e preços distintos para cada turno. O sistema ajusta automaticamente.' },
      { question: 'Como lidar com turistas de cruzeiro?', answer: 'A IA aceita reservas em inglês e espanhol, com confirmação por WhatsApp internacional.' },
      { question: 'Tem gestão de eventos como réveillon?', answer: 'Crie eventos especiais com ingressos, menu fixo e cobrança antecipada. Perfeito para réveillon na praia.' },
    ],
    competitors: ['Telefone', 'Booking de hotel', 'TripAdvisor'],
    ctaText: 'Teste grátis no seu restaurante',
    metaDescription: 'Sistema de reservas para restaurantes de frutos do mar no Rio de Janeiro. Gestão de mesas com vista, menu do dia e turismo multilíngue.',
  },
];

// ─── Curitiba ──────────────────────────────────────────────────

const CWB_PAGES: readonly SeoPageData[] = [
  {
    slug: 'italiana-curitiba',
    cuisine: 'Restaurantes Italianos',
    city: 'Curitiba',
    state: 'PR',
    painPoints: [
      { title: 'Santa Felicidade lota nos fins de semana', description: 'O polo gastronômico italiano de Curitiba recebe milhares de visitantes. Restaurantes sem sistema perdem clientes para a concorrência ao lado.' },
      { title: 'Turismo gastronômico é sazonal', description: 'Festivais como a Festa da Uva geram picos extremos. Sem previsão, mesas ficam vazias em dias normais e faltam em eventos.' },
      { title: 'Famílias grandes precisam de mesas combinadas', description: 'A tradição italiana em Curitiba envolve famílias de 10+ pessoas. Combinar mesas manualmente é lento e frustrante.' },
    ],
    stats: { noShowRate: '16%', avgTicket: 'R$ 75', peakHours: '19h–22h', weeklyReservations: '140+' },
    faqs: [
      { question: 'Funciona para restaurantes em Santa Felicidade?', answer: 'Perfeito. O Seatable gerencia o alto volume de fins de semana, com waitlist automática e previsão de demanda.' },
      { question: 'Consigo combinar mesas para grupos grandes?', answer: 'O sistema calcula automaticamente a melhor combinação de mesas para grupos, otimizando o espaço sem perder giro.' },
      { question: 'A IA entende pedidos em italiano?', answer: 'O chatbot pode ser configurado para usar termos italianos do cardápio (antipasto, primo piatto, dolce) naturalmente.' },
      { question: 'Tem como gerenciar buffet de domingo?', answer: 'Configure capacidade de buffet separada das mesas à la carte, com turnos e tempo máximo de permanência.' },
      { question: 'O sistema funciona offline?', answer: 'O dashboard funciona online, mas todas as reservas são confirmadas via WhatsApp, então os clientes nunca perdem a confirmação.' },
    ],
    competitors: ['Caderno', 'Telefone', 'Planilha compartilhada'],
    ctaText: 'Teste grátis no seu italiano em Curitiba',
    metaDescription: 'Sistema de reservas para restaurantes italianos em Curitiba. Gestão de Santa Felicidade, grupos familiares e alta demanda com IA via WhatsApp.',
  },
  {
    slug: 'cafe-curitiba',
    cuisine: 'Cafés e Bistrôs',
    city: 'Curitiba',
    state: 'PR',
    painPoints: [
      { title: 'Cultura de café exige experiência premium', description: 'Curitiba é a capital do café no Brasil. Clientes são exigentes e comparam cada detalhe da experiência.' },
      { title: 'Clima frio aumenta a permanência', description: 'No inverno curitibano, clientes ficam horas no café. Sem controle de permanência, o giro cai drasticamente.' },
      { title: 'Brunch artesanal tem lista de espera enorme', description: 'Cafés especiais com brunch artesanal lotam cedo. Sem waitlist digital, a fila na calçada afasta potenciais clientes.' },
    ],
    stats: { noShowRate: '18%', avgTicket: 'R$ 40', peakHours: '8h–11h, 15h–17h', weeklyReservations: '85+' },
    faqs: [
      { question: 'Funciona para café de especialidade?', answer: 'Ideal. O chatbot pode informar sobre métodos de preparo (V60, Chemex, espresso), grãos disponíveis e harmonizações.' },
      { question: 'Consigo limitar tempo de permanência no inverno?', answer: 'Configure política de tempo flexível. Em dias frios, estenda para 2h; em dias de alta demanda, reduza para 90min.' },
      { question: 'A IA gerencia reserva de espaço para estudo?', answer: 'Defina áreas específicas para trabalho/estudo com regras diferentes (tomada, silêncio) e tempo de permanência estendido.' },
      { question: 'Funciona com programa de fidelidade de café?', answer: 'O Seatable rastreia visitas e pode enviar cupons de fidelidade via WhatsApp após X visitas ou gasto acumulado.' },
      { question: 'Preciso de muitas mesas para usar?', answer: 'Não. O plano Essencial funciona perfeitamente para cafés com 10-20 mesas. Simplicidade é o foco.' },
    ],
    competitors: ['Instagram', 'Google', 'Sem sistema'],
    ctaText: 'Teste grátis no seu café em Curitiba',
    metaDescription: 'Sistema de reservas para cafés e bistrôs em Curitiba. Gestão de brunch, permanência e fidelidade de clientes com IA via WhatsApp.',
  },
];

// ─── Belo Horizonte ────────────────────────────────────────────

const BH_PAGES: readonly SeoPageData[] = [
  {
    slug: 'comida-mineira-belo-horizonte',
    cuisine: 'Restaurantes de Comida Mineira',
    city: 'Belo Horizonte',
    state: 'MG',
    painPoints: [
      { title: 'Self-service por quilo precisa de giro rápido', description: 'Restaurantes de comida mineira por quilo dependem de giro alto no almoço. Filas desorganizadas espantam clientes.' },
      { title: 'Almoço executivo tem janela curta', description: 'Das 11h30 às 14h, a demanda é altíssima. Sem previsão, a cozinha prepara demais ou de menos.' },
      { title: 'Tradição familiar exige atendimento caloroso', description: 'Comida mineira é sinônimo de acolhimento. Um sistema frio e genérico destoa da experiência que o cliente espera.' },
    ],
    stats: { noShowRate: '15%', avgTicket: 'R$ 40', peakHours: '11h30–14h', weeklyReservations: '200+' },
    faqs: [
      { question: 'Funciona para restaurante por quilo?', answer: 'Sim. Use o Seatable para gestão de fila de espera digital, sem exigir reserva formal. O cliente entra na fila pelo WhatsApp e é chamado quando tem vaga.' },
      { question: 'A IA tem sotaque mineiro?', answer: 'O chatbot pode ser personalizado com o tom acolhedor e informal que clientes de comida mineira esperam. Nada de linguagem corporativa.' },
      { question: 'Consigo prever a demanda do almoço?', answer: 'O dashboard analisa histórico de dias anteriores, clima e dia da semana para prever o número de covers no almoço.' },
      { question: 'Funciona para buffet de café da manhã?', answer: 'Configure turnos separados para café, almoço e jantar, cada um com capacidade e regras próprias.' },
      { question: 'O sistema é simples de usar?', answer: 'Interface intuitiva, em português, com suporte por WhatsApp. Setup em 15 minutos, sem treinamento necessário.' },
    ],
    competitors: ['Fila presencial', 'Sem sistema', 'Caderno do caixa'],
    ctaText: 'Teste grátis no seu restaurante mineiro',
    metaDescription: 'Sistema de reservas para restaurantes de comida mineira em BH. Fila digital, previsão de demanda e gestão de almoço executivo via WhatsApp.',
  },
  {
    slug: 'bar-belo-horizonte',
    cuisine: 'Bares e Botequins',
    city: 'Belo Horizonte',
    state: 'MG',
    painPoints: [
      { title: 'Botequins lotam sem aviso', description: 'A cultura de botequim em BH é espontânea. Quando bate aquela vontade de cerveja, o bar já está cheio.' },
      { title: 'Futebol muda toda a dinâmica', description: 'Jogos do Atlético e Cruzeiro transformam a demanda. Sem previsão por calendário esportivo, a operação não se prepara.' },
      { title: 'Mesas na calçada são limitadas e disputadas', description: 'Em BH, mesa na calçada é ouro. Sem reserva prioritária, clientes VIP ficam em pé.' },
    ],
    stats: { noShowRate: '28%', avgTicket: 'R$ 50', peakHours: '17h–23h', weeklyReservations: '180+' },
    faqs: [
      { question: 'Funciona para botequim sem reserva formal?', answer: 'Use apenas a fila de espera digital. O cliente entra na fila pelo WhatsApp e recebe uma mensagem quando a mesa está pronta.' },
      { question: 'A IA sabe quando tem jogo?', answer: 'O sistema pode ser configurado com calendário de eventos esportivos para ajustar capacidade e preparar a operação automaticamente.' },
      { question: 'Consigo reservar mesa na calçada?', answer: 'Configure áreas separadas (calçada, salão, balcão) com prioridades diferentes e capacidades independentes.' },
      { question: 'Funciona com petiscos e porções?', answer: 'O chatbot pode apresentar o cardápio de petiscos, sugerir porções para o tamanho do grupo e informar sobre promoções.' },
      { question: 'Tem versão para botequim simples?', answer: 'O plano Essencial (R$ 497/mês) é ideal. Waitlist por WhatsApp e dashboard básico, sem complicação.' },
    ],
    competitors: ['Chegar e sentar', 'WhatsApp pessoal', 'Sem sistema'],
    ctaText: 'Teste grátis no seu botequim',
    metaDescription: 'Sistema de reservas para bares e botequins em Belo Horizonte. Fila digital, gestão de dias de jogo e mesas na calçada via WhatsApp.',
  },
];

// ─── Brasília ──────────────────────────────────────────────────

const BSB_PAGES: readonly SeoPageData[] = [
  {
    slug: 'fine-dining-brasilia',
    cuisine: 'Fine Dining',
    city: 'Brasília',
    state: 'DF',
    painPoints: [
      { title: 'Clientela política exige discrição', description: 'Restaurantes fine dining de Brasília recebem políticos e diplomatas. Privacidade e discrição na reserva são essenciais.' },
      { title: 'Jantares oficiais cancelam de última hora', description: 'Mudanças na agenda política causam cancelamentos tardios. Sem política de no-show, o restaurante absorve o prejuízo.' },
      { title: 'Padrão internacional de serviço', description: 'Embaixadas e organismos internacionais esperam padrão europeu de reservas. Caderno de anotações não impressiona.' },
    ],
    stats: { noShowRate: '10%', avgTicket: 'R$ 300', peakHours: '20h–23h', weeklyReservations: '45+' },
    faqs: [
      { question: 'O sistema garante privacidade dos dados?', answer: 'Dados são criptografados, armazenados em servidores brasileiros (Supabase) e nunca compartilhados. Atendemos LGPD integralmente.' },
      { question: 'Funciona para jantares de embaixada?', answer: 'Crie reservas corporativas com faturamento, menu customizado e disposição de mesas especial. Tudo gerenciado pelo sistema.' },
      { question: 'A IA responde em francês?', answer: 'O chatbot suporta português, inglês e espanhol nativamente. Para outros idiomas, a IA se adapta ao idioma do interlocutor.' },
      { question: 'Posso cobrar taxa de cancelamento tardio?', answer: 'Sim. Configure política de cancelamento (24h, 48h) com cobrança automática via Stripe para no-shows e cancelamentos tardios.' },
      { question: 'O sistema é usado por restaurantes premiados?', answer: 'O Seatable atende restaurantes de todos os níveis, com interface premium que reflete a qualidade do seu estabelecimento.' },
    ],
    competitors: ['OpenTable', 'Secretária pessoal', 'Telefone direto'],
    ctaText: 'Agende uma demonstração',
    metaDescription: 'Sistema de reservas para fine dining em Brasília. Privacidade, jantares diplomáticos e padrão internacional com IA via WhatsApp.',
  },
  {
    slug: 'japonesa-brasilia',
    cuisine: 'Restaurantes Japoneses',
    city: 'Brasília',
    state: 'DF',
    painPoints: [
      { title: 'Rodízio japonês com muitas opções', description: 'Rodízios com 100+ itens geram permanência longa. Sem controle de tempo, o giro cai e a fila cresce.' },
      { title: 'Comunidade nikkei exige autenticidade', description: 'Brasília tem forte comunidade japonesa. O sistema de reservas precisa refletir essa sensibilidade cultural.' },
      { title: 'Delivery de sushi domina, salão perde', description: 'Apps de delivery estão levando clientes do salão. Sem experiência de reserva diferenciada, o salão não compete.' },
    ],
    stats: { noShowRate: '13%', avgTicket: 'R$ 100', peakHours: '19h–22h', weeklyReservations: '75+' },
    faqs: [
      { question: 'Funciona para rodízio japonês?', answer: 'Sim. Configure tempo de rodízio (90-120min), com alertas automáticos e gestão de fila de espera em tempo real.' },
      { question: 'A IA entende termos japoneses?', answer: 'O chatbot reconhece e usa termos como omakase, temaki, sashimi naturalmente, proporcionando uma experiência autêntica.' },
      { question: 'Consigo diferenciar preço do rodízio por horário?', answer: 'Configure preços diferentes para almoço e jantar, dias de semana e fins de semana. A IA informa o cliente no momento da reserva.' },
      { question: 'Tem como incentivar o cliente a vir ao salão?', answer: 'Use campanhas de retenção via WhatsApp com cupons exclusivos para salão, criando uma experiência que o delivery não oferece.' },
      { question: 'O sistema funciona com tablet na recepção?', answer: 'O dashboard responsivo funciona perfeitamente em tablets, ideal para o hostess gerenciar a operação na recepção.' },
    ],
    competitors: ['WhatsApp', 'Telefone', 'Sem reserva'],
    ctaText: 'Teste grátis no seu japonês em Brasília',
    metaDescription: 'Sistema de reservas para restaurantes japoneses em Brasília. Gestão de rodízio, termos japoneses e fidelização de clientes via WhatsApp.',
  },
];

// ─── Florianópolis ─────────────────────────────────────────────

const FLN_PAGES: readonly SeoPageData[] = [
  {
    slug: 'frutos-do-mar-florianopolis',
    cuisine: 'Restaurantes de Frutos do Mar',
    city: 'Florianópolis',
    state: 'SC',
    painPoints: [
      { title: 'Temporada de verão é 3x a demanda normal', description: 'De dezembro a março, Floripa recebe turistas que triplicam a demanda. Sem sistema escalável, o caos se instala.' },
      { title: 'Sequência de camarão exige reserva antecipada', description: 'A famosa sequência de frutos do mar precisa de preparo. Sem reserva, a cozinha não consegue atender a demanda.' },
      { title: 'Restaurantes em praias remotas são difíceis de achar', description: 'Clientes precisam de confirmação clara com localização e instruções de acesso. WhatsApp manual não resolve.' },
    ],
    stats: { noShowRate: '22%', avgTicket: 'R$ 95', peakHours: '12h–15h, 19h–22h', weeklyReservations: '120+' },
    faqs: [
      { question: 'Funciona na alta temporada?', answer: 'O sistema escala automaticamente. Seja 50 ou 500 reservas por semana, o Seatable gerencia sem falhas.' },
      { question: 'A IA envia localização e instruções de acesso?', answer: 'Sim. Após a confirmação, o chatbot envia GPS, dicas de estacionamento e instruções de como chegar ao restaurante.' },
      { question: 'Consigo gerenciar dois turnos de verão?', answer: 'Configure turnos estendidos para o verão (almoço longo, jantar tardio) e volte ao normal na baixa temporada com um clique.' },
      { question: 'Funciona para clientes argentinos e uruguaios?', answer: 'O chatbot responde em espanhol automaticamente, facilitando reservas de turistas do Mercosul.' },
      { question: 'Tem gestão de réveillon?', answer: 'Crie eventos especiais com ingresso, menu fixo e cobrança antecipada. Ideal para ceia de réveillon com vista para o mar.' },
    ],
    competitors: ['Telefone', 'TripAdvisor', 'Booking de hotel'],
    ctaText: 'Teste grátis no seu restaurante em Floripa',
    metaDescription: 'Sistema de reservas para restaurantes de frutos do mar em Florianópolis. Gestão de temporada, turismo multilíngue e sequência de camarão via WhatsApp.',
  },
];

// ─── Porto Alegre ──────────────────────────────────────────────

const POA_PAGES: readonly SeoPageData[] = [
  {
    slug: 'churrascaria-porto-alegre',
    cuisine: 'Churrascarias',
    city: 'Porto Alegre',
    state: 'RS',
    painPoints: [
      { title: 'Tradição gaúcha exige respeito ao costume', description: 'O churrasco gaúcho tem rituais próprios. Um sistema genérico não entende a cultura local.' },
      { title: 'Almoço de domingo é tradição familiar', description: 'Famílias inteiras vão à churrascaria no domingo. Grupos de 8-15 pessoas precisam de mesas combinadas com antecedência.' },
      { title: 'Frio intenso muda os padrões de consumo', description: 'No inverno gaúcho, a demanda por fondue e carnes nobres aumenta. Sem previsão sazonal, a operação não se adapta.' },
    ],
    stats: { noShowRate: '17%', avgTicket: 'R$ 80', peakHours: '12h–14h30, 19h–22h', weeklyReservations: '160+' },
    faqs: [
      { question: 'Funciona para churrasco gaúcho tradicional?', answer: 'O Seatable respeita a tradição. O chatbot pode apresentar os cortes no espeto, o buffet de saladas e as sobremesas típicas.' },
      { question: 'Consigo gerenciar reservas de família grande?', answer: 'O sistema combina mesas automaticamente para grupos de até 20 pessoas, com menu fixo opcional e depósito proporcional.' },
      { question: 'A IA entende a cultura gaúcha?', answer: 'Personalização total. O chatbot pode usar termos como "tchê", "guri" e "barbaridade" se desejar. Autenticidade é prioridade.' },
      { question: 'Funciona em dias de Grenal?', answer: 'Configure alertas para dias de Grenal com ajuste automático de capacidade e promoções especiais.' },
      { question: 'Tem como integrar com programa de pontos?', answer: 'O Seatable rastreia gastos e visitas, permitindo campanhas de fidelidade segmentadas por frequência e ticket médio.' },
    ],
    competitors: ['Caderno', 'Telefone', 'WhatsApp pessoal'],
    ctaText: 'Teste grátis na sua churrascaria gaúcha',
    metaDescription: 'Sistema de reservas para churrascarias em Porto Alegre. Tradição gaúcha, grupos familiares e gestão de domingo com IA via WhatsApp.',
  },
];

// ─── Salvador ──────────────────────────────────────────────────

const SSA_PAGES: readonly SeoPageData[] = [
  {
    slug: 'baiana-salvador',
    cuisine: 'Restaurantes de Comida Baiana',
    city: 'Salvador',
    state: 'BA',
    painPoints: [
      { title: 'Turismo o ano todo gera demanda constante', description: 'Salvador recebe turistas o ano inteiro, mas em volumes diferentes. Sem previsão, a operação ou desperdiça ou falta.' },
      { title: 'Pelourinho é disputadíssimo', description: 'Restaurantes no Pelourinho competem mesa a mesa. Quem tem sistema digital atrai mais reservas antecipadas.' },
      { title: 'Clientes internacionais precisam de tradução', description: 'Turistas de todo o mundo não entendem "moqueca" ou "acarajé". O atendimento manual não escala.' },
    ],
    stats: { noShowRate: '24%', avgTicket: 'R$ 65', peakHours: '12h–15h, 19h–22h', weeklyReservations: '110+' },
    faqs: [
      { question: 'A IA explica pratos baianos para turistas?', answer: 'Sim. O chatbot descreve cada prato em inglês e espanhol, com ingredientes, nível de pimenta e sugestões de acompanhamento.' },
      { question: 'Funciona para restaurante no Pelourinho?', answer: 'Ideal. Turistas que pesquisam no Google encontram seu restaurante com botão de reserva direta, antes de chegarem ao Pelourinho.' },
      { question: 'Consigo gerenciar carnaval?', answer: 'Configure capacidade especial para semanas de carnaval, com preços diferenciados e cobrança antecipada obrigatória.' },
      { question: 'O sistema funciona em 3G?', answer: 'O dashboard é otimizado para conexões lentas. Funciona bem em 3G e 4G, ideal para regiões com internet instável.' },
      { question: 'Tem gestão de quiosque de praia?', answer: 'Sim. Configure mesas ao ar livre com regras de tempo e capacidade diferentes. O cliente reserva pelo WhatsApp sem sair da praia.' },
    ],
    competitors: ['TripAdvisor', 'Booking.com', 'Instagram'],
    ctaText: 'Teste grátis no seu restaurante baiano',
    metaDescription: 'Sistema de reservas para restaurantes de comida baiana em Salvador. IA multilíngue, gestão de turismo e Pelourinho via WhatsApp.',
  },
];

// ─── Recife ────────────────────────────────────────────────────

const REC_PAGES: readonly SeoPageData[] = [
  {
    slug: 'nordestina-recife',
    cuisine: 'Restaurantes de Comida Nordestina',
    city: 'Recife',
    state: 'PE',
    painPoints: [
      { title: 'Almoço executivo é ultracompetitivo', description: 'Em Recife, dezenas de restaurantes competem pelo almoço executivo. Sem sistema digital, você perde para quem tem.' },
      { title: 'Tapiocarias e restaurantes regionais crescem rápido', description: 'O boom da culinária nordestina gera novos restaurantes toda semana. Diferenciar-se pela tecnologia é vantagem competitiva.' },
      { title: 'Carnaval de Olinda muda tudo', description: 'Nos dias de carnaval, restaurantes próximos a Olinda recebem 5x mais clientes. Sem escalabilidade, é impossível atender.' },
    ],
    stats: { noShowRate: '21%', avgTicket: 'R$ 45', peakHours: '11h30–14h', weeklyReservations: '130+' },
    faqs: [
      { question: 'Funciona para almoço executivo?', answer: 'Ideal. Configure reservas rápidas de 1h para almoço, com menu do dia enviado automaticamente via WhatsApp.' },
      { question: 'A IA apresenta comida regional para turistas?', answer: 'O chatbot descreve pratos como baião de dois, carne de sol e tapioca de forma atraente em inglês e espanhol.' },
      { question: 'Consigo usar no carnaval?', answer: 'Configure modo carnaval com capacidade estendida, preços especiais e cobrança antecipada. O sistema escala automaticamente.' },
      { question: 'Funciona com self-service?', answer: 'Use o Seatable para fila de espera digital em restaurantes de self-service. O cliente não precisa fazer reserva formal.' },
      { question: 'Quanto custa para restaurante pequeno?', answer: 'A partir de R$ 497/mês. Para restaurantes com até 50 reservas/mês, o plano Essencial oferece tudo que você precisa.' },
    ],
    competitors: ['Caderno', 'WhatsApp', 'Sem sistema'],
    ctaText: 'Teste grátis no seu restaurante em Recife',
    metaDescription: 'Sistema de reservas para restaurantes de comida nordestina em Recife. Almoço executivo, turismo regional e carnaval com IA via WhatsApp.',
  },
];

// ─── Combined export ───────────────────────────────────────────

export const SEO_PAGES: readonly SeoPageData[] = [
  ...SP_PAGES,
  ...RJ_PAGES,
  ...CWB_PAGES,
  ...BH_PAGES,
  ...BSB_PAGES,
  ...FLN_PAGES,
  ...POA_PAGES,
  ...SSA_PAGES,
  ...REC_PAGES,
];

/**
 * Lookup a page by its slug. Returns undefined if not found.
 */
export function findSeoPage(slug: string): SeoPageData | undefined {
  return SEO_PAGES.find((p) => p.slug === slug);
}

/**
 * Get pages related to the current one (same city or same cuisine type).
 * Excludes the current slug.
 */
export function getRelatedPages(currentSlug: string, limit = 4): readonly SeoPageData[] {
  const current = findSeoPage(currentSlug);
  if (!current) return [];

  const sameCityCuisines = SEO_PAGES.filter(
    (p) => p.slug !== currentSlug && p.city === current.city
  );
  const sameCuisineCities = SEO_PAGES.filter(
    (p) => p.slug !== currentSlug && p.cuisine === current.cuisine
  );

  // Interleave: prioritize same city, then same cuisine, avoiding duplicates
  const result: SeoPageData[] = [];
  const seen = new Set<string>();
  const sources = [sameCityCuisines, sameCuisineCities];

  for (let i = 0; result.length < limit; i++) {
    let added = false;
    for (const source of sources) {
      if (i < source.length && !seen.has(source[i].slug)) {
        seen.add(source[i].slug);
        result.push(source[i]);
        added = true;
        if (result.length >= limit) break;
      }
    }
    if (!added) break;
  }

  return result;
}
