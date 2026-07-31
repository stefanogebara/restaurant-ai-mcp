# Pesquisa — Atendimento por DM do Instagram (task #81)

Data: 31/07/2026 · Pesquisa técnica, **nenhum código de produção alterado**.
Escopo: viabilidade + arquitetura de atendimento por Direct do Instagram,
espelhando o que já existe para WhatsApp.

> Nota de caminho: este documento deveria estar em `pesquisa-instagram.md` na
> raiz da pasta do plano. O hook de criação de `.md` bloqueia esse nome — o
> regex dele isenta `.claude/plans/` usando barras normais, e no Windows o
> caminho chega com barras invertidas, então a isenção nunca casa. Ficou como
> `pesquisa-instagram/README.md`, que passa pela regra do próprio hook.
> Corrigir o regex do hook (aceitar `[\\/]`) e renomear é trabalho de 1 minuto.

---

## 1. Veredito

**Dá para fazer. O que trava não é técnico — é App Review e o modelo de
identidade do cliente.**

Três achados que mudam o plano original ("espelho do whatsapp-webhook"):

1. **Já existe metade do caminho andado.** O conector OAuth de Instagram está
   em produção (`api/instagram/oauth-start.js`, `api/instagram/oauth-callback.js`,
   tabela `restaurant.instagram_connections`), usando o caminho **Facebook Login
   for Business** — token longo de 60 dias por restaurante, `fb_page_id` e
   `ig_business_account_id` já gravados. Falta **um escopo**
   (`instagram_manage_messages`) e o webhook. Não é greenfield.

2. **A assinatura do webhook é literalmente a mesma.** `X-Hub-Signature-256`,
   HMAC-SHA256 sobre o corpo cru, com o `META_APP_SECRET`. O laço de
   verificação em `api/_lib/channels/meta-adapter.js:25-59` funciona **sem
   nenhuma alteração**. O `hub.verify_token` do GET também é idêntico
   (`api/whatsapp-webhook.js:33-50`).

3. **O payload e a identidade do cliente NÃO são os mesmos.** Instagram entrega
   `entry[].messaging[]` (formato Messenger) com um **IGSID** — não um telefone.
   Todo o pipeline abaixo do adapter (`message-processor.js`) é construído em
   cima de telefone: sessão, rate limit, lock, feedback, pesquisa,
   `customer_history`, `reservations.customer_phone`. **Essa é a trava real de
   engenharia**, não o webhook.

E uma trava de produto que precisa ser dita alto:

> **No Instagram não existe template.** Sem template não existe mensagem
> iniciada pelo negócio. Lembrete de reserva, pedido de feedback, campanha de
> retenção e **prospecção fria da Olímpia** — nada disso pode sair por DM.
> Instagram serve para **responder** quem chegou, e só. Fora da janela de 24h o
> canal fica mudo (a única saída é a tag Human Agent, que é para humano — ver §7).

**Recomendação**: fazer, mas como **canal de entrada** (cliente chama no Direct →
IA responde → reserva criada), com WhatsApp continuando dono de tudo que é saída
proativa. E submeter o App Review **agora**, porque é ele que dita o calendário.

---

## 2. Qual API usar em 2026

Meta mantém dois caminhos vivos:

| | **Instagram API with Instagram Login** | **Instagram API with Facebook Login for Business** |
|---|---|---|
| Host | `graph.instagram.com` | `graph.facebook.com` |
| Token | Instagram User access token | Page access token |
| Página do Facebook | **Não exige** | **Exige** |
| Escopos de mensagem | `instagram_business_basic`, `instagram_business_manage_messages` | `instagram_basic`, `instagram_manage_messages`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata` |
| Publicação | `instagram_business_content_publish` | `instagram_content_publish` |
| Serve para | integração simples, conta única | plataformas multi-cliente / Business Manager |

Fonte: [Instagram Platform — Overview](https://developers.facebook.com/docs/instagram-platform/overview/)
e [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/).

### Decisão recomendada: **Facebook Login for Business** (manter o que já existe)

Não porque seja tecnicamente superior — o caminho Instagram Login é mais simples
e dispensa Página do Facebook. É porque **o Seatable já está inteiro no outro
caminho**:

- `api/instagram/oauth-start.js:42` aponta para `facebook.com/v21.0/dialog/oauth`
- `api/instagram/oauth-callback.js:144-157` resolve o IG via `me/accounts` →
  `instagram_business_account`
- Nove endpoints em produção (`publish-post`, `publish-reel`, `schedule-post`,
  `recent-media`, `draft-caption`, `recompute-tone`, `upload-image`,
  `upload-video`, `status`) consomem esse token contra `graph.facebook.com`
- A tabela `restaurant.instagram_connections` guarda `fb_page_id` +
  `ig_business_account_id` + token de 60 dias

Migrar para Instagram Login significaria um **segundo fluxo OAuth paralelo, um
segundo token por restaurante e reescrever nove endpoints**. Adicionar
`instagram_manage_messages` à lista de escopos que já existe é uma linha.

**Custo dessa escolha, dito com honestidade**: o restaurante precisa ter uma
Página do Facebook vinculada. Contas profissionais do Instagram hoje podem
existir sem Página, então isso vira atrito no onboarding de alguns restaurantes.
Se esse atrito aparecer na prática (medir: quantos travam em `no_ig_account` no
callback — o código já distingue esse caso), o caminho Instagram Login vira um
**segundo conector opcional**, não uma migração.

---

## 3. Checklist do FUNDADOR (não é código)

Ordem importa. Os itens 1-4 destravam o desenvolvimento; o 5 destrava clientes
reais e é o item de caminho crítico.

- [ ] **1. Conta Instagram profissional** (Business ou Creator) para o Seatable /
      restaurante piloto. Conta pessoal **não** acessa a API.
      *(Se a conta da Olímpia/Seatable já publica pelo conector atual, feito.)*

- [ ] **2. Página do Facebook vinculada** à conta do Instagram.
      Verificável em Instagram → Editar perfil → Página.

- [ ] **3. Ativar o toggle de mensagens — dentro do app do Instagram, por conta:**
      `Configurações → Mensagens e respostas a stories → Controles de mensagem →
      Ferramentas conectadas → **Permitir acesso às mensagens**`.
      **Este é o item que mais causa falha silenciosa**: sem ele o webhook
      simplesmente nunca dispara, sem erro nenhum em lugar nenhum. Cada
      restaurante cliente terá que fazer isso — precisa virar passo do onboarding
      com verificação.
      Fonte: [Instagram Messaging — Get Started](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/get-started).

- [ ] **4. App Meta em modo Live** (não Development) e com **Verificação de
      Negócio (Business Verification)** concluída. Endpoint precisa de TLS
      válido — `seatable.one` na Vercel já atende.

- [ ] **5. App Review — pedir Acesso Avançado (Advanced Access):**
      - Permissão **`instagram_manage_messages`** — obrigatória para atender
        contas que **não são nossas**, ou seja, todos os restaurantes clientes.
        Com Acesso Padrão (Standard) só dá para atender contas que o app possui
        ou que estão como testadores. **Dá para desenvolver e testar tudo em
        Standard** com a conta do próprio Seatable.
      - Feature **Human Agent** — só se formos usar a janela de 7 dias (ver §7;
        recomendo **não** pedir de saída, ver riscos).
      - O que a gravação precisa mostrar, segundo o próprio doc de App Review:
        Página do Facebook conectada à conta profissional, o app **recebendo o
        webhook e respondendo pela Send API**, e chamadas bem-sucedidas em todas
        as APIs pedidas. Começar da landing pública, usar as credenciais de teste
        informadas ao revisor, ir devagar.
        Fonte: [Instagram Messaging — App Review](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/app-review).
      - **Prazo**: Meta não publica SLA. Relatos de 2026 falam em **~20 dias** e
        fila represada; recusa na primeira tentativa é comum
        ([bundle.social](https://bundle.social/blog/meta-app-review-20-days),
        [PostMoore](https://www.postmoo.re/blogs/meta-app-review-disapproved-how-to-get-approved)).
        **Trate como 2 a 6 semanas com uma reprova no meio.** Submeter cedo.

- [ ] **6. Decidir se o Instagram fica no MESMO app Meta do WhatsApp.**
      Decisão de risco, não técnica — ver §7, risco 4. Recomendação: **app
      separado** para o Instagram.

- [ ] **7. Re-autorizar restaurantes já conectados.** Adicionar
      `instagram_manage_messages` aos escopos faz o token antigo **não** ganhar a
      permissão nova. Todo restaurante já conectado precisa passar pelo OAuth de
      novo. Precisa de aviso na UI, não pode ser silencioso.

---

## 4. O que reaproveita e o que precisa ser novo

### Reaproveita inteiro (zero ou quase zero alteração)

| Peça | Onde | Observação |
|---|---|---|
| Verificação de assinatura HMAC | `api/_lib/channels/meta-adapter.js:25-59` | **Idêntico.** Mesmo header `x-hub-signature-256`, mesmo `META_APP_SECRET`. Extrair para `api/_lib/channels/meta-signature.js` e os dois adapters usam. |
| Verificação GET do webhook | `api/whatsapp-webhook.js:33-50` | Mesmo `hub.mode`/`hub.verify_token`/`hub.challenge`, com `secureEquals`. Só troca a env var por `INSTAGRAM_VERIFY_TOKEN`. |
| Captura de corpo cru + `bodyParser:false` | `api/whatsapp-webhook.js:151-168, 193` | Copiar verbatim. Mesma pegadinha da Vercel (o stream morre depois do `res.json()`). |
| Interface de adapter | `api/_lib/channels/channel-adapter.js` | Já foi desenhada prevendo Instagram (comentário na linha 8). `markAsRead`/`addReaction`/`sendInteractiveList` já são no-ops opcionais. |
| Avaliação de resultado de envio | `api/_lib/channels/send-result.js` (`avaliarEnvio`) | Provavelmente precisa de códigos de erro novos, mas a forma serve. |
| OAuth + armazenamento de token | `api/instagram/oauth-start.js`, `oauth-callback.js`, `supabase/migrations/20260602_instagram_connections.sql` | **Já em produção.** Só faltam escopos. |
| Dedup / rate limit / lock (mecanismo) | `api/_lib/rate-limit.js` | Funciona — desde que a **chave** deixe de ser telefone (ver §5.a). |
| Pipeline de IA | `api/_services/whatsapp/conversation.js` (`processWithAI`) | Agnóstico de canal. Só herda o limite de 1000 bytes. |

### Precisa ser novo

| Arquivo novo | O quê |
|---|---|
| `api/instagram/webhook.js` | Handler fino espelhando `api/whatsapp-webhook.js`. Guarda em `body.object === 'instagram'`. |
| `api/instagram/_lib/adapter.js` | `class InstagramAdapter extends ChannelAdapter` — `parseIncoming` para `entry[].messaging[]`, `sendMessage` com token por restaurante, `sendButtons` → quick replies. |
| `api/instagram/_lib/sender.js` | `POST /{ig-id}/messages` com `{recipient:{id}, message:{text}}`. |
| `api/instagram/_lib/routing.js` | `entry[].id` (IG Business Account ID) → `restaurant_id` via `instagram_connections`. Equivalente ao `phoneNumberIdFromBody` de `api/_lib/prospecting/routing.js:43-45`, que **não funciona** em payload de IG. |
| `api/instagram/_lib/connection.js` | Resolver + cachear o token ativo; marcar `restricted`/`expired` em 401/190. |
| Migration | `channel` + `external_id` em `whatsapp_sessions` (ou tabela própria); `messaging_enabled` e `webhook_subscribed_at` em `instagram_connections`. |

> Regra da casa que vale aqui: código de biblioteca vai em `_lib/`.
> `api/instagram/_lib/` já existe e já é usado (`publish-flow.js`,
> `fetch-recent-media.js`). E **nunca** `require()` de um handler irmão — a NFT
> da Vercel derruba a função importadora sem erro de build (CLAUDE.md, causa
> raiz do 404 do `/api/demo`).

### Precisa ser alterado

| Arquivo | Alteração | Risco |
|---|---|---|
| `api/instagram/oauth-start.js:52-57` | Adicionar `instagram_manage_messages` e `pages_manage_metadata` aos `SCOPES` | Baixo no código, **alto no processo**: invalida a autorização de todo mundo já conectado |
| `api/instagram/oauth-callback.js` | Após o upsert, chamar `POST /{page-id}/subscribed_apps?subscribed_fields=messages,messaging_postbacks` | Baixo |
| `api/_lib/channels/message-processor.js` | Identidade por canal (ver §5.a-b) | **Alto — é código que roda em produção para WhatsApp hoje** |
| `api/_lib/channels/meta-adapter.js` | Extrair `verifySignature` para módulo compartilhado | Baixo, mecânico |

---

## 5. As travas que impedem reaproveitar o código do WhatsApp direto

Dez diferenças reais, das mais graves para as menores.

**a) A identidade é um IGSID, não um telefone — e o normalizador corrompe.**
`normalizePhoneNumber()` (`api/_lib/whatsapp-sessions.js:393-405`) remove tudo
que não é dígito e **prefixa `+` em qualquer string com 10+ caracteres**. Um
IGSID como `978239761327698` vira `+978239761327698` e entra no **mesmo espaço
de chaves dos telefones**. Sessão, cache em memória, dedup, rate limit
(`isRateLimited(from)`) e lock (`acquireProcessingLock(from)`) passam todos a
conviver com identificadores de dois tipos no mesmo namespace. Bloqueador duro:
a chave precisa virar algo como `ig:<igsid>` / `wa:<e164>`.

**b) Não existe telefone — e meio pipeline exige um.**
`findPendingFeedbackForPhone(from, restaurante)`, `handleSurveyReply(from, ...)`,
`customer_history`, `reservations.customer_phone`. Uma reserva nascida no Direct
não tem telefone. Isso é **decisão de produto**, não de código: ou a IA pede o
telefone no meio da conversa (atrito, mas destrava lembrete/feedback por
WhatsApp), ou o sistema aceita reserva sem telefone (e o restaurante fica sem
como avisar de atraso). Recomendo a primeira, com o pedido acontecendo **depois**
de a reserva estar praticamente fechada.

**c) O roteamento para restaurante é por outra chave, em outra tabela.**
WhatsApp: `value.metadata.phone_number_id` →
`restaurant_registry.whatsapp_phone_number_id` (`message-processor.js:170-196`).
Instagram: `entry[].id` = IG Business Account ID →
`restaurant.instagram_connections.ig_business_account_id`. Consequência boa:
**cada restaurante tem sua própria conta de Instagram**, então o seletor de
restaurante (`sendRestaurantPicker`, `message-processor.js:581-604`) **nunca é
necessário** no Instagram. Um problema a menos.

**d) O token é por restaurante e expira.**
WhatsApp usa uma env var global (`WHATSAPP_ACCESS_TOKEN`, lido direto dentro de
`sendViaMeta`, `api/_lib/whatsapp-sender.js:73`). Instagram usa um token de
**60 dias por restaurante**, em `instagram_connections.access_token`. O sender
não pode ler env — tem que receber o token. E **sem cron de refresh o canal
morre em silêncio**: o comentário da migration
(`20260602_instagram_connections.sql:12-13`) já previa um cron "C2" que renova
abaixo de 14 dias — **verificar se ele existe**.

**e) O corpo do payload é outro.**
WhatsApp: `entry[].changes[].value.messages[]`. Instagram: `entry[].messaging[]`,
formato Messenger:

```json
{
  "object": "instagram",
  "entry": [{
    "id": "17841476961942794",
    "time": 1778223729706,
    "messaging": [{
      "sender":    { "id": "978239761327698" },
      "recipient": { "id": "17841476961942794" },
      "timestamp": 1778223722476,
      "message": { "mid": "aWdfZAG1faXRlbTo...", "text": "Vocês têm mesa hoje às 20h?" }
    }]
  }]
}
```

`parseIncoming` (`meta-adapter.js:65-159`) é **reescrita completa**, não
adaptação. Campos a assinar: `messages`, `messaging_postbacks`, `messaging_seen`,
`message_reactions` (e `comments`/`mentions` se um dia quisermos comentário→DM).

**f) O envio é outro formato, em outro host.**
WhatsApp: `POST graph.facebook.com/v18.0/{phone_number_id}/messages` com
`{messaging_product, recipient_type, to, type, text:{body}}`.
Instagram: `POST graph.facebook.com/v23.0/{ig-id}/messages` (ou
`graph.instagram.com` no caminho Instagram Login) com
`{recipient:{id}, message:{text}}`. São ~60 linhas novas — não é drama, mas não
é reuso.

**g) Texto limitado a 1000 bytes, não caracteres.**
WhatsApp aceita 4096 caracteres. Instagram: 1000 **bytes** UTF-8 — em português
com acentos isso dá ~850-950 caracteres reais. As respostas da IA hoje passam
disso com frequência. Precisa de fatiamento no adapter (**contando bytes**, não
`.length`), ou de instrução de brevidade no prompt para o canal.
Fonte: [Send Messages](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/).

**h) Não existe lista interativa.**
`sendInteractiveList` (WhatsApp: seções de até 10 linhas) **não tem
equivalente**. O que existe são **quick replies**: máximo 13, **20 caracteres
cada**, texto puro, e **não aparecem no desktop**. Existe também Generic Template
(cards ricos). Como o seletor de restaurante some (item c), a perda prática é
pequena.
Fonte: [Quick Replies](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/quick-replies).

**i) Mídia chega por URL, não por media_id.**
WhatsApp faz dois passos (`GET /{media-id}` → URL assinada → download com
Bearer) — é o que `downloadMedia`/`transcribeVoiceMessage` fazem em
`api/_lib/whatsapp-interactions.js`. Instagram entrega
`attachments[].payload.url` direto no webhook (CDN, expira rápido). Precisa de
variante. A transcrição de áudio em si (o pedaço caro) é reaproveitável.

**j) Sem template = sem saída proativa. Nenhuma.**
`sendTemplateMessage` (`api/_lib/whatsapp-sender.js:199-256`) e todo o pipeline
de aprovação de template na Meta **não têm contraparte no Instagram**. Fora da
janela de 24h o único recurso é a tag Human Agent (7 dias, para humano).
Lembretes, feedback, campanhas e prospecção continuam **exclusivamente** no
WhatsApp.

---

## 6. Esboço de arquitetura + esforço

```
Direct do cliente
      │
      ▼
POST /api/instagram/webhook
      │  bodyParser:false · corpo cru capturado ANTES do 200
      │  verifyMetaSignature(req)          ← compartilhado com o WhatsApp
      │  guarda: body.object === 'instagram'
      ▼
InstagramAdapter (api/instagram/_lib/adapter.js)
      │  parseIncoming  → { channel:'instagram', from:<IGSID>,
      │                     igBusinessAccountId, messageId:<mid>, text, ... }
      │  sendMessage    → sender.js, token resolvido por restaurante
      ▼
routing.js: ig_business_account_id → restaurant_id
      │  (uma conta IG = um restaurante → SEM seletor)
      ▼
processMessage(adapter, msg)          ← MESMO pipeline do WhatsApp
      │  chaves passam a ser channel-scoped: `ig:<igsid>` / `wa:<e164>`
      ▼
processWithAI → resposta → fatiar em ≤1000 bytes → sendMessage
```

**Fases e esforço** (dias de engenharia; a espera do App Review corre em paralelo):

| Fase | Entrega | Esforço |
|---|---|---|
| **0** | Fundador: conta, toggle, Business Verification, **submeter App Review** | ~4h dele + 2-6 semanas de espera |
| **1** | Webhook + adapter + sender + routing, **uma conta só** (a nossa), com chave de sessão dedicada temporária. Prova a ponta a ponta em Standard Access. | 1,5-2 dias |
| **2** | Identidade por canal em `message-processor.js`: sessão, rate limit, lock, guardas de feedback/pesquisa. **É a fase perigosa** — mexe em código que atende WhatsApp em produção. Testes primeiro. | 2-3 dias |
| **3** | Reserva sem telefone / captura de telefone na conversa (depende da decisão de produto) | 2 dias |
| **4** | UI: painel de conexão com status "Permitir acesso às mensagens", passo de onboarding, aviso de re-autorização | 1 dia |
| **5** | Cron de refresh de token (se o "C2" não existir) + alertas de token expirado | 0,5 dia |

**Total: ~7 a 9 dias de engenharia**, destravado pelo App Review. Fases 1 e 2
podem começar hoje, em Standard Access, sem esperar a Meta.

---

## 7. Riscos

1. **App Review reprova ou demora.** Relatos de 2026 apontam ~20 dias e fila
   represada; reprova na primeira é comum.
   *Mitigação*: submeter já; pedir **só** `instagram_manage_messages` (pedir
   escopo "que talvez use depois" é motivo clássico de reprova); screencast
   completo mostrando webhook chegando **e** resposta saindo; desenvolver em
   Standard Access enquanto espera.

2. **O toggle "Permitir acesso às mensagens" falha em silêncio.** Sem ele o
   webhook nunca dispara e não há erro em lugar nenhum. Um restaurante vai jurar
   que conectou e o canal estará morto.
   *Mitigação*: passo explícito no onboarding com print, e uma checagem ativa
   (mandar mensagem de teste da própria conta e ver se o webhook chega) que
   alimenta um estado visível na UI.

3. **Janela de 24h sem escape.** Se o cliente reservar no Direct e a
   confirmação/lembrete tiver que sair por WhatsApp, o telefone volta a ser
   obrigatório — e a "reserva sem atrito pelo Direct" perde parte da graça.
   *Decisão necessária antes da fase 3.*

4. **Tag Human Agent usada por bot = violação de política.** A tag existe para
   **atendente humano** responder até 7 dias. Usar com IA é violação; a
   consequência é escalonada — aviso na Page Support Inbox, depois **restrição
   de envio**, e reincidência leva a restrição permanente
   ([política](https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy)).
   **Risco correlacionado**: se o Instagram rodar no **mesmo app Meta** do
   WhatsApp, uma punição de política no Instagram atinge um app que também
   carrega o atendimento por WhatsApp **e** a prospecção da Olímpia.
   *Mitigação*: **app Meta separado para o Instagram**. O código já suporta
   múltiplos segredos de app (`meta-adapter.js:30-34` aceita `META_APP_SECRET`,
   `WHATSAPP_APP_SECRET` e `PROSPECTING_APP_SECRET`) — o precedente do número de
   prospecção isolado é exatamente este raciocínio. Custo: um segundo OAuth
   client id/secret.

5. **Prospecção fria no Direct é proibida.** A política veda "unsolicited bulk
   outreach" sem opt-in e "cold outreach" sem interação prévia do cliente.
   **A Olímpia não vai para o Instagram.** Registrado aqui para não voltar como
   ideia daqui a dois meses.

6. **Divulgação de automação obrigatória.** Experiência automatizada tem que ser
   declarada no início da conversa (exigência para usuários da Califórnia e da
   Alemanha; boa prática para todos). Ex.: "Oi! Sou o assistente virtual do
   [restaurante]". Precisa entrar no prompt do canal.

7. **Token de 60 dias por restaurante.** Sem cron de refresh, o canal cai
   silenciosamente 60 dias depois de cada conexão — e o restaurante só descobre
   quando um cliente reclama. Verificar se o cron "C2" previsto na migration
   existe; se não, é a fase 5.

8. **A alteração de escopo invalida conexões existentes.** Todo restaurante já
   conectado (publicação/legendas) precisa refazer o OAuth. Se isso passar sem
   aviso, as features de publicação quebram junto.

9. **Cliente duplicado entre canais.** O mesmo cliente vira dois registros — um
   por telefone, outro por IGSID. `customer_history`, LTV e churn passam a contar
   duas pessoas. Precisa de estratégia de dedup (o telefone capturado na conversa
   é a ponte natural).

10. **Configuração de webhook no painel Meta.** O desenho aqui assume que o
    objeto `instagram` recebe sua própria Callback URL, separada da do
    `whatsapp_business_account`. Isso precisa ser **confirmado no painel** na
    hora de configurar. Seguro barato já embutido no desenho: o handler novo
    guarda em `body.object === 'instagram'` e o do WhatsApp ignora o que não for
    dele — se a Meta forçar URL única, o fork já está pronto.

---

## 8. Limites operacionais (referência rápida)

| Item | Instagram | WhatsApp (para comparar) |
|---|---|---|
| Janela de resposta | 24h desde a última mensagem do cliente | 24h, **mas com template para reabrir** |
| Saída proativa | **Nenhuma** (só Human Agent 7d, para humano) | Template aprovado |
| Texto | 1000 bytes UTF-8 | 4096 caracteres |
| Imagens | até 10 anexos, PNG/JPEG, 8MB | — |
| Áudio/vídeo/PDF | 25MB (AAC/M4A/WAV/MP4; MP4/OGG/AVI/MOV/WEBM) | — |
| Quick replies | 13 máx., 20 caracteres, sem desktop | Botões (3) + lista (10/seção) |
| Grupos | Não suportado | — |
| Send API (texto/link) | 100 chamadas/s por conta | — |
| Send API (áudio/vídeo) | 10 chamadas/s por conta | — |
| Conversations API | 2 chamadas/s por conta | — |
| Endpoints gerais | 4800 × impressões por 24h | — |
| Pasta "Solicitações" | conversas inativas há 30 dias somem da API | — |

---

## Fontes

- [Instagram Platform — Overview](https://developers.facebook.com/docs/instagram-platform/overview/) — comparação Instagram Login × Facebook Login, escopos, Standard vs Advanced Access, rate limits
- [Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/) — escopos novos (vigentes desde 27/01/2025), capacidades
- [Send Messages (Instagram Messaging API)](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/) — endpoint, janela de 24h, limite de 1000 bytes, tipos de mídia, sem grupo
- [Instagram Platform — Webhooks](https://developers.facebook.com/docs/instagram-platform/webhooks) — verificação `hub.*`, campos de assinatura, `X-Hub-Signature-256`, `POST /me/subscribed_apps`
- [Instagram Messaging — Get Started](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/get-started) — conta profissional, Página do FB, toggle "Allow Access to Messages"
- [Instagram Messaging — App Review](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/app-review) — pré-requisitos de submissão
- [Human Agent Escalation](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/human-agent-escalation) — escalonamento para humano
- [Quick Replies](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/quick-replies) — 13 máx., 20 caracteres, sem desktop
- [Messenger Platform and IG Messaging API policy](https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy) — janela de 24h, tags, Human Agent 7 dias, proibição de cold outreach, divulgação de automação, escalonamento de punições
- [bundle.social — Meta App Review Now Takes 20 Days (2026)](https://bundle.social/blog/meta-app-review-20-days) — prazo observado (fonte terceira, não oficial)
- [PostMoore — Why Meta App Review Keeps Disapproving Your App](https://www.postmoo.re/blogs/meta-app-review-disapproved-how-to-get-approved) — motivos comuns de reprova (fonte terceira)

### Arquivos do repositório citados

`api/whatsapp-webhook.js` · `api/_lib/channels/meta-adapter.js` ·
`api/_lib/channels/channel-adapter.js` · `api/_lib/channels/message-processor.js` ·
`api/_lib/whatsapp-sender.js` · `api/_lib/whatsapp-sessions.js` ·
`api/_lib/prospecting/routing.js` · `api/instagram/oauth-start.js` ·
`api/instagram/oauth-callback.js` · `api/instagram/status.js` ·
`supabase/migrations/20260602_instagram_connections.sql`
