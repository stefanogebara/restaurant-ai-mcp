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

### [DISCUTIR 11/15] "Português + WhatsApp" não é território vago — já tem ocupante brasileiro
**Data:** 2026-09-01 · **Eixos:** P3 A2 D2 E1 L3
**Fontes:** [Baguete, 26/ago](https://www.baguete.com.br/noticias/fogo-de-chao-automatiza-atendimento-com-foodster) · [Portal Filipe Mello, 27/ago](https://www.portalfilipemello.com/2026/08/fogo-de-chao-registra-mais-de-mil.html) · [foodster.ai](https://foodster.ai)
**Ponteiro de trabalho:** o spike de transbordo saiu daqui → `BACKLOG.md#whatsapp-transbordo-humano`

**O que é:** a Foodster (RJ) e a Wiv (ex-Blip, parceira Diamond) rodam no Fogo de Chão um agente de
WhatsApp via Meta Cloud API — reserva, fila, cardápio, cancelamento e transbordo humano — com
integração nativa ao **Tagme**. Eles não são donos da reserva: o Tagme é quem guarda reserva e fila.
O mecanismo comercial não é o modelo de IA, é **canal**: Blip como distribuição e Tagme como base
instalada de rede.

**Os números não sustentam o que parecem sustentar.** "12 mil usuários únicos" é a soma de únicos
*mensais* (2.558 + ~4k + 5.416) — o mesmo cliente contado três vezes; idem as 255 mil mensagens. Não
há baseline pré-IA nem controle, então nada atribui o +112% de contatos à IA em vez de mídia ou
sazonalidade. Os 76,7% de comparecimento são medidos pelo Tagme, não pela IA. E falta a métrica que
diria se o agente resolve ou empurra: taxa de transbordo. Baguete e Portal Filipe Mello são
reescritas do mesmo release; o foodster.ai não publica o case.

**Por que toca este projeto — e por que sobrevive à demolição dos números:** a `bets[0]` foi
reescrita em 2026-09-01 para dizer que a linha defensável é *"o loop está em português e começa num
canal que os americanos não têm — o WhatsApp"*. Isso descreve um espaço que **já tem ocupante
brasileiro com case público em rede nacional**, e o foodster.ai diz atender "restaurantes e redes",
não só rede. O que continua defensável é outra coisa: eles são a primeira camada em cima da reserva
alheia, enquanto aqui a reserva, a mesa, a receita (`api/_lib/pos/service-completion-core.js`) e o
`customer_ltv` são do próprio produto, mais voz PSTN e a Olímpia. O diferencial migra de **canal**
para **propriedade do dado**.

**Ressalva de escala, que corta nos dois sentidos:** Fogo de Chão é rede grande, e o público
declarado no config é restaurante independente de São Paulo. Isso enfraquece o item como ameaça
direta — e o fortalece como prova de que a camada está sendo ocupada de cima para baixo.

**A pergunta:** (a) a `bets[0]` vira *"o loop está em português **e o dado do cliente é nosso, não do
Tagme**"* — isto é, o diferencial deixa de ser canal e passa a ser propriedade do dado? (b) num
restaurante de SP que já usa Tagme, o Seatable entra como substituto ou como **leitor** — adicionar
`tagme` a `VALID_SOURCES` em `api/external-booking-webhook.js` e conviver, como a Saipos ficou de
conector de leitura no `settled` de 2026-09-01?

---

### [DISCUTIR 8/15] O servidor de voz de restaurantes paulistanos roda em Paris
**Data:** 2026-09-01 · **Eixos:** P2 A2 D1 E2 L1
**Fonte:** [Fly.io Status](https://status.flyio.net/) · [feed RSS](https://status.flyio.net/feed.rss)

**O que é:** cinco eventos de rede na Fly.io entre 26 e 31/08 — WireGuard gateway (26/08, só afeta
`flyctl`), **Anycast Edge Maintenance** (27/08, global, com o texto explícito *"long-running
connections like WebSocket required reconnection"*), packet loss em **GRU** (28/08), HTTP/2
disruptions (29–31/08) e 6PN Private Network Maintenance (31/08). Todos resolvidos, nenhum durou
horas.

**O achado está no repo, não na fonte:** o `fly.toml` tem `primary_region = 'cdg'` — **Paris**. O
incidente da manchete, o único de São Paulo, não tocou o app. Dos cinco, só o Anycast global de
27/08 morde de verdade, porque a chamada de voz é exatamente uma conexão longa
(Twilio Media Streams → `wss://seatable-voice.fly.dev/ws`).

**O que isso expõe é maior que o incidente:** cada turno de fala de um restaurante de SP paga
~180–200 ms de RTT transatlântico, permanentemente, no workload menos tolerante do produto — pior,
todo dia, que qualquer um desses cinco eventos. E não há como saber se algum deles derrubou uma
chamada: `getHealthStatus` (`api/_voice-server/ws-server.js:436`) devolve só
status/activeSessions/connectedClients/uptime — zero latência, zero contador de reconexão, zero
barge-in. Nada externo faz poll nele; `api/cron/health-alert` cobre os crons da Vercel e
`api/_lib/integration-probes.js` não menciona voz nem Fly. A fonte não prova impacto e o repo não
tem como desmentir.

**A pergunta:** mover para `gru` às cegas assumindo que geografia ganha, **instrumentar latência
primeiro** e decidir com número, ou aceitar `cdg` porque o gargalo real é o backend de IA
(OpenAI/ElevenLabs, ambos US/EU) e a perna Brasil→Paris é ruído perto disso? *Nota de bordo,
independente da resposta: o `fly.toml` aponta o build para `api/voice-server/Dockerfile`, caminho
que não existe — o deploy do servidor de voz está quebrado hoje.*

---

### [DISCUTIR 8/15] Um concorrente europeu de voz+WhatsApp já está na LATAM, mas não no Brasil
**Data:** 2026-09-01 · **Eixos:** P2 A1 D2 E1 L2
**Fontes:** [bookline.ai](https://bookline.ai/en/restaurants) · [ICF Capital, Série A 30/09/2025](https://www.icf.cat/en/actualitat/noticies/2025/bookline-tanca-ronda-serie-a-accelerar-expansio-internacional)

**O que é:** a Bookline (Barcelona, ~7 anos) vende camada conversacional para hotelaria — agente de
voz que atende o telefone, agente de WhatsApp e campanhas —, com a **voz como carro-chefe**. Não é
sistema de reservas: é overlay que grava dentro de TheFork, Cover Manager e Restoo. Série A de €3,5M
em 30/09/2025, 1.700+ clientes, 16 países.

**Duas correções que enfraquecem o item e o tornam mais útil:** o "€450M em reservas geridas" se
decompõe em **€100M de restaurante + €350M de hotel** — 78% do volume vem de fora do segmento
disputado. E a contagem de clientes diverge entre as fontes (1.200 no site, 1.500 na cobertura,
1.700 no release). Item **sem evento datado na janela**: é descoberta de nome, não notícia.

**Por que toca este projeto:** a `bets[2]` diz que o restaurante independente brasileiro é
subatendido pelos players **americanos**. A Bookline é europeia, e faz o mesmo par de canais que os
8 tools de `api/_voice-server/tool-handler.js` cobrem. Não refuta a aposta — mas o Brasil **não
aparece em nenhuma fonte primária**: as prioridades LATAM declaradas são México, Colômbia e Chile.
Somando ao overlay sobre booking europeu (TheFork/CoverManager não são players no Brasil) e à base
majoritariamente hoteleira, o restaurante independente de SP com WhatsApp-first segue descoberto.

**A pergunta:** a ausência do Brasil é barreira real — PT-BR, WhatsApp como canal primário, ausência
de TheFork/CoverManager aqui — ou é só sequenciamento de roadmap? Se for sequenciamento, quantos
meses de janela a `bets[2]` realmente tem, e a resposta é acelerar contrato âncora em SP ou
aprofundar o que eles não têm (o loop de dado do cliente, já vivo em
`api/_lib/pos/service-completion-core.js`)?

---

### [DISCUTIR 8/15] O Pix ganhou 80 dias de contestação, e a Olímpia vende Pix sozinha
**Data:** 2026-09-01 · **Eixos:** P1 A1 D2 E3 L1
**Fonte:** [IN BCB nº 766 — Manual do DICT v8.5](https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Instru%C3%A7%C3%A3o%20Normativa%20BCB&numero=766)

**O que é, com a imprensa corrigida em dois pontos:** a IN BCB 766/2026 publica a v8.5 do Manual
Operacional do DICT, cujo histórico de revisão traz *"Ampliação do prazo para contestação de
transação de devolução para 80 dias"*, alterando as seções 20.1.1, 20.1.9 e o passo 5 da 20.2. **A
vigência é 01/09/2026** pela redação da IN 767 — não 31/08, como saiu na imprensa. E o escopo é mais
estreito que a manchete: não é o prazo geral de contestação de fraude, é o prazo para contestar **por
fraude uma transação de devolução**. Coerente com a mudança irmã (atributo `TransactionDepth`, que
só entra em 26/10/2026): o BCB está construindo rastreamento de fraude em camadas.

**Por que toca este projeto — e não é onde parecia:** **não há Pix em nenhum fluxo de pagamento do
Seatable.** Os três caminhos de cobrança são Stripe-cartão, e `api/create-deposit-intent.js` usa
`capture_method: 'manual'`, que por construção exclui Pix — rail de push não tem autorização e
captura. O ponto de contato real é outro e é reputacional: o deck da Olímpia
(`api/_lib/prospecting/deck-html.js:80`) vende Pix como *"custa menos que crédito e cai no mesmo
dia"*, e **sai sozinho, sem humano**, sob o claim-linter — que é `settled` deste projeto. A
afirmação não é falsa (o dinheiro liquida mesmo no dia), mas fica incompleta agora.

**A pergunta:** isso merece regra nova no claim-linter, ou é ruído para um restaurante de SP que já
convive com chargeback de cartão? *Verificação de 10 minutos, independente da resposta:
`api/event-checkout.js` é o único endpoint com `currency: 'brl'` + `automatic_payment_methods`
ligado — o Pix pode estar aparecendo no PaymentElement por configuração de painel da Stripe, sem uma
linha de código.*

---

### [DISCUTIR 10/15] O whisper-1 sai do ar em 2027-02-26, e o repo usa em dois lugares
**Data:** 2026-08-31 · **Fontes:** [OpenAI, deprecations](https://developers.openai.com/api/docs/deprecations)
**Eixos:** P3 A2 D1 E2 L2

**O que é:** a OpenAI confirmou na doc oficial de deprecações que `whisper-1`, `gpt-4o-transcribe`,
`gpt-4o-mini-transcribe` e `gpt-4o-transcribe-diarize` foram notificados de descontinuação em
26/08/2026 e saem da API em **26/02/2027** (~6 meses de corda). Migração recomendada: `gpt-transcribe`
para áudio já gravado, `gpt-live-transcribe` para stream ao vivo.

**Por que toca este projeto:** `whisper-1` está hardcoded em dois lugares que batem na API nativa da
OpenAI (fora do OpenRouter, que só cobre chat/completions): dentro do `session.update` do backend de
voz OpenAI Realtime (`api/_voice-server/backends/openai-realtime.js:96`,
`input_audio_transcription: { model: 'whisper-1' }`) e no endpoint REST de transcrição
(`api/_lib/whatsapp-interactions.js:229`, função `transcribeVoiceMessage`, compartilhada entre o
webhook de WhatsApp do cliente e o inbound de áudio da Olímpia). Isso toca direto o `known_gaps`
sobre os dois motores de voz divergirem sem instrumentação — trocar o modelo de transcrição sem
cuidado no lado Realtime aprofunda essa divergência.

**O que a fonte não prova:** a doc não confirma se o campo `input_audio_transcription` da sessão
Realtime aceita os novos nomes de modelo como valor de `model`, nem se o endpoint REST
`/v1/audio/transcriptions` aceita o mesmo payload multipart sem mudar contrato. "Trocar a string em
duas linhas" é hipótese, não fato verificado.

**A pergunta:** vale um spike de poucas horas AGORA para confirmar compatibilidade de payload nos
dois caminhos (Realtime + REST), ou isso empilha atrás dos itens mais urgentes de voz já conhecidos
(VAD hardcoded, `fly.toml` apontando para caminho de build inexistente, PersonaPlex não
implementado)? Seis meses de prazo dão folga, mas nenhum dos dois usos tem teste hoje que pegaria
uma quebra silenciosa no dia da desativação.

---

**Absorvido em 2026-09-01** (candidato "a família gpt-4o-transcribe também cai" veio de novo e foi
DESCARTADO por duplicidade — o texto acima já a nomeava). Duas correções vieram do repositório, não
da fonte: **(1) "dois lugares" subconta.** `transcribeVoiceMessage` (`whatsapp-interactions.js:205`)
tem três consumidores — `api/_lib/channels/meta-adapter.js:99` (áudio do cliente),
`api/_lib/prospecting/prospect-inbound.js:68` (áudio de prospect da Olímpia) e a reexportação em
`:269`. São dois *call sites* da string `'whisper-1'`, mas **três caminhos de produto** quebram no
mesmo dia. **(2) É o lado Realtime que justifica o spike, não o REST.** O caminho REST monta
multipart com `file` + `model` + `language` e lê `result.text` — troca de string, superfície mínima.
No Realtime, `whisper-1` é valor de `input_audio_transcription` dentro do `session.update`
(`openai-realtime.js:85-105`), no mesmo objeto que carrega o `turn_detection: server_vad` hardcoded,
e nada documenta que o campo aceite `gpt-live-transcribe`. *Busca por `gpt-4o-transcribe` no código:
zero ocorrências — registrado para não reabrir este candidato uma terceira vez.*

---

### [DISCUTIR 9/15] A Owner.com prova a bets[0] em escala de US$2,3 bilhões
**Data:** 2026-08-31 · **Fontes:** [PR Newswire](https://www.prnewswire.com/news-releases/owner-raises-240m-led-by-goldman-sachs-alternatives-to-build-the-ai-native-platform-for-every-local-business-302862420.html) · [SiliconANGLE](https://siliconangle.com/2026/08/28/owner-raises-240m-for-its-restaurant-management-platform/)
**Eixos:** P2 A1 D2 E1 L3

**O que é:** a Owner.com captou Série D de US$240M (Goldman Sachs Alternatives, avaliação
US$2,3bi), já em >US$100M de ARR e com "mais localizações nos EUA que Domino's ou Taco Bell". A
plataforma nasceu como site+pedido online+POS próprio+app com loyalty para restaurante
**independente** americano, e embutiu atendimento telefônico por IA e geração de campanha como
mais um módulo de um pacote já maduro — não é um produto de voz que virou plataforma (como a
Palona), é uma plataforma que já era dona do POS e acrescentou a voz.

**Por que toca este projeto — sem fundir com o item da Palona (22/08):** são dois concorrentes
distintos executando a mesma `bets[0]` ("end-to-end vence ponto-a-ponto... quando o POS embutir
voz"), mas em estágios opostos — Palona é Série A começando pela voz e indo para operações em
redes; Owner é Série D já com POS próprio, mirando o mesmo público (**restaurante independente**)
que é a audiência do Seatable, mais próxima que a da Palona. Ataca também o mesmo ponto do item
Delivery Hero (24/08): o Manager AI daqui só tem `compare_periods` (leitura) em
`api/_lib/manager-agent.js`; a automação de campanha da Owner é exatamente a capacidade de
**escrita** que falta.

**O que a fonte não prova:** todos os números (ARR, +40% tráfego, +40% receita, 2x reorder) são
autodeclarados pela própria empresa no release, sem baseline nem auditoria externa. Owner.com não
tem reserva de mesa como núcleo — é pedido/delivery-style — e não há menção a Brasil ou expansão
com prazo.

**A pergunta:** (a) o Seatable deveria ampliar ambição para possuir mais da pilha (POS/pedido)
como a Owner fez, ou a aposta continua sendo ficar estreito em reserva+voz+CRM em português,
apostando que players americanos não localizam pro Brasil tão cedo (`bets[2]`)? (b) vale que a
automação de campanha (`api/retention-campaigns.js`, `api/cron/automated-campaigns.js`) vire
ferramenta de escrita do Manager AI agora, replicando o que a Owner já embala como feature única?

---

### [DISCUTIR 8/15] O OpenTable virou marketplace de 20+ parceiros de voz — e comoditizou o vendor isolado
**Data:** 2026-08-31 · **Fonte:** [PR Newswire](https://www.prnewswire.com/news-releases/opentable-launches-its-largest-suite-of-new-and-updated-product-features-for-restaurants-302860569.html)
**Eixos:** P2 A1 D2 E1 L2

**O que é:** o maior pacote de features já lançado pela OpenTable: mais de 20 parceiros de
voice AI de terceiros plugados na plataforma assentaram 3M comensais (+270% ano a ano) sem tirar
o host do salão; "Table Automations" ajusta mínimos de mesa por demanda ao vivo (2M+ automações em
teste); relatório em linguagem natural em teste; e integrações de descoberta com Google, ChatGPT,
Copilot, Perplexity e Alexa (17x mais comensais assentados via LLM ano a ano).

**Por que toca este projeto:** é o terceiro movimento em duas semanas (depois de Resy+Toast 13/08 e
Square+OpenTable 18/08, já registrados em 25/08) confirmando que incumbentes de reserva viram
camada de agregação — só que aqui o ângulo é o inverso: a OpenTable **não construiu voz própria**,
abriu para vendors de voz virarem módulo plugável. Isso é evidência a favor de `bets[0]` do lado do
incumbente americano: quem é dono do CRM/reserva sempre tem mais poder de barganha que um vendor
de voz isolado. `api/_lib/manager-agent.js` já expõe `compare_periods` — o "relatório em linguagem
natural" que a OpenTable testa é capacidade que o Seatable já tem em escala single-location.

**O que a fonte não prova:** todos os números são "dados internos da OpenTable" num release, sem
metodologia, amostra nem auditoria externa. "Table Automations" e o relatório em linguagem natural
seguem em teste, sem data de disponibilidade geral.

**A pergunta:** o padrão "voz vira módulo plugável dentro de quem é dono do CRM" confirma que o
Seatable deveria continuar sendo dono do motor de voz (não terceirizar), ou vale explorar um
"Table Automations" próprio (mínimos de mesa dinâmicos por demanda), que hoje não existe em nenhuma
linha do código?

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

**Absorvido em 2026-09-01 — o prazo venceu hoje e não saiu número.** Abri a página-mãe de pricing
nesta data e confirmei: os rates por país da cobrança de service message de 01/10 **não estão
publicados**; a seção de 01/10 fala só de ajuste de utility/authentication em nove países e repete
*"Meta will announce to-be rates no later than September 1, 2026"*. A mesma página segue afirmando
*"Effective November 1, 2024 – Service conversations are now free for all businesses"*. **Correção
ao relato que trouxe o item: a Meta não furou o prazo — ele vence hoje**, e a ausência de número é
evidência negativa, não medição. Detalhe que muda o cálculo: o `known_gap` de roteamento hardcoded
(`send-reminders.js` sempre Twilio, `campaignService.js` sempre Meta) **não afeta esta exposição** —
lembrete e campanha saem como *template*, já cobrado hoje; o que 01/10 encarece é o free-form dentro
da janela de 24h, que passa pelos três adapters igualmente. *Nota lateral, do candidato do Meta
Business Agent (DESCARTADO — o preço de US$2/1M tokens segue sem respaldo, e já tinha sido derrubado
em 25/08): a "ativação gratuita" acabou — a doc agora diz que mensagens do agente da Meta não são
entregues sem método de pagamento configurado.*

**A pergunta ganha urgência:** o desenho de atendimento muda **agora** para fechar conversa em menos
turnos, com a tarifa utility BR corrente como piso conservador, ou o produto entra em 01/10 sem
número, contando por conversa e reprecificando depois? E: alguém checa com o BSP se a WABA já tem
tarifa de service no rate card privado — o BSP costuma receber o CSV antes da doc pública.

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

Promovidos em 2026-09-01:

- [PROTOTIPAR 12/15] Travar o payload de criação do agente ElevenLabs → `BACKLOG.md#elevenlabs-payload-snapshot`
  · âncora: `api/_services/elevenlabsAgentService.js:891`, `api/__tests__/elevenlabs-tool-cleanup.test.js`
  · o fornecedor virou dois defaults em 24/08 e nada travou — é o `known_gap` do snapshot ausente acontecendo
- [PROTOTIPAR 11/15] Transbordo humano no canal de hóspede → `BACKLOG.md#whatsapp-transbordo-humano`
  · âncora: `api/_services/whatsapp/reservation-tools.js`, `api/_lib/channels/message-processor.js`
  · única capacidade que a Foodster anuncia e o repo não tem; `handoff` só existe na prospecção

Promovido em 2026-08-31:

- [PROTOTIPAR 11/15] Lembretes e campanhas de WhatsApp em lote (Twilio Bulk Messaging) → `BACKLOG.md#twilio-bulk-lembretes`
  · âncora: `api/cron/send-reminders.js`, `api/_services/campaignService.js`

Promovidos em 2026-08-24, os quatro com âncora verificada:

- [PROTOTIPAR 12/15] Descobrir se a rota de POS brasileiro ainda existe → `BACKLOG.md#saipos-portao`
  · âncora: `database/migrations/20260126_pos_and_revenue.sql`, `api/pos/table-status.js`
  · **spike rodado em 25/08: portão aberto em toda fonte pública** — doc de mesa/comanda
    viva, critérios de homologação puramente técnicos, credenciamento self-serve, zero
    menção ao iFood, changelog ativo depois das duas aquisições. Falta o cadastro em si,
    que é chamada comercial. Achado colateral: **não existe adaptador Saipos** — o doc de
    julho que diz o contrário está errado.
- [PROTOTIPAR 11/15] Tornar o restaurante legível por agente (UCP) → `BACKLOG.md#ucp-catalogo-legivel`
  · âncora: `api/square.js`, `api/_lib/seo-schema.js`
- [PROTOTIPAR 11/15] A reserva que chega sem telefone → `BACKLOG.md#identidade-reserva-externa`
  · âncora: `api/external-booking-webhook.js`, `api/_lib/pos/service-completion-core.js`
- [PROTOTIPAR 11/15] A conversa de evento que fecha com pagamento → `BACKLOG.md#tool-evento-privado`
  · âncora: `api/_lib/tool-handlers.js`, `api/event-checkout.js`

## Radar

- `2026-09-01` **Takeat (ES) captou R$15M em 02/02/2026** (DGF/Quartzo/FUNSES; 3.000 casas
  autodeclaradas) para PDV + delivery + KDS + fiscal + CRM com IA de WhatsApp — **sem reserva e sem
  voz**. Não invalida a `bets[2]`, que fala de players *americanos*; arranha a premissa de que o
  espaço está vazio. O que interessa é o canal: compraram distribuição por comunidade (Marcelo
  Marani, Donos de Restaurantes), que compete com o outbound frio da Olímpia pelo mesmo dono — sem
  nenhum número de conversão publicado. [Startups.com.br](https://startups.com.br/negocios/rodada-de-investimento/capixaba-takeat-capta-r-15m-para-emplacar-saas-para-restaurantes/) · 7/15
- `2026-09-01` **Stripe remove `payment_method_types` de Payment/SetupIntents — em versão *preview*,
  não GA.** O repo não fixa `apiVersion` em nenhuma das 15 inicializações, então roda no default
  estável `2025-09-30.clover` do `stripe@19.1.0`, e seus dois PaymentIntents já usam
  `automatic_payment_methods`. Nada a migrar até optar pelo preview. O bloqueio irmão de Connect
  atinge só plataformas **novas** com direct charge sobre contas legacy — `stripe-connect-onboarding.js`
  cria `type: 'standard'` com destination charge. [Stripe](https://docs.stripe.com/changelog/dahlia/2026-08-26/removes-payment-method-types-parameter-from-payment-intents-setup-intents) · 6/15
- `2026-09-01` **Twilio rotaciona o certificado end-user de todos os endpoints REST em 09/09/2026**,
  mantendo raiz e intermediária. O repo não faz pinning nem carrega bundle de CA: zero
  `.pem`/`.crt`, zero `NODE_EXTRA_CA_CERTS`, SDK `twilio@^5.10.3` sem cliente HTTP custom nos 11
  call sites. Nada a fazer. *Achado lateral: `scripts/apply-migration.js:53` roda com
  `ssl: { rejectUnauthorized: false }` numa conexão Postgres do Supabase.*
  [Twilio](https://www.twilio.com/en-us/changelog/REST-API-endpoints-rotated-September-9,-2026) · 5/15
- `2026-09-01` **ElevenLabs: Procedures em GA** (instrução por tarefa com gatilho) — o movimento de
  maior consequência arquitetural do changelog de 24/08, e o único que não foi triado nesta passada.
  O repo monta system prompt monolítico + 5 tools de webhook + 8 tools de voz; instrução por tarefa
  é candidata direta ao `known_gap` das tools ausentes de evento privado e takeout. **Pede triagem
  própria na passada seguinte.** [ElevenLabs](https://elevenlabs.io/docs/changelog/2026/8/24) · a triar
- `2026-09-01` **`context_usage` da ElevenLabs NÃO fecha o buraco de instrumentação de voz** — reporta
  modelo, tokens do prompt e limite de contexto (custo e inchaço), não latência nem barge-in. E é
  evento de *cliente realtime*: o caminho PSTN deste repo entrega a chamada ao pipeline gerenciado
  (`api/twilio-voice-connect.js:286`), então só chegaria no widget da demo — onde o allowlist
  `client_events` nem o inclui. [ElevenLabs](https://elevenlabs.io/docs/changelog/2026/8/24) · 4/15

- `2026-08-31` **Ringg (Índia) capta US$10M, expande voz para WhatsApp/chat** — mesma tese do
  `bets[0]` (voz virando plataforma multicanal), mas horizontal (fintech/e-commerce/healthcare:
  Cred, Groww, Flipkart, Practo) e fora do Brasil — sinal mais fraco que o caso Palona (restaurante,
  EUA), já em DISCUTIR. Números de volume e clientes são autodeclarados pelo founder.
  [TechCrunch](https://techcrunch.com/2026/08/25/indias-ringg-gets-backing-from-peak-xv-as-it-pushes-voice-ai-past-the-phone-call/) · 5/15
- `2026-08-31` **Banco Central estuda usar recebíveis futuros do Pix como garantia de crédito, Pix
  internacional e reforço de antifraude por IA** — toca o fluxo de caixa de qualquer restaurante que
  recebe majoritariamente por Pix; nenhuma âncora de código hoje (Seatable não processa Pix
  diretamente, só Stripe Connect). [Agência GBC](https://agenciagbc.com/2026/08/29/banco-central-estuda-mudancas-no-pix-que-podem-transformar-pagamentos-no-brasil/) · 6/15
- `2026-08-31` **Pix já é 20,5% das vendas presenciais de bares e restaurantes no Brasil** (vs. 16,5%
  em 2024), pesquisa Abrasel — adesão maior em negócios pequenos (30,4% até R$130mil/ano). Dado de
  mercado que reforça a lacuna: o Seatable não aceita Pix em nenhum fluxo de depósito/pagamento.
  [Agência Brasil](https://agenciabrasil.ebc.com.br/economia/noticia/2026-08/pix-amplia-participacao-nos-pagamentos-em-bares-e-restaurantes) · 6/15
- `2026-08-31` **Agente de cobrança por IA da TIM no WhatsApp chegou a 2 milhões de clientes**, com
  25% dos acordos fechados fora do horário comercial — case de referência de agente conversacional
  autônomo em produção no Brasil, fora do escopo de restaurante mas prova de escala local para o
  padrão que o Manager AI/Olímpia já seguem. [Mobile Time](https://www.mobiletime.com.br/noticias/19/08/2026/tim-ia-whatsapp-cobranca/) · 6/15
- `2026-08-25` **ANPD notificou 22 plataformas sob os Decretos 12.975/12.976 e o ECA Digital** — 13 de rede social/mensageria e 9 de loja de app / IA generativa (inclui Claude, ChatGPT, Gemini, Meta AI), com 10 dias úteis para responder sobre prevenção a conteúdo criminoso. **Não alcança este projeto:** o critério é difusão ou intermediação *pública* de conteúdo de terceiros, e a notificação restringe o WhatsApp aos "canais públicos" — funcionalidade que nenhum dos três adapters toca. Base legal é Marco Civil/ECA, não LGPD. Interessa como mudança estrutural: a ANPD passou de normatizadora a fiscal operacional, nomeando fornecedores de IA. [ANPD](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-avalia-como-plataformas-digitais-atuam-para-prevenir-conteudos-criminosos-e-proteger-criancas-e-mulheres-na-internet) · 7/15
- `2026-08-25` **"SaaSpocalypse": rede de 8 lojas construiu o próprio pacote de ops com LLM** — a Keva fez onboarding, checklists e previsão de inventário internamente e projeta US$ 30 mil/ano de economia em assinaturas. Três ressalvas que esvaziam a manchete: n=1, economia **projetada e não medida**, e o construído é ops de rede — não reserva, não voz, não CRM de cliente. Starbucks e Mod Pizza estão no título só por serem as outras manchetes do mesmo episódio de podcast. Se morde alguém, morde SaaS de ops multi-unidade, não atendimento por voz para independente que não tem time técnico. [NRN](https://www.nrn.com/quick-service/starbucks-mod-pizza-and-the-potential-for-a-saaspocalypse) · 5/15
- `2026-08-25` **Vercel troca o toggle "Sensitive" por tipos Config e Secret** — variáveis existentes migram sozinhas, flags `--sensitive`/`--no-sensitive` seguem mapeando, sem prazo e sem impacto em runtime. O único efeito real: a policy de time "Enforce Sensitive Environment Variables" **deixou de ser aplicada** pela CLI, substituída por "Separate Production Secret Values" — relevante só porque o `update-vercel-env.sh` da raiz escreve env vars direto em produção. [Vercel](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types) · 6/15
- `2026-08-24` **Brendi capta US$ 6,6 mi para pedido por WhatsApp** — 7.100 casas e 420 mil pedidos/semana autodeclarados, o que dá ~8,5 pedidos por dia por restaurante; 85% da base em cidades pequenas; anjo Patrick Sigrist (iFood). É delivery próprio, não reserva nem voz telefônica. **Não invalida a `bets[2]`** — a aposta fala de players *americanos* subatenderem o Brasil, e uma startup brasileira crescendo confirma a premissa. Ocupa o ativo transacional e o topo do funil da Olímpia. *Teto REGISTRAR pela trava G1: nenhuma fonte primária abriu — o site bloqueou com Cloudflare em duas tentativas e os três veículos repetem o texto da empresa palavra por palavra.* [cobertura](https://www.latamrepublic.com/brendi-lands-us-6-6m-led-by-propel-ventures-to-transform-restaurant-ordering/) · 9/15, travado
- `2026-08-24` **Salão Abrasel, 15–16/09 na Bienal do Ibirapuera** — 1ª edição, entrada grátis para associado, expectativa *do organizador* de 12 mil visitas de donos de bar e restaurante; apresentado por Ambev, Keeta e Stone. A vitrine de IA é só back-of-house (estoque, CMV, cocção) — nenhum expositor faz voz, reserva ou CRM. Nenhum arquivo do repo muda; é decisão de agenda e expira em 16/09.
  **Atualizado em 2026-09-01** (o item voltou à triagem e foi descartado por dedup): a **Goomer** está
  entre os 60+ expositores confirmados — única do mapa de concorrentes, e adjacente, não direta;
  ingresso de visitante R$349–499 (1 dia) / R$599–899 (2 dias), **grátis para associado Abrasel**;
  estande sem preço nem prazo público. Decidir ir como visitante expira ~14/09. [Abrasel](https://abrasel.com.br/noticias/noticias/salao-abrasel-5-motivos-para-participar-do-evento/) · 7/15

## Arquivo

### [RESOLVIDO 2026-09-01] O loop integrado deixou de ser exclusividade de quem é um produto só

**Decisão do Stefano em 2026-09-01, respondendo (a):** **o `saipos-portao` NÃO é
promovido a espinha do roadmap.** Saipos fica como **conector de leitura** —
ocupação de mesa, para o salão dizer a verdade — e não como espinha.

O motivo é mecânico, não de apetite: o loop que a Resy e a Toast fecharam só
fecha porque **a Toast é dona do pagamento** e o Digital Chit devolve o gasto.
A Saipos dá ocupação de mesa e **não dá a conta** — `solicitar-fechamento-mesa`
não registra pagamento, só pinta a mesa de laranja para o garçom (por isso o
adaptador do PR #69 é só leitura, e por decisão). "O único loop dentro do POS
que a casa já usa" sairia com a metade de sentar e sem a metade da receita.

A metade da receita já entra por uma porta mais barata e agnóstica de
fornecedor: o push por API-key (`api/pos/service-completion.js` +
`api/_lib/api-key-auth.js`) e o `total_bill` manual no Complete Service.
Nenhuma delas depende de a Saipos documentar coisa alguma — e ela não documenta
nem a própria rota de auth.

**O que muda na `bets[0]` é o adjetivo, não a aposta:** end-to-end deixa de ser
**diferencial** e vira **piso**. A linha defensável em SP não é "end-to-end" nem
"dentro do POS" — é que o loop está em português e começa num canal que os
americanos não têm, o WhatsApp.

**(b) foi respondida em 2026-08-31** e o trabalho shipou no PR #106: era fiação,
não construção, e não dependia de POS nenhum. Ver a correção dentro do item
arquivado abaixo.

<details>
<summary>Item original, como foi triado em 2026-08-25</summary>

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
Manager AI**, não a tela do garçom.

**CORREÇÃO de 2026-08-31 — a primeira redação dizia que o equivalente ao Digital Chit
"não existe no salão". Está errado.** Ele existia inteiro e estava ligado no lugar
errado: `CustomerProfileDrawer` busca `/api/guest-context` e `/api/ltv`, e a
`ReservationsList` já aceitava `onCustomerClick` e já pintava o `CustomerTierBadge` com
`visit_count`. A fiação estava **só na `DemoDashboard.tsx`** — o `Dashboard.tsx` do
restaurante pagante importava a mesma lista, não passava a prop e não montava o drawer.
O perfil do cliente na hora de sentar era **mostrado ao prospect na demo e sonegado a
quem paga**, e o nome do cliente ainda renderizava como `<button>` com hover: afordância
que parecia clicável e não abria nada. Ligado no pagante em 2026-08-31, com um guarda de
paridade (`client/src/pages/__tests__/guestProfileParity.test.ts`) que exige que as duas
telas andem juntas — nem tipo, nem lint, nem teste de unidade pegava a omissão de uma
prop opcional.

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
(b) ~~E a perna que falta aqui é a de **leitura no salão**: o Digital Chit equivalente
entra agora, ou fica esperando o POS brasileiro existir?~~ **RESPONDIDA em 2026-08-31:
entrou agora, e não custou o que o item supunha — era fiação, não construção, e não
dependia de POS nenhum (ver a correção acima).** Fica de pé só (a).

</details>

---
