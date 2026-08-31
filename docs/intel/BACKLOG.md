# Backlog de intel — Seatable

Promovidos pela passada de 2026-08-24, a primeira com o repositório aberto. Os quatro
têm âncora verificada. Estado do repositório em `STATE.md`.

---

### ucp-catalogo-legivel — Tornar o restaurante legível por agente
**Origem:** INTEL 2026-08-24 · **Veredito:** PROTOTIPAR 11/15 (P2 A2 D3 E1 L3)
**Fonte:** [blog do Google, 06/ago](https://blog.google/products-and-platforms/products/maps/order-food-in-ask-maps/) · [PYMNTS](https://www.pymnts.com/news/artificial-intelligence/2026/square-and-google-let-restaurants-offer-conversational-ai-ordering/) · [PPC Land](https://ppc.land/google-maps-gains-food-ordering-through-square-and-toast/)

**O mecanismo:** o Ask Maps resolve restrição em linguagem natural e adiciona o prato ao
carrinho, roteando o pedido pelo **POS** — Square e Toast no lançamento — e não por
agregador. Do lado do comerciante o trabalho é zero: seller Square com Google Business
Profile entra automaticamente, com cardápio, horário e local sincronizando do Dashboard,
*"with no added setup, contracts, or fees necessary"*. O Google enquadra como
co-desenvolvimento de um "Universal Commerce Protocol for Food", variante do UCP que já
existe publicamente desde jan/2026 — spec no GitHub sob Apache-2.0, integração por um
JSON público em `/.well-known/ucp`.

**Correção de premissa:** o pedido é **só nos EUA**. Os "150+ países" são do Ask Maps em
geral; o blog diz literalmente que o pedido está "rolling out now in the U.S.". Não há
prazo para o Brasil em nenhuma das três fontes.

**Por que dói mesmo assim:** é a `bets[0]` acontecendo — *"quem só atende telefone vira
commodity quando o POS embutir voz"*. A defesa registrada no `STATE.md` seria estar dentro
do POS, e o Google acabou de distribuir essa voz de graça exatamente pelos dois provedores
que estão no `CHECK` de `pos_provider`. E nenhuma fonte diz quem fica com o dado do
cliente do pedido feito pelo agente, o que põe a `bets[1]` em risco não medido.

**Hipótese:** se o Seatable persistir o catálogo do Square que **já busca e descarta**, e
publicar o restaurante como dado legível por agente, um cliente vira endereçável sem
depender de POS americano — e isso é observável em consulta de nível de prato.

**Spike (1 dia), um restaurante piloto:**
1. Trocar o descarte em `handleCatalogSync` de `api/square.js` por gravação numa tabela
   `menu_items` — hoje ele filtra `foodItems` e grava só a contagem em `pos_connections`.
2. Adicionar `restaurantSchema`/`menuSchema` em `api/_lib/seo-schema.js` (hoje só emite
   `SoftwareApplication`, `FAQPage` e `Article` — nenhum `Restaurant`, `Menu` ou
   `OrderAction`) e emitir na página servida por `api/seo/city-cuisine.js`.
3. Publicar um `/.well-known/ucp` mínimo declarando só descoberta, sem checkout.
4. Consultar Ask Maps e Gemini com 5 formulações de um prato que só essa casa serve.

**Medir:** ≥90% dos objetos ITEM do Square persistidos (hoje é **0%**) e o restaurante
retornado em ≥3 das 5 formulações.

**Parar se:** `/.well-known/ucp` exigir aprovação de Merchant Center ou entidade nos EUA,
ou se 0 das 5 consultas surfar a casa dentro do timebox. Aí não é jogada de POS — vira
item de SEO comum e volta pra fila de `api/seo/`, sem tocar a camada de POS.

**Toca:** `api/square.js`, `api/_lib/seo-schema.js`, `api/seo/city-cuisine.js`, `database/migrations/20260126_pos_and_revenue.sql`, `supabase/migrations/20260412_pos_connections.sql`
**Status:** aberto

---

### saipos-portao — Descobrir se a rota de POS brasileiro ainda existe
**Origem:** INTEL 2026-08-24 · **Veredito:** PROTOTIPAR 12/15 (P3 A2 D3 E1 L3)
**Fonte:** [institucional do iFood](https://institucional.ifood.com.br/restaurantes/ifood-investe-em-empresas/) · [Bloomberg Línea, 29/abr](https://www.bloomberglinea.com.br/tech/do-delivery-ao-salao-do-restaurante-ifood-adquire-100-da-startup-de-reservas-get-in/)

**O mecanismo:** em 29/04/2026 o iFood comprou 100% da Get In (reservas + gestão de fila)
e lançou o "iFood para Comer Fora", pondo reserva, check-in, desconto e cashback de salão
dentro do app de delivery, com piloto em Campinas e Curitiba. A Get In é a ponta de
aquisição de demanda de um stack montado por baixo: a página institucional do próprio
iFood confirma **Saipos, OPDV e 3S Checkout** como investidas, ao lado da Anota AI, do
iFood Pago e do quiosque iFood Salão.

**Correção de premissa:** Saipos/OPDV/3S foram anunciadas em **abril de 2025**, um ano
antes da Get In. Não é o mesmo pacote — é a mesma tese em duas ondas: primeiro o PDV,
depois a demanda.

**Por que dói:** a Saipos é um dos três POS de SP nomeados no `known_gaps` como não
integrado. Se o iFood é dono, a pergunta de integração deixa de ser técnica e vira
política. E o próprio `.claude/plans/2026-07-27-teardown-integracoes/README.md` já
classifica a Get In como **concorrente** do Seatable.

**Hipótese:** se o iFood fechou o portão de parceiro da Saipos a terceiros que competem em
reserva e salão, o credenciamento da Order API — hoje documentado como 5 dias úteis, token
em 1 — não conclui, ou o sandbox não libera. Aí a rota Saipos está **morta**, não pendente.

**Spike (4h de trabalho ativo + janela de espera de 5 dias úteis):** submeter
credenciamento de parceiro na Saipos Order API como Seatable, declarando o caso de uso
real (ler mesa e comanda para reserva e service completion). Em paralelo, reexecutar a
sondagem que o teardown já documentou contra o sandbox com as credenciais atuais, para
separar "nunca funcionou" de "parou de funcionar".

**Medir:** binário. Token emitido e sandbox respondendo array de mesa em ≤5 dias úteis =
rota viva, e aí vale estender o `CHECK` de `pos_provider` para incluir `saipos`. Sem
resposta, recusa, ou exigência de aprovação comercial do iFood = rota morta.

**Parar se:** o credenciamento exigir contrato ou aprovação do iFood — parar imediatamente
e **não** estender o enum. A decisão vira escolher entre Cielo LIO e Abrahão como rota
genérica, e isso é chamada do Stefano, não spike. Parar também se passar de 4h de trabalho
ativo: o valor aqui é o sinal de portão aberto ou fechado, não a integração.

**Toca:** `database/migrations/20260126_pos_and_revenue.sql`, `api/pos/reservations.js`, `api/pos/table-status.js`, `api/check-availability.js`, `.claude/plans/2026-07-27-teardown-integracoes/README.md`
**Status:** **FECHADO em 2026-08-25 — rota VIVA, confirmada contra o sandbox**

#### Veredito: rota viva

O Stefano credenciou; a sonda rodou. Critério binário do spike **atingido**:
token emitido e `sale-status-by-table-or-pad` devolvendo array com HTTP 200 em 4/4
chamadas contra a loja de teste (arrays vazios = mesas livres, que é sucesso).
`CHECK` de `pos_provider` estendido para aceitar `saipos` em
`database/migrations/20260825_pos_provider_saipos.sql` — até então o enum era
inteiramente americano, e nenhum dos provedores operava em São Paulo.

#### A rota de autenticação que a Saipos não documenta

O maior custo do spike não foi o portão, foi descobrir como autenticar. **A primeira
versão da sonda estava errada**: assumia que a chave do painel era um token estático de
API. Não é. O fluxo real:

```
POST /auth   { "idPartner": "<Id Partner>", "secret": "<chave do painel>" }
  → 200 { "token": "<JWT>" }, válido 48h
depois:  Authorization: <JWT>      (cru, SEM prefixo Bearer)
```

Três armadilhas, cada uma capaz de fazer alguém concluir "rota morta" numa rota viva:

1. **A doc cita a rota mas nunca diz qual é.** `criar-pedido` manda "informe o token
   gerado na rota de autenticação"; nenhuma página do portal documenta `/auth`. Achada
   varrendo caminhos prováveis — só ela responde algo diferente de 404.
2. **camelCase importa.** `id_partner` em snake_case devolve 400 com a **mesma
   mensagem** que credencial inválida (`"Id do parceiro ou secret inválidos!"`). É
   fácil culpar a credencial quando o erro é a grafia.
3. **O 401 da consulta não distingue nada.** Sem mandar auth alguma, a resposta é
   idêntica à de token errado — mesmo `errorCode 901`, mesma mensagem. O 401 só diz
   "não autenticado", nunca por quê.

Também confirmado pelo painel: **não existe host de sandbox separado.** A "URL base p/
requisições" é `https://order-api.saipos.com` mesmo, produção e teste no mesmo host,
separados pela loja. Eu tinha suspeitado de host errado — era hipótese falsa.

#### O que fica

`scripts/probe-saipos-sandbox.js` faz o fluxo inteiro e distingue falha de auth de
falha de consulta. Roda com `SAIPOS_ID_PARTNER` + `SAIPOS_SECRET`. Verificada nos três
caminhos: sem credencial, credencial errada, credencial real.

**Atualização de 2026-08-31 — o próximo trabalho já saiu:** `api/_lib/pos/saipos-adapter.js`
foi escrito e testado (PR #69), cobrindo as três armadilhas documentadas acima (auth em
camelCase, array vazio como sucesso, 404/946 como estado vazio). `pos_provider` já aceita
`saipos` desde a migration citada abaixo. A ressalva sobre o `close-sale` continua valendo
tal como escrita — o adaptador só lê, por decisão registrada no cabeçalho do próprio arquivo,
não por limitação pendente.

#### Resultado do spike

**Primeiro achado: metade do spike não podia rodar como escrita.** A instrução era
"reexecutar a sondagem contra o sandbox com as credenciais atuais". **Não existem
credenciais atuais.** Não há `SAIPOS_*` no `.env.example`, não há adaptador, e
`git log --all -S"saipos" -- api/*` devolve um único commit — o `137baf3`, que é o regex
de autoresponder da prospecção detectando link `saipos.com` como resposta de robô.
Nenhum arquivo Saipos jamais existiu no histórico.

**Correção de registro:** `.claude/plans/2026-07-27-conclusoes-produto/README.md` afirma
que "o adaptador Saipos que já está escrito serve pra *ler* a mesa". Isso está **errado**
— ou descreve trabalho feito fora do repo e nunca commitado. O `known_gaps` do
`intel.config.json` ("Saipos tem zero ocorrências em código") é que está certo. Quem for
retomar isto começa do zero, não de um adaptador pronto.

**Segundo achado: nenhuma das condições de "parar se" aparece em fonte pública.** A
condição era parar se o credenciamento exigisse contrato ou aprovação do iFood. Conferido
em quatro páginas da doc oficial, todas públicas e sem login:

| O que se procurou | O que se achou |
|---|---|
| Aprovação do iFood | **Nenhuma menção ao iFood em nenhuma página** |
| Exigência de contrato comercial | Nenhuma |
| Exclusão de concorrente / aprovação de modelo de negócio | Nenhuma — os [critérios de homologação](https://saipos-docs-order-api.readme.io/reference/criterios-de-homologacao.md) são **puramente técnicos**: validam os fluxos de Delivery, Ficha, Mesa, Mesa com Comanda e Balcão |
| Credenciamento self-serve | Sim — formulário em `developer.saipos.com`, e a doc diz que "o sistema fornece automaticamente as credenciais" (chave pública, loja de teste, Store ID, IDPartner) |
| Endpoints de mesa ainda documentados | Sim, os quatro: consultar por mesa ou comanda, consultar status de comanda, solicitar fechamento de mesa, transferência de pedido de mesa |
| Mudança de política desde as aquisições | Nenhuma. O [changelog](https://saipos-docs-order-api.readme.io/reference/changelog.md) tem entradas de 30/01/2026 e 02/07/2026, ambas técnicas (campo de e-mail, código de erro 950 de contingência) — API viva e mantida **depois** da compra da Saipos (abr/2025) e da Get In (abr/2026) |

**Leitura:** a hipótese do spike era que o iFood teria fechado o portão a terceiros que
competem em reserva e salão. **Nada em fonte pública sustenta isso.** A rota parece viva,
e a doc de mesa/comanda continua sendo exatamente o que serve ao caso de uso (ler mesa e
comanda para reserva e service completion).

**O que falta, e por que parei aqui:** o teste decisivo é submeter o credenciamento — e
isso não é leitura, é **cadastrar o Seatable como parceiro de uma empresa do iFood,
declarando o caso de uso real**. O `.claude/plans/2026-07-27-teardown-integracoes/README.md`
classifica a Get In, também do iFood, como concorrente direto. Registrar-se revela intenção
de produto ao dono do concorrente, e isso é chamada comercial do Stefano, não passo de
spike. O sinal técnico já foi colhido: **o portão está aberto até onde se vê de fora.**

**Decisão do Stefano em 2026-08-25:** ele faz o cadastro (é ato comercial em nome da
empresa, com aceite de termos); a parte técnica fica comigo.

**A sonda já está escrita e esperando credencial:** `scripts/probe-saipos-sandbox.js`.
Roda com `SAIPOS_API_KEY=xxx node scripts/probe-saipos-sandbox.js` e responde a pergunta
binária do spike. Detalhes que ela já embute, para ninguém redescobrir:

- **Endpoint:** `GET https://order-api.saipos.com/sale-status-by-table-or-pad`
- **Colchetes literais:** `?table=[5]`, um valor por chamada. A query é montada à mão
  porque `encodeURIComponent` viraria `%5B5%5D` e o endpoint não aceita. Coberto por
  asserção no próprio script.
- **Sucesso é array no topo**, e `[]` **é sucesso** — significa mesa livre, não falha.
  Confundir isso é o jeito mais fácil de ler "rota morta" numa rota viva.
- **Dois modos de auth:** a doc oferece header `Authorization` *e* query `api_key`, sem
  dizer qual vale no sandbox. A sonda tenta os dois e relata qual funcionou.
- **Somente leitura, de propósito:** `solicitar-fechamento-mesa` **não** é chamado —
  ele muda estado, pintando a mesa de laranja para o garçom. Sondar não pode disparar
  isso, nem em loja de teste.
- **HTTP 950** é modo de contingência da Saipos (GET bloqueado), não recusa de
  credencial — a sonda distingue os dois no veredito.

Se a sonda devolver array: estender o `CHECK` de `pos_provider` para incluir `saipos` e
escrever o adaptador **do zero** (não existe nenhum — ver o primeiro achado acima).

**Ressalva que sobrevive ao spike, e que muda o valor da rota:** mesmo com o portão aberto,
o `close-sale` da Saipos **não registra pagamento** — ele pinta a mesa de laranja avisando
o garçom que o cliente pediu a conta. O body aceita só `order_id` e `cod_store`. A rota
serve para **ler** mesa e comanda, não para fechar a conta. Se o argumento de venda for
"fechamos o loop pelo POS", isso vira promessa quebrada na implantação.

---

### identidade-reserva-externa — A reserva que chega sem telefone
**Origem:** INTEL 2026-08-24 · **Veredito:** PROTOTIPAR 11/15 (P3 A2 D2 E1 L3)
**Fonte:** [Yelp no ChatGPT, 10/ago](https://blog.yelp.com/news/yelp-chatgpt-integration/) · [Yelp Host, 28/jul](https://blog.yelp.com/news/yelp-host-voice-ai-adds-opentable-reservations-and-takeout-ordering-for-restaurants/)

**O mecanismo:** o Yelp expôs Reservations e Waitlist dentro do ChatGPT (EUA e Canadá) —
o comensal confirma mesa sem sair do chat e o restaurante recebe a reserva **já fechada,
sem ter tocado no comensal**. Em paralelo, o Yelp Host escreve reserva direto no OpenTable
em tempo real, recebe takeout empurrando para Toast/Square/Clover, ganhou 16 idiomas
incluindo português, e tem preço publicado: **US$ 249/mês**, ou US$ 199 para cliente do
Guest Manager. É a única âncora pública de preço de atendente de voz de restaurante que
apareceu nesta varredura.

**Por que dói:** todo o CRM deste repo é chaveado por **telefone** —
`api/_services/guestMemory.js` diz literalmente *"customer_id (which IS the phone
number)"*, e `service-completion-core.js`, `guest-profile.js` e `ltv.js` seguem a mesma
chave. Mas `api/external-booking-webhook.js` já aceita `source` `'yelp'` e `'opentable'` e
grava `customer_phone || null`. A `bets[1]` — *"o dado do cliente é o ativo"* — hoje está
protegida por um **campo opcional**, não por identidade resolvida.

**Hipótese:** se uma reserva externa chegar sem `customer_phone`, o loop de dado falha em
100% dos pontos: `guest-profile.js`, `ltv.js` e `getGuestMemories` retornam vazio e nenhuma
linha de `customer_ltv` é criada.

**Spike (4h):** injetar 20 reservas sintéticas com `source='yelp'`/`'opentable'` — 10 com
telefone, 10 só com e-mail. Rodar até `service-completion-core.js` e consultar os três
pontos de leitura. Depois implementar resolução por e-mail como chave secundária no webhook
e no upsert de `customer_ltv`, e repetir. Documentar de passagem que
`api/external-booking-webhook.js` e `api/google-booking/server.js` estão roteados no
`vercel.json` mas **ausentes** do `docs/openapi.yaml`.

**Medir:** antes, nº de reservas email-only que reconciliam num perfil (esperado 0/10).
Depois, ≥9/10 reconciliam na mesma linha de `customer_ltv` sem duplicata, e 0 falsos merges
no lote com telefone.

**Parar se:** a inspeção do payload real de plataforma externa mostrar que nem telefone nem
e-mail chegam, só um ID opaco. Aí o problema deixa de ser resolução de identidade e vira
decisão comercial de não integrar, que é do Stefano.

**Toca:** `api/external-booking-webhook.js`, `api/google-booking/server.js`, `api/_lib/pos/service-completion-core.js`, `api/guest-profile.js`, `api/ltv.js`, `api/_services/guestMemory.js`, `docs/openapi.yaml`
**Status:** aberto

---

### tool-evento-privado — A conversa de evento que fecha com pagamento
**Origem:** INTEL 2026-08-24 · **Veredito:** PROTOTIPAR 11/15 (P3 A2 D2 E1 L3)
**Fonte:** [anúncio de Série A da Hostie](https://hostie.ai/blogs/hostie-news-seriesa) · [Restaurant Technology News](https://restauranttechnologynews.com/2026/07/hostie-raises-12-million-to-expand-its-ai-powered-virtual-concierge-for-restaurant-guest-communication/)

**O mecanismo:** a Hostie levantou US$ 12 mi (Obvious Ventures, US$ 16 mi totais) para uma
camada de comunicação que atende telefone, SMS, e-mail, Instagram e Google Maps num inbox
único e **roteia a intenção para sistemas de terceiros** — reserva vai para
OpenTable/Resy/Tock/SevenRooms, pedido para Olo/Stream, evento privado para
Tripleseat/Perfect Venue. Preço fixo por unidade: US$ 199 / 399 / 599. Conselheiros são
ex-CEO e ex-SVP do OpenTable.

**Onde eles param, e o Seatable não precisa parar:** em nenhuma das quatro páginas abertas
há pagamento, depósito, ingresso, fechamento de conta ou CRM próprio — o produto termina no
handoff. Os **50 mil private event inquiries** que eles citam são a categoria mais cara por
conversa que aparece no material, e eles apenas encaminham.

**O que já existe aqui:** `api/events.js`, `api/event-checkout.js` com PaymentIntent
funcionando, `api/event-refund.js` e `api/event-public.js`. E
`api/_voice-server/tool-handler.js` expõe **8 tools, todas de reserva** — zero de evento,
zero de takeout. O backend pago está pronto e o agente não sabe que ele existe.

**Hipótese:** se o agente ganhar uma tool de consulta de evento privado que leia
`api/events.js` e devolva link de `api/event-checkout.js` pelo WhatsApp, a conversa de
evento fecha **dentro** do Seatable com pagamento — capacidade que a Hostie explicitamente
não tem.

**Spike (6h):** adicionar duas tools em `api/_lib/tool-handlers.js` e o roteamento
correspondente no `switch` de `executeToolCall` em `api/_voice-server/tool-handler.js` e em
`api/_lib/channels/message-processor.js`: `list_events(restaurant_id, date_range)` lendo
`restaurant.events`, e `send_event_link(event_id, phone)` disparando o link público pelo
adapter de WhatsApp. Testar com 10 diálogos gravados de consulta de evento (grupo de 12,
aniversário, corporativo) contra um restaurante de teste com 3 eventos cadastrados.

**Medir:** 8 dos 10 diálogos terminam com o link certo enviado e um `event_booking` em
`payment_status: 'pending'` criado. **Zero vazamento cross-tenant no `restaurant_id`** — o
repo já teve três incidentes desse tipo (`ac17be4d`, `bb4a57c3`, `bb7f132e`).

**Parar se:** a tool exigir mudar o schema de `restaurant.events`, ou se o agente confundir
evento com reserva comum em mais de 2 dos 10 diálogos. Aí o caminho vira formulário no link
do menu, não tool do agente.

**Toca:** `api/_lib/tool-handlers.js`, `api/_voice-server/tool-handler.js`, `api/_lib/channels/message-processor.js`, `api/events.js`, `api/event-checkout.js`, `api/event-public.js`
**Status:** aberto
