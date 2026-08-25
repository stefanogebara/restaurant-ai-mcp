# Intel — Seatable

> Atualizado por `/intel`. Config em `intel.config.json`, rubrica em
> `.claude/skills/intel/references/rubric.md`.
>
> **Nota da primeira passada (2026-08-22):** rodada sem acesso ao repositório,
> então a trava "nomear arquivo real do repo" está ativa e nada passou de
> DISCUTIR. Semana pesada em concorrente e leve em técnica — isso naturalmente
> produz mais DISCUTIR e menos PROTOTIPAR, porque notícia de mercado vira
> decisão de posicionamento, não experimento.

## Em aberto — precisa de decisão do Stefano

### [DISCUTIR 9/15] O loop integrado deixou de ser exclusividade de quem é um produto só
**Data:** 2026-08-25 · **Eixos:** P2 A1 D2 E1 L3
**Fontes primárias:** [Resy newsroom, 13/ago](https://blog.resy.com/newsroom/resy-toast-integration-digital-chits/) · [Square/OpenTable, 18/ago](https://www.nasdaq.com/press-release/square-and-opentable-deepen-strategic-partnership-unified-dining-guest-and-payment) · cobertura: [NRN](https://www.nrn.com/restaurant-technology/square-and-toast-deepen-their-ties-to-reservations-partners)

**O que é:** dois movimentos gêmeos em seis dias. Em 13/08 a Resy integrou-se aos Digital
Chits da Toast: notas de guestbook, preferências, histórico de visitas e ocasião especial
aparecem **em tempo real na tela do POS e no handheld**, no lugar da comanda impressa e do
repasse do host para o garçom — a Resy se declara "a única plataforma de reserva terceira
com integração de duas vias". Em 18/08 a Square ampliou para "preferred partner" com a
OpenTable, juntando comportamento de reserva (OpenTable) com itens, gasto e meio de
pagamento (Square) numa visão única de guest, opt-in em EUA, Canadá, Reino Unido,
Austrália, Irlanda e França. O único número em qualquer das duas fontes é a Resy citando o
próprio 2026 Regulars Report: até 50% do volume vem de 7% dos clientes, e só 30% dos
clientes dizem se sentir reconhecidos.

**Por que toca este projeto:** é literalmente o loop que este repo já roda —
`api/_lib/pos/service-completion-core.js` grava `service_records` → `revenue_records` →
upsert em `customer_ltv`, e `api/_services/restaurantSnapshot.js` lê de volta
`is_regular` / `visit_count` / preferências. Só que aqui isso alimenta **o prompt do
Manager AI**, não a tela do garçom. O equivalente ao Digital Chit — o perfil do cliente
aparecendo no momento de sentar, via `api/guest-profile.js` — não existe no salão.

**Ameaça a tese, não o mercado — e a distinção importa:** Brasil não está na lista
geográfica da Square, e a Resy depende do POS da Toast, que não opera em SP. O
`CHECK IN ('manual','square','toast','clover','other')` em
`database/migrations/20260126_pos_and_revenue.sql` é inteiro americano. O dono em
Pinheiros não perde nada este mês. O que se perde é tempo: agora existem **dois
precedentes de referência** para um POS brasileiro copiar, e quando Saipos ou Consumer
copiarem, o caminho genérico de push por API-key (`api/pos/service-completion.js` +
`api/_lib/api-key-auth.js`) decide se o Seatable é o parceiro de dado desse POS ou o
substituído por ele.

**O que a fonte não prova:** as duas são release, não documentação — nenhum payload,
latência, esquema de API ou tier. A Square **não** afirma bidirecionalidade; quem afirma
"duas vias" é a Resy sobre a Toast. Boa parte do que a imprensa descreveu como feito está
no release como "future enhancements". Zero dado de adoção, zero efeito medido sobre
ticket, retenção ou no-show. É por isso que o item para em DISCUTIR: não há experimento
honesto a rodar contra um release sem API.

**Não funde com o [DISCUTIR 11/15] de 22/08** (DoorDash/SevenRooms, Amex/Tock): aquele é
consolidação de capital do lado da demanda, plataforma de reserva comprando plataforma de
reserva para acumular guestbook. Este é interoperabilidade do lado da operação, o POS
puxando o guestbook alheio para o salão e devolvendo o gasto. Mesmo prêmio, mecanismos
distintos — referência cruzada, não fusão.

**A pergunta:** a `bets[0]` supõe que o loop integrado só existe dentro de um produto
único, e dois pares de concorrentes acabaram de montá-lo por parceria. (a) O diferencial
em SP continua sendo "end-to-end", ou vira "o único loop que existe em português, dentro
do POS que a casa já usa" — o que promove `saipos-portao` de spike a espinha do roadmap?
(b) E a perna que falta aqui é a de **leitura no salão**: o Digital Chit equivalente entra
agora, ou fica esperando o POS brasileiro existir?

---

### [DISCUTIR 10/15] Os dois motores de voz vão divergir em turn-taking
**Data:** 2026-08-24 · **Eixos:** P3 A2 D2 E1 L2
**Fontes:** [ElevenLabs, 03/ago](https://elevenlabs.io/docs/changelog/2026/8/3) · [Twilio, 06/ago](https://www.twilio.com/en-us/changelog/twilio-voice-js-sdk-noise-cancellation-reference-components)

**O que é:** os dois fornecedores da stack de voz publicaram, com três dias de diferença,
tratamento para o mesmo buraco. A ElevenLabs adicionou um objeto `vad` ao schema do agente
com `background_voice_detection` (booleano, default `false`), que faz o agente distinguir
voz de fundo da voz do interlocutor para não tomar turno com conversa alheia. O Twilio
publicou componentes de referência de cancelamento de ruído com RNNoise (open source) ou
Krisp (proprietário).

**Por que toca este projeto — com uma correção:** o `known_gaps` dizia "sem VAD". **Está
errado e foi corrigido no config.** `api/_voice-server/backends/openai-realtime.js` já
configura `turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300,
silence_duration_ms: 500 }` — só que hardcoded, igual para todo restaurante, nunca medido.

**O que a fonte não prova, e é decisivo:** a metade do Twilio **não se aplica**. Ela opera
sobre `MediaStream` de navegador (Voice JS SDK, softphone), e aqui o ruído chega já
codificado em mu-law 8 kHz no `audio-converter.js`, via Media Streams → Fly.io. Não há
`@twilio/voice-sdk` em nenhum `package.json`. Portar RNNoise — projetado para quadros de
48 kHz — para dentro do pipeline seria trabalho nosso, não componente de prateleira. E
nenhuma das duas fontes traz um único número: nada sobre português, nada sobre 8 kHz,
nenhuma taxa de falsa ativação.

**A pergunta:** se a flag da ElevenLabs entrar, os dois motores divergem em turn-taking e
qualquer comparação entre eles fica contaminada. O próximo ciclo de voz gasta em
**instrumentar primeiro** — latência e barge-in errado entrando no `result` de
`voice_experiments`, e uma chave de VAD em `VALID_VARIANT_KEYS`, que hoje aceita só
`agent_name`, `agent_greeting`, `speed` e `voice_id` — ou em ligar a flag às cegas num
restaurante barulhento e julgar de ouvido? E o ruído no caminho PSTN: aceita ficar com o
que o motor fizer, ou vale investigar RNNoise dentro do `audio-converter.js` no Fly.io?

---

### [DISCUTIR 9/15] O gateway de LLM e o trilho de pagamento viraram a mesma empresa
**Data:** 2026-08-24 · **Eixos:** P2 A2 D2 E1 L2
**Fontes:** [Stripe Newsroom](https://stripe.com/newsroom/news/stripe-agrees-to-acquire-openrouter) · [blog da OpenRouter](https://openrouter.ai/blog/announcements/openrouter-is-joining-stripe/)

**O que é:** a Stripe adquire a OpenRouter, declarando que quer os dois lados da economia
unitária de IA — o custo do token comprado e a receita cobrada por token, fundindo o
roteamento ao produto Token Billing.

**Por que toca este projeto:** o Seatable já opera esse loop à mão. `api/_lib/ai-client.js`
grava custo real de token em `public.ai_spend` via `usage:{include:true}` da OpenRouter, e
`api/_lib/stripe-usage-reporter.js` fatura `seatable_ai_call` e `seatable_manager_ai` por
Stripe Meter Events. Custo e receita de token — exatamente os dois lados que a Stripe diz
que vai fundir. Some a isso o trilho de repasse em BRL do restaurante (Stripe Connect
Standard, `country=BR`) e são três dependências antes independentes num fornecedor só.

**O que a fonte não prova:** o release da Stripe não tem **uma linha** sobre neutralidade,
estabilidade de API ou preço — as promessas existem só no blog da OpenRouter, sem prazo,
sem métrica, sem cláusula. Nenhuma das três fontes discute take rate.

**O que a aterrissagem mostrou:** o acoplamento de inferência é **raso** — uma `baseURL`
hardcoded em `api/_lib/ai-client.js`, endpoint OpenAI-compatible, e o caminho de saída já
existe e é telemetrado (402 → fallback Anthropic → `ai_provider_fallbacks`). O lock-in real
não é inferência, é **observabilidade de custo**: `cost_details` alimentando `ai_spend` e as
sondas proprietárias `/api/v1/key` e `/api/v1/credits` de que o `MotorStrip.tsx` depende.

**A pergunta:** o `settled` "OpenRouter é o provedor único" foi decidido por custo, quando
a OpenRouter era um fornecedor sem relação com o resto da pilha. A concentração vira
ressalva — manter a reserva Anthropic financiada e tornar a `baseURL` configurável por env
— ou vira vantagem deliberada: um fornecedor, uma fatura, reconciliação custo↔receita de
graça pelo Token Billing?

---

### [DISCUTIR 9/15] O agregador virou copiloto de operação do dono
**Data:** 2026-08-24 · **Eixos:** P2 A2 D2 E1 L2
**Fonte:** [release da Delivery Hero (EQS), 13/ago](https://www.eqs-news.com/news/corporate/delivery-hero-launches-agentic-ai-assistant-to-help-local-shops-and-restaurants-grow-faster/7fec4e44-4d65-4f45-9ed7-ec935776b0f7_en)

**O que é:** um agente que vive no WhatsApp do dono, aceita texto, áudio e imagem, lê o
desempenho do parceiro (venda por prato, demanda do bairro, atividade de concorrente,
avaliações) e devolve recomendação de campanha, promoção, correção de foto e rascunho de
resposta a review. A diferença de postura é a execução: **aprovada a sugestão, o próprio
agente aplica a mudança na plataforma.** 40 mil parceiros hoje, alvo de ~1,5 milhão.

**Por que toca este projeto:** o Manager AI daqui hoje **só aconselha**. `MANAGER_TOOLS` em
`api/_lib/manager-agent.js` tem **uma** ferramenta, `compare_periods`, de leitura, e as
"recommendations" de `api/predictive-analytics.js` são strings que ninguém executa. O
branch `stop_reason === 'tool_use'` já está escrito, esperando ferramenta de escrita.

**O que a fonte não prova:** os +15% de pedidos citados no Glovo não têm baseline, janela,
amostra nem controle. E a Delivery Hero **não opera no Brasil** sob marca própria — o
PedidosJá foi vendido ao iFood em 2018. A ameaça é indireta, via o acionista comum Prosus e
o iFood. O próprio `.claude/plans/2026-07-27-teardown-integracoes/README.md` já lista a
"Cris" do iFood e a Anota AI como concorrentes diretos de IA no WhatsApp.

**A pergunta:** duas decisões. (1) O copiloto de operação vira feature de retenção embutida
no plano, ou continua SKU cobrável atrás de quota mensal, como está hoje em
`api/manager-chat.js`? (2) Vale abrir agora ferramentas de **escrita** com passo de
aprovação no `manager-agent` — e nesse caso o `claim-linter` passa a ser portão de **ação**
e não só de texto — ou salão, reserva e CRM são território que o agregador não alcança, e
a resposta certa é não competir nessa superfície?

---

### [DISCUTIR 10/15] A partir de 01/10 não sobra caminho gratuito no WhatsApp
**Data:** 2026-08-24 · **Eixos:** P3 A2 D3 E2 L1
**Fonte primária:** [Meta, "Pricing for non-template messages"](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages)

**O que é:** a doc da Meta afirma verbatim que *"Effective October 1, 2026, Meta will
charge for service messages, which have not been charged since November 2024"* e que
passará a cobrar *"utility messages sent in response to users within an open 24-hour
customer service window"*, na mesma tarifa de utility do país. A janela de 72h de free
entry point (Click-to-WhatsApp) permanece gratuita. As tarifas por país saem até
**01/09/2026**.

**Correção de registro:** este item foi inicialmente **descartado** nesta mesma passada,
por um scout que leu a página-mãe `/whatsapp/pricing` e concluiu que a alegação dos
fornecedores de BSP era falsa. Ela não é. **A doc da Meta se contradiz em duas páginas
vivas ao mesmo tempo** — a página-mãe não foi atualizada e ainda diz que utility em janela
aberta é grátis. Quem ler só ela conclui o oposto. O veredito foi corrigido de DESCARTAR
para DISCUTIR.

**Por que toca este projeto:** o Seatable tem três adapters de WhatsApp
(`api/_lib/channels/{meta,twilio,waha}-adapter.js`) e o canal é primário no produto. Toda
resposta dentro da janela de 24h — que é a maior parte do atendimento conversacional —
passa a ser cobrada por mensagem.

**O que a fonte não prova:** as tarifas de outubro **não existem ainda**. Qualquer cifra
hoje é extrapolação da tarifa utility corrente. Nenhuma das duas páginas da Meta carrega
data de "last updated", e o changelog oficial devolveu HTTP 500 — não foi possível carimbar
quando a Meta publicou a mudança.

**A pergunta:** o custo por conversa de WhatsApp entra na conta unitária do plano a partir
de outubro. Vale esperar a tarifa BR de 01/09 para reprecificar, ou o desenho de
atendimento já deveria mudar agora para fechar conversa em menos turnos? E existe
monitoramento da saúde de billing da WABA — porque a partir de 01/10 uma falha de cobrança
deixa de silenciar só template e passa a silenciar o atendimento inteiro.

---

**Absorvido em 2026-08-25 — a terceira página viva, e um boato desmentido.** Um item novo
sobre a política de preço da Meta para "AI Providers" foi analisado e **funde-se aqui**:
mecanismo distinto, mesmo movimento (a Meta reprecificando tráfego não-template), mesma
decisão, mesmo arquivo. Score mantido em 10.

*O que se confirmou na [fonte primária](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/ai-providers):*
a Meta cobra "AI Providers" **por mensagem não-template entregue**, não por token. A
definição vem do ToS de 15/01/2026 e alcança *assistente de propósito geral* — não
assistente de um negócio específico. Vigência real: 16/02/2026 na Itália, **11/03/2026 no
Brasil (+55), ainda vigente**, e 11/03 a 12/05/2026 em 29 países europeus, revogado na
Europa em 13/05. O tráfego aparece como `pricing_category: "AI_BOT"` na Pricing Analytics
API e `"category": "general_purpose_ai"` no webhook de status.

*O que se desmentiu, para não voltar à fila:* não existe cobrança de US$ 2,00 por milhão
de tokens, não existe vigência 01/08/2026, e não é cobrança do Business Agent da Meta —
esse segue de ativação gratuita.

*A contradição cresceu para três páginas.* A página de AI Providers afirma que os demais
negócios seguem **não** sendo cobrados por não-template em janela aberta — o oposto do que
a página de non-template messages promete para 01/10. Nenhuma das três carrega data de
publicação.

**O acionável que serve às duas políticas, verificado no código:**
`api/_lib/channels/meta-adapter.js` descarta todo webhook de status na linha
`if (!value?.messages) return null;`, e `grep` por `pricing_category|general_purpose_ai|AI_BOT`
em `api/` devolve **zero** ocorrências. O repo nunca lê como a Meta está classificando e
cobrando esta WABA. Ligar essa leitura dá de uma vez o alarme de reclassificação AI_BOT e
a telemetria de custo por conversa que 01/10 vai exigir.

**Segunda pergunta, então:** o Seatable atende cliente final com LLM próprio numa WABA
brasileira. A leitura literal do ToS diz que ele **não** é "AI Provider" — é assistente de
um negócio específico —, mas quem enquadra é a Meta, e o Brasil está na lista vigente
desde 11/03. Vale escrever essa fronteira e checar com o BSP, ou é preocupação para
arquivar?

---

### [DISCUTIR 8/15] Qual é o teto de concorrência do workspace ElevenLabs?
**Data:** 2026-08-24 · **Eixos:** P2 A2 D1 E2 L1
**Fonte:** [ElevenLabs changelog, 17/ago](https://elevenlabs.io/docs/changelog/2026/8/17)

**O que é:** a plataforma ganhou `queueing` (`AgentQueueingConfig`) com `enabled` e
`wait_timeout_seconds` até 1.800s — com fila ligada, o chamador espera quando o agente bate
o teto de concorrência, em vez de ser recusado. Na mesma entrada,
`BackgroundSoundConfig.volume` passou de 0.6 para 0.15 e `crossfade_loop` para `true`.

**A premissa de regressão silenciosa não se sustentou.** `background_sound` é opt-in por
`source_id`, e `grep` no repo inteiro devolve **zero** ocorrências — os três criadores de
agente (`api/elevenlabs-agent-create.js` em dois caminhos e
`api/_services/elevenlabsAgentService.js`) enviam `platform_settings` contendo apenas
`widget_config`. A mudança de default é **inerte** aqui.

**O que sobrou, e é real:** a `ELEVENLABS_API_KEY` é uma só para todos os inquilinos, então
o teto de concorrência é **compartilhado** — e o código não trata recusa em lugar nenhum.

**A pergunta:** qual é o teto do workspace no plano atual, e alguma casa já perdeu ligação
por bater nele? Sem esse número e sem um caso real, ligar `queueing` é capacidade sem
demanda — e segurar um cliente de restaurante em espera pode ser pior que dar sinal de
ocupado.

*(Achado lateral que não virou item: existe um preset de `background_sound` chamado
`restaurant`. É ideia de produto, não regressão — mas adicionar ruído ambiente de propósito
antes de instrumentar qualidade seria contraindicado, dado o `known_gaps` de ruído de
salão.)*


### [DISCUTIR 11/15] Alguém está fazendo o seu movimento, com US$ 20 milhões
**Data:** 2026-08-22 · **Eixos:** P3 A1 D2 E2 L3
**Fonte:** [Restaurant Technology News, 18/ago](https://restauranttechnologynews.com/2026/08/palona-ai-expands-beyond-voice-ordering-with-new-restaurant-operations-platform-and-20-million-in-funding/)

**O que é:** a Palona AI levantou US$ 20 milhões em Série A e saiu de pedido
por voz para uma plataforma de operações completa, com um Catering Agent que
atende telefone, texto, web e e-mail no mesmo cérebro. Já roda em Din Tai Fung,
Giordano's e Mountain Mike's Pizza.

**Por que toca este projeto:** é literalmente a aposta nº 1 do
`intel.config.json` — *"end-to-end vence ponto-a-ponto"* — sendo executada por
outra pessoa, com capital e logos. A tese está certa; o que muda é que ela
deixou de ser insight e virou corrida. E eles subiram por cima de pedido, que
é um volume que o Seatable não tem.

**O que a fonte não prova:** são redes americanas de médio porte. Nada sobre
português, nada sobre restaurante independente, nada sobre pagamento na mesa.
O Racha continua sendo uma peça que eles não têm.

**A pergunta:** você corre a mesma corrida (empilhar canais até virar
plataforma) ou vira pra onde eles não vão — o independente brasileiro, com o
fechamento da conta como porta de entrada em vez do telefone? As duas são
defensáveis; fazer as duas ao mesmo tempo, não.

---

### [DISCUTIR 11/15] Os incumbentes já entenderam que o prêmio é o dado
**Data:** 2026-08-22 · **Eixos:** P1 A1 D3 E2 L3
**Fontes:** [Boston Globe, 17/ago](https://www.bostonglobe.com/2026/08/17/lifestyle/reservation-platforms-sevenrooms-opentable-resy/) · [Restaurant Technology News, 13/ago](https://restauranttechnologynews.com/2026/08/mcdonalds-unifies-data-from-nearly-220-million-loyalty-users-as-global-ai-strategy-takes-shape/)
*(dois itens fundidos — mesmo movimento)*

**O que é:** as plataformas de reserva estão disputando restaurantes com bônus
de assinatura de seis dígitos, depois de o DoorDash comprar a SevenRooms por
US$ 1,2 bilhão e a Amex pagar US$ 400 milhões pela Tock. Um restaurateur
resume no Globe: *"é menos sobre reservas e tudo sobre os dados"*. Em paralelo,
o McDonald's está consolidando quase 220 milhões de usuários de fidelidade em
70 mercados — mais de US$ 40 bilhões em vendas atribuídas em 12 meses — num
data lake global, com a estratégia de IA prometida pro Investor Day de 23/09.

**Por que toca este projeto:** confirma a aposta nº 2 — *"o dado do cliente do
restaurante é o ativo, não a chamada atendida"* — e mostra que quem tem
bilhões chegou lá antes. A implicação prática é sobre `known_gaps[1]`: hoje o
Seatable não fecha o loop de dado entre reserva, atendimento e Racha. Enquanto
não fechar, o produto é três features, não um CRM.

**O que a fonte não prova:** é tudo mercado americano e rede grande. O
independente de São Paulo não tem ninguém consolidando o dado dele — que é
justamente a brecha.

**A pergunta:** o loop de dado (reserva → atendimento → Racha → volta pro
perfil do cliente) entra agora como a espinha do produto, ou continua sendo
consequência de features que você vai costurando? Se entra agora, ele
reordena o roadmap inteiro.

---

### [DISCUTIR 10/15] Conector MCP como forma de entregar o dado do restaurante
**Data:** 2026-08-22 · **Eixos:** P2 A3 D2 E1 L2
**Fonte:** [GlobeNewswire, 11/ago](https://www.globenewswire.com/news-release/2026/08/11/3342785/0/en/marginedge-secures-80-million-in-series-d-funding-to-power-the-next-generation-of-restaurant-operations.html)

**O que é:** a MarginEdge anunciou US$ 80 milhões em Série D liderada por
Schooner e Ten Coves, chegando a US$ 162 milhões captados e mais de 13 mil
restaurantes. O detalhe que interessa não é a rodada: eles embarcaram um
conector MCP que expõe os dados do restaurante ao ChatGPT e ao Claude.

**Por que toca este projeto:** o Seatable já usa MCP tools na stack, então isto
não é técnica nova — é um padrão de distribuição. O dono do restaurante
pergunta "como foi meu sábado?" no assistente que ele já usa, e a resposta vem
do seu banco. Custo de implementação baixo, e transforma o Seatable de
aplicativo que ele precisa abrir em fonte que ele consulta de onde já está.

**O que a fonte não prova:** é press release de rodada. Nada sobre adoção do
conector, nada sobre o que ele realmente expõe.

**A pergunta:** vale expor um servidor MCP do Seatable pro dono do restaurante
agora, como canal de leitura — ou isso é distração antes de o loop de dado
existir e ter o que valer a pena ler?

## Fila de trabalho

Promovidos em 2026-08-24, os quatro com âncora verificada:

- [PROTOTIPAR 12/15] Descobrir se a rota de POS brasileiro ainda existe → `BACKLOG.md#saipos-portao`
  · âncora: `database/migrations/20260126_pos_and_revenue.sql`, `api/pos/table-status.js`
- [PROTOTIPAR 11/15] Tornar o restaurante legível por agente (UCP) → `BACKLOG.md#ucp-catalogo-legivel`
  · âncora: `api/square.js`, `api/_lib/seo-schema.js`
- [PROTOTIPAR 11/15] A reserva que chega sem telefone → `BACKLOG.md#identidade-reserva-externa`
  · âncora: `api/external-booking-webhook.js`, `api/_lib/pos/service-completion-core.js`
- [PROTOTIPAR 11/15] A conversa de evento que fecha com pagamento → `BACKLOG.md#tool-evento-privado`
  · âncora: `api/_lib/tool-handlers.js`, `api/event-checkout.js`

## Radar

- `2026-08-25` **ANPD notificou 22 plataformas sob os Decretos 12.975/12.976 e o ECA Digital** — 13 de rede social/mensageria e 9 de loja de app / IA generativa (inclui Claude, ChatGPT, Gemini, Meta AI), com 10 dias úteis para responder sobre prevenção a conteúdo criminoso. **Não alcança este projeto:** o critério é difusão ou intermediação *pública* de conteúdo de terceiros, e a notificação restringe o WhatsApp aos "canais públicos" — funcionalidade que nenhum dos três adapters toca. Base legal é Marco Civil/ECA, não LGPD. Interessa como mudança estrutural: a ANPD passou de normatizadora a fiscal operacional, nomeando fornecedores de IA. [ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-avalia-como-plataformas-digitais-atuam-para-prevenir-conteudos-criminosos-e-proteger-criancas-e-mulheres-na-internet) · 7/15
- `2026-08-25` **"SaaSpocalypse": rede de 8 lojas construiu o próprio pacote de ops com LLM** — a Keva fez onboarding, checklists e previsão de inventário internamente e projeta US$ 30 mil/ano de economia em assinaturas. Três ressalvas que esvaziam a manchete: n=1, economia **projetada e não medida**, e o construído é ops de rede — não reserva, não voz, não CRM de cliente. Starbucks e Mod Pizza estão no título só por serem as outras manchetes do mesmo episódio de podcast. Se morde alguém, morde SaaS de ops multi-unidade, não atendimento por voz para independente que não tem time técnico. [NRN](https://www.nrn.com/quick-service/starbucks-mod-pizza-and-the-potential-for-a-saaspocalypse) · 5/15
- `2026-08-25` **Vercel troca o toggle "Sensitive" por tipos Config e Secret** — variáveis existentes migram sozinhas, flags `--sensitive`/`--no-sensitive` seguem mapeando, sem prazo e sem impacto em runtime. O único efeito real: a policy de time "Enforce Sensitive Environment Variables" **deixou de ser aplicada** pela CLI, substituída por "Separate Production Secret Values" — relevante só porque o `update-vercel-env.sh` da raiz escreve env vars direto em produção. [Vercel](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types) · 6/15
- `2026-08-24` **Brendi capta US$ 6,6 mi para pedido por WhatsApp** — 7.100 casas e 420 mil pedidos/semana autodeclarados, o que dá ~8,5 pedidos por dia por restaurante; 85% da base em cidades pequenas; anjo Patrick Sigrist (iFood). É delivery próprio, não reserva nem voz telefônica. **Não invalida a `bets[2]`** — a aposta fala de players *americanos* subatenderem o Brasil, e uma startup brasileira crescendo confirma a premissa. Ocupa o ativo transacional e o topo do funil da Olímpia. *Teto REGISTRAR pela trava G1: nenhuma fonte primária abriu — o site bloqueou com Cloudflare em duas tentativas e os três veículos repetem o texto da empresa palavra por palavra.* [cobertura](https://www.latamrepublic.com/brendi-lands-us-6-6m-led-by-propel-ventures-to-transform-restaurant-ordering/) · 9/15, travado
- `2026-08-24` **Salão Abrasel, 15–16/09 na Bienal do Ibirapuera** — 1ª edição, entrada grátis para associado, expectativa *do organizador* de 12 mil visitas de donos de bar e restaurante; apresentado por Ambev, Keeta e Stone. A vitrine de IA é só back-of-house (estoque, CMV, cocção) — nenhum expositor faz voz, reserva ou CRM. Nenhum arquivo do repo muda; é decisão de agenda e expira em 16/09. [Abrasel](https://abrasel.com.br/noticias/noticias/salao-abrasel-5-motivos-para-participar-do-evento/) · 7/15

## Arquivo

_vazio_
