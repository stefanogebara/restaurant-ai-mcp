# Pesquisa #80 — ElevenLabs (voz conversacional): estado atual vs. o que temos

**Data:** 31/jul/2026 · **Escopo:** levantamento técnico. Nenhum código de produção alterado.
**Fontes:** docs oficiais, changelog e páginas de preço da ElevenLabs — linkadas ao longo do texto.

> ### Mudança de nome (importante para buscas e para links em comentários de código)
> O produto passou por **dois** rebrandings:
> `Conversational AI` → **ElevenLabs Agents** (3/set/2025) → **ElevenAgents** (~fev/2026).
> Os docs migraram de `/docs/conversational-ai/` → `/docs/agents-platform/` → **`/docs/eleven-agents/`**;
> as URLs antigas retornam **404**.
> **Mas o namespace da API continua `/v1/convai/`** — nenhum endpoint nosso quebrou por causa do rebrand.

---

## 1. O que temos hoje

### 1.1 Modelo mental atual: **um agente ElevenLabs por restaurante**

`api/_services/elevenlabsAgentService.js` é o coração. Para cada restaurante criamos
**1 agente + 7 tools (recursos separados) + 1 documento de knowledge base**.

| O quê | Onde | Observação |
|---|---|---|
| Base da API | `elevenlabsAgentService.js:21` | `https://api.elevenlabs.io/v1/convai` |
| Criação do agente | `elevenlabsAgentService.js:827-938` (`POST /agents/create` em `:895`) | chamado no onboarding: `api/onboarding/complete.js:845-888` |
| Criação das 7 tools | `elevenlabsAgentService.js:678-766` (defs) e `:774-808` (`POST /tools`, **uma por vez, em série**) | `get_current_datetime`, `check_availability`, `create_reservation`, `lookup_reservation`, `cancel_reservation`, `modify_reservation`, `get_wait_time` |
| Segredo por restaurante nas tools | `elevenlabsAgentService.js:37-75` | `el_whsec_<64 hex>` em `restaurant_config.elevenlabs_webhook_secret`, enviado no `Authorization: Bearer` das tools |
| Validação desse segredo | `api/elevenlabs-webhook.js:115-135` | valida o segredo **contra o `restaurant_id` que a chamada alega**. Esta é a peça de segurança mais importante do sistema — ver §4.1 |
| Sync de knowledge base | `elevenlabsAgentService.js:185-301` | apaga o doc antigo → `POST /knowledge-base/text` (`:246`) → `PATCH /agents/{id}` ligando o doc (`:262-274`) |
| Gatilho do sync | `api/_lib/kb-sync-trigger.js:28-69` | **awaited**, teto de 12s (`:26`); a justificativa em `:5-18` (Lambda morre no `res.json()`) está correta |
| Exclusão do agente | `elevenlabsAgentService.js:314-429` | usado no cleanup diário de demos: `api/cron/cleanup-expired-demos.js:161-171` |
| A/B por *branches* | `elevenlabsAgentService.js:441-641` + `api/voice-experiments.js` | `enable_versioning_if_not_enabled`, `POST /branches`, `POST /deployments` com traffic split |
| Signed URL | `api/elevenlabs-signed-url.js` | guarda cross-tenant sólida em `:42-70` (o `?agent_id=` do browser não tem autoridade) |
| Front WebRTC | `client/src/components/voice/useVoiceAgent.ts` | `@elevenlabs/react` (`:6`), `startSession({ agentId, connectionType:'webrtc' })` em `:86-92` |
| Versão do SDK | `client/package.json:17` | `@elevenlabs/react ^0.14.2` (→ `@elevenlabs/client 0.15.1`) |
| Telefonia | `api/phone-integration-simple.js` | Twilio **da plataforma** (`:20-23`), importado via `POST /v1/convai/phone-numbers/create` com `provider:'twilio'` (`:218-232`), atribuído ao agente em `PATCH /phone-numbers/{id}` (`:272`) |
| Transcrições | `api/cron/sync-conversation-data.js` | cron **de 15 em 15 min**; o comentário em `:11` afirma "ElevenLabs guarda ~24-48h" — **isso está errado, ver §1.3d** |
| Sonda de saúde | `api/_lib/integration-probes.js:324-327` | `GET /v1/user/subscription` |
| Pipeline alternativo | `api/_voice-server/` + `api/twilio-voice-connect.js` | roteia por `restaurant_config.voice_engine` (`elevenlabs` \| `openai_realtime`) |
| Lógica de negócio compartilhada | `api/_lib/tool-handlers.js` | **ativo valioso**: handlers puros, sem `req/res`, já pensados para múltiplos pipelines (`:1-15`) |

### 1.2 Configuração congelada no momento da criação

O agente nasce com valores **hardcoded** e **nunca mais é atualizado** — não existe rotina de
"migrar a frota". Cada restaurante roda a configuração que existia no dia do seu onboarding:

| Campo | Valor no nosso código | Situação hoje |
|---|---|---|
| `llm` | `gpt-4o-mini` — `elevenlabsAgentService.js:902`, `api/elevenlabs-agent-create.js:121,238` | ainda suportado, mas é geração 4o. Hoje há GPT-5.5/5.4/5-Nano, Gemini 3.5 Flash, Claude Haiku 4.5 e Qwen hospedado pela própria ElevenLabs |
| `tts.model_id` | `eleven_flash_v2` (en) / `eleven_flash_v2_5` — `:906` | Flash v2.5 continua bom; **existe opção melhor** (§2.1) |
| `tts_model_id` default nas settings | **`eleven_turbo_v2_5`** — `api/elevenlabs-voice-settings.js:127,177` | **legado**: *"We recommend using the Flash models over Turbo models in all use cases."* |
| `asr.provider` | **`'elevenlabs'`** — `:911` | ⚠️ **valor deprecado.** Desde 08/jun/2026 o provider passou a ser **`scribe_realtime`** e o antigo foi marcado como deprecado |
| `turn_timeout` | `8` — `:908` | válido (1–30), mas acima do default atual (7) e **longo** para reserva |
| `turn_model` | não setado | pega o default; hoje `turn_v3` |
| `turn_eagerness`, `soft_timeout_config`, `interruption_mode` | não setados | recursos novos que não usamos (§2.7) |
| `platform_settings` | só `widget_config` — `:913-918` | **não configura `auth` nem `privacy`** → §1.3b e §1.3d |

### 1.3 Quatro problemas concretos encontrados na auditoria

**(a) Vazamento de tools a cada exclusão de agente.**
`createAgent` grava os ids em `conversation_config.agent.prompt.tool_ids` (`:902`), mas
`deleteAgent` procura em `conversation_config.agent.tools` (`:353-356`):

```js
const tools = agentData?.conversation_config?.agent?.tools || [];
toolIds = tools.map(t => t.id).filter(Boolean);
```

Esse caminho vem vazio → o laço de `DELETE /tools/{id}` (`:365-375`) não roda → **as 7 tools
ficam órfãs no workspace**. Como o cron diário de demos chama `deleteAgent`
(`cleanup-expired-demos.js:164`), **cada demo expirado deixa 7 recursos para trás**.

**(b) O agente é público — o `agent_id` é o único segredo.**
`createAgent` não define `platform_settings.auth`, e o front chama `startSession({ agentId })`
direto (`useVoiceAgent.ts:86-92`). **Quem souber o `agent_id` conversa com o agente daquele
restaurante e queima nossos minutos** ($0,08/min). Os docs oferecem `enable_auth` ou
`allowlist` (até 10 hostnames, match exato, subdomínio precisa de entrada própria), e avisam
para **não usar os dois juntos**.
([auth](https://elevenlabs.io/docs/eleven-agents/customization/authentication))

**(c) O caminho "signed URL" do front está errado para WebRTC.**
`useVoiceAgent.ts:77` faz `fetch('/api/elevenlabs-signed-url')` **sem header `Authorization`**,
mas o endpoint exige JWT (`elevenlabs-signed-url.js:20-24`) → 401. Hoje é código morto (ambos
os usos passam `useSignedUrl: false` — `LiveAIDemo.tsx:100`, `VoiceWidgetSection.tsx:27`), mas
quebra na hora que alguém ligar a flag. E mesmo corrigido continuaria errado: **signed URL é a
credencial do WebSocket; WebRTC usa `conversation token`** (§2.6) — e o SDK **força exatamente
uma credencial, casando com o transporte**.

**(d) 🔴 O cron de 15 em 15 minutos existe para vencer um prazo que não existe.**
`sync-conversation-data.js:11` diz: *"ElevenLabs stores conversation data for ~24-48 hours, so
we must pull it promptly."* A documentação de retenção diz outra coisa: o campo é
**`platform_settings.privacy.retention_days`** e o **default é 2 anos** (`-1` = ilimitado,
`0` = deleção imediata, N = dias).
([retention](https://elevenlabs.io/docs/eleven-agents/customization/privacy/retention))
Se isso se confirmar na nossa conta, **a premissa inteira do cron cai** — são 96 invocações/dia
comprando uma urgência inexistente, exatamente o padrão que o `CLAUDE.md` manda caçar primeiro.

---

## 2. O que mudou na plataforma

### 2.1 TTS — existe um modelo novo feito para agentes

| `model_id` | Latência | Idiomas | pt-BR | Realtime? |
|---|---|---|---|---|
| **`eleven_v3_conversational`** | "ultra-low-latency" (ms não publicado) | 70+ | sim | **sim — é o topo para agentes** |
| `eleven_flash_v2_5` | **~75 ms** | 32 | sim | sim (recomendado clássico) |
| `eleven_multilingual_v2` | maior | 29 | sim (BR e PT) | serve, mas é de narração |
| `eleven_v3` | alta | 70+ | sim | **não** |
| `eleven_flash_v2` | ~75 ms | **só inglês** | não | sim, só EN |
| `eleven_turbo_v2_5` / `eleven_turbo_v2` | — | 32 / EN | — | **legado** |

`eleven_v3_conversational` é a versão de baixa latência do v3, otimizada para diálogo
turno-a-turno, com **Expressive Mode ligado por padrão**. O doc é explícito sobre custo:
*"Eleven v3 Conversational is priced the same as other ElevenLabs TTS models in Agents,
starting at $0.08 per minute."* Configura-se com um campo:

```json
{ "conversation_config": { "tts": { "model_id": "eleven_v3_conversational" } } }
```

*"Flash v3" não existe* — a evolução para realtime foi o v3 Conversational.

⚠️ **Removidos em 09/jul/2026:** `eleven_monolingual_v1`, `eleven_multilingual_v1` e `scribe_v1`.
Nosso código não usa nenhum deles.

([modelos](https://elevenlabs.io/docs/overview/models.md) ·
[expressive mode](https://elevenlabs.io/docs/eleven-agents/customization/voice/expressive-mode))

### 2.2 ASR

| `model_id` | Latência | Idiomas | Preço avulso |
|---|---|---|---|
| `scribe_v2_realtime` | ~150 ms (p95 ~250 ms) | 90+ | $0,39/h |
| `scribe_v2` | batch | 90+ | $0,22/h |
| `scribe_v1` | — | — | **removido em 09/jul/2026** |

**Em 08/jun/2026 o provider de ASR dos agentes mudou de `elevenlabs` para `scribe_realtime`,
e o valor antigo foi deprecado.** Nosso `asr: { quality:'high', provider:'elevenlabs' }`
(`elevenlabsAgentService.js:911`) está fixado no valor deprecado.
Não achei WER publicado especificamente para pt-BR.

### 2.3 Personalização em runtime — **isto é o que muda a arquitetura**

Quatro mecanismos, combináveis. A documentação diz qual preferir:

> *"Dynamic Variables are the preferred way to customize your agent's responses… offering
> better maintainability"* — os **overrides** continuam suportados para substituir
> prompt/primeira mensagem por completo.

**(a) Dynamic variables** — `{{nome}}`, case-sensitive, válidas em **system prompt**,
**first message** e **parâmetros e headers de tools**. Passadas em `dynamic_variables` dentro
de `conversation_initiation_client_data`. Suportam string/number/boolean e, desde 27/abr/2026,
**valores aninhados e listas** (`preserve_native_type`). Há 14 variáveis de sistema
`system__*` (`system__caller_id`, `system__called_number`, `system__call_sid`,
`system__conversation_id`, `system__time_utc`, `system__timezone`, `system__agent_turns`,
`system__conversation_history`…), que **não podem ser enviadas nem sobrescritas** pelo cliente.

> 🔑 **Prefixo `secret__`**: variáveis com esse prefixo só podem ser usadas **em headers** e
> **nunca entram no prompt do LLM**. É o mecanismo desenhado exatamente para o nosso
> `webhook_secret`.

**(b) Overrides por conversa** — cobrem *system prompt, first message, language, voice_id,
LLM, **`tool_ids`**, **`knowledge_base`**, text-only, stability (0.0–1.0), speed (0.7–1.2),
similarity_boost*:

```javascript
await Conversation.startSession({
  overrides: {
    agent: { prompt: { prompt: "…", llm: "gpt-4o",
                       toolIds: ["tool_…"],
                       knowledgeBase: [{ type:"file", id:"…", usageMode:"auto" }] },
             firstMessage: `Oi ${nome}…`, language: "pt" },
    tts: { voiceId: "…", stability: 0.7, speed: 1.1 }
  }
})
```

**Regras críticas:**
- 🔒 **Overrides vêm desabilitados por padrão.** Cada campo precisa ser habilitado na aba
  **Security** do agente (`platform_settings.overrides.conversation_config_override`).
  Mandar override de campo não habilitado → **erro**.
- **`tool_ids` e `knowledge_base` SUBSTITUEM por completo** — não fazem merge.
- **Omita** o que não quiser sobrescrever; não mande string vazia nem `null`.

**(c) Conversation initiation webhook** — o único caminho **verdadeiramente server-side**.
A ElevenLabs chama **o nosso** servidor no início da chamada (enquanto toca o som de conexão),
enviando `caller_id`, `agent_id`, `called_number`, `call_sid`. Devolvemos:

```json
{
  "type": "conversation_initiation_client_data",
  "dynamic_variables": { "restaurant_id": "…" },
  "conversation_config_override": { "agent": { "prompt": {"prompt":"…"},
                                               "first_message":"…", "language":"pt" },
                                    "tts": { "voice_id": "…" } },
  "branch_id": "agtbrch_…",
  "environment": "production"
}
```

`dynamic_variables` **precisa conter todas** as variáveis definidas no agente;
`conversation_config_override` é opcional. Habilita-se em dois lugares: **Settings**
(URL + secrets) e **aba Security do agente**. Exige HTTPS e auth por header.
⚠️ **Documentado apenas para inbound via Twilio.** No canal web é preciso buscar a config no
nosso backend e passar no `startSession`.

**(d) Environments + Branches** — variáveis de ambiente resolvem **URLs de tools, secrets,
headers e auth connections por ambiente** (`{{system__env_<label>}}`, com fallback automático
para `production`). Escolhe-se o ambiente por `?environment=staging` (WS), pelo param do token
WebRTC, pelo número de telefone, ou pela resposta do webhook. Branches (`agtbrch_…`, jan/2026)
dão versionamento tipo git com **split de tráfego percentual**.

([dynamic variables](https://elevenlabs.io/docs/eleven-agents/customization/personalization/dynamic-variables) ·
[overrides](https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides) ·
[initiation webhook](https://elevenlabs.io/docs/eleven-agents/customization/personalization/twilio-personalization) ·
[environments](https://elevenlabs.io/docs/eleven-agents/integrate/environment-variables))

### 2.4 Tools — "server tools" agora se chamam **webhook tools**

A URL `/customization/tools/server-tools` **retorna 404**; o path é
[`/customization/tools/webhook-tools`](https://elevenlabs.io/docs/eleven-agents/customization/tools/webhook-tools).

Quatro famílias: **webhook**, **client**, **system** e **MCP**. Tools são **objetos de
workspace com ID próprio**, referenciados via `tool_ids` — definição inline foi descontinuada
(nós já fazemos certo).

- **Auth:** OAuth2 Client Credentials, OAuth2 JWT, Basic, Bearer, headers customizados. As
  *auth connections* vivem no workspace, com status unificado (`active` / `refresh_failed` /
  `revoked` / `credential_invalid`, desde 29/jun/2026).
- **Modos de execução:** Immediate / Post-Tool Speech / Async.
- **`PreToolSpeechMode`** (`auto`/`force`/`off`) substituiu o boolean antigo (27/abr/2026).
- **Novidades 2026:** `response_filter` (corta a resposta antes do LLM, 29/jun),
  `is_omitted`/`OmitSchemaOverride` (08/jun), `allowed_values_dynamic_variable` (22/jun),
  `GET /v1/convai/tools/{id}/executions` (histórico paginado, 27/abr), e resposta de tool
  podendo **atualizar dynamic variables** com dot notation (`response.users.0.email`).
- **System tools:** `end_call`, `language_detection`, `transfer_to_agent`,
  `transfer_to_number`, `skip_turn`, `play_keypad_touch_tone`, `voicemail_detection`.

### 2.5 Post-call webhooks — substituem o nosso cron

Três tipos: `post_call_transcription` (transcript + análise + metadados + custos),
`post_call_audio` (MP3 base64, `transfer-encoding: chunked`) e `call_initiation_failure`
(`failure_reason`: `busy` / `no-answer` / `unknown`).

Assinatura **HMAC** no header **`elevenlabs-signature`**, com helper de SDK
(`elevenlabs.webhooks.constructEvent(payload, signature, secret)`) que valida assinatura **e**
timestamp. Configuração é **por workspace, com override por agente**.
⚠️ *"Webhooks that repeatedly fail are auto disabled if there are 10 or more consecutive
failures and the last successful delivery was more than 7 days ago"* — e **não há retry**.
([post-call webhooks](https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks))

APIs de leitura relevantes: `GET /v1/convai/conversations/{id}`, `…/{id}/audio`,
`…/messages/text-search`, `…/messages/smart-search` (semântica), e
`GET /v1/convai/conversations/resolve` (resolve URL de Slack/Zendesk → conversa, 20/jul/2026).

### 2.6 WebRTC virou o default — e a credencial mudou

Desde **abril/2026** o `connectionType` é inferido pelo modo: **voz → `webrtc`**,
texto → `websocket`.

| Conexão | Endpoint | Param no SDK |
|---|---|---|
| WebSocket (texto) | `GET /v1/convai/conversation/get-signed-url?agent_id=…` | `signedUrl` (expira em **15 min**) |
| **WebRTC (voz)** | **`GET /v1/convai/conversation/token?agent_id=…`** (aceita `branch_id`, `environment`, `participant_name`) → `{ token, conversation_id }` | `conversationToken` |

O `ConversationConfig` **força exatamente uma credencial, casando com o transporte**.
Nosso `elevenlabs-signed-url.js:82` chama `get_signed_url` (underscores); o doc atual grafa
`get-signed-url` (hífens) — **verificar se o alias antigo ainda responde**.
⚠️ **LiveKit:** existe página de integração LiveKit nos docs, mas ela é do **Speech Engine**,
não dos Agents — **não há confirmação de que o WebRTC dos Agents rode sobre LiveKit**.

### 2.7 Turn-taking

Config em `conversation_config.turn`
([conversation flow](https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow)):

| Campo | Valores | Default |
|---|---|---|
| `turn_model` | `turn_v2` \| `turn_v3` | **`turn_v3`** (desde 08/jun/2026) |
| `turn_timeout` | 1–30 s | **7 s** |
| `turn_eagerness` | `eager` \| `normal` \| `patient` | `normal` |
| `soft_timeout_config.timeout_seconds` | 0.5–8.0 | `-1` (desligado) |
| `soft_timeout_config.message` | string | `"Hhmmmm...yeah."` |
| `soft_timeout_config.use_llm_generated_message` / `randomize_fillers` | bool | — |
| `interruption_ignore_terms` | array | — |
| `transcribe_on_disabled_interruptions` | bool | `false` |

⚠️ **`disable_interruptions` foi DEPRECADO** → `interruption_mode` (`ToolInterruptionMode`):
`allow` \| `disable_during_tool` \| `disable_during_tool_and_turn`, com override por tool
(22/jun/2026). Novo evento WebSocket `agent_response_complete` (dispara uma vez, após LLM +
cadeia de tools + playback).

O orquestrador adiciona **<100 ms** de overhead, prevê o fim da fala do usuário e pode disparar
múltiplas gerações de LLM no mesmo turno.

### 2.8 Workflows e transferência entre agentes

**Agent Workflows** (out/2025): grafo salvo em `conversation_config.workflow` com `nodes` e
`edges`. Tipos de nó: Start, **Subagent**, **Dispatch Tool**, **Agent Transfer**,
**Transfer to Number**, End. Nós Subagent sobrescrevem prompt (append ou total), LLM, voz,
**`knowledge_base`** e **`tool_ids`**, com `entry_behavior`
(`generate_immediately`/`wait_for_user`/`auto`). Edges com condição por LLM (linguagem
natural), por expressão determinística, ou incondicionais — e edges *backward* para loops.

**`transfer_to_agent`**: `{ agent_id, condition, delay_ms, transfer_message,
enable_transferred_agent_first_message }`. **O transcript completo é preservado** para o
agente filho e as tool calls de transfer são filtradas da visão do LLM filho. O pai só
sobrescreve client events e formatos de áudio; **prompt, voz, tools e LLM resetam para a
config do filho**.
([workflows](https://elevenlabs.io/docs/eleven-agents/customization/agent-workflows) ·
[agent transfer](https://elevenlabs.io/docs/eleven-agents/customization/tools/system-tools/agent-transfer))

### 2.9 MCP

Transportes **SSE** e **HTTP streamable**. Config: `url`, `name`, `description`, `transport`,
`approval_policy`, secret token, headers customizados. Namespace `/v1/convai/mcp-servers`
(o `PATCH …/approval-policy` foi deprecado em favor do update genérico).
**`response_timeout_secs`: 5–120, default 30.** Três modos de aprovação: *Always Ask*
(recomendado), *Fine-Grained Tool Approval*, *No Approval*. Indisponível para ZRM/HIPAA.
*"You are responsible for the security, compliance, and behavior of any third-party MCP server."*

⚠️ **Não confundir** com o *ElevenLabs MCP Server* (`@elevenlabs/mcp` v0.10.0) — esse é o
inverso: expõe as APIs da ElevenLabs como tools para o *seu* agente/IDE.

### 2.10 Knowledge base e RAG

- Fontes: arquivo, URL, texto. PDF/DOCX/TXT/MD/HTML/EPUB, **máx 20 MB por arquivo**.
- **Full context** se o texto extraído couber em ~**300.000 caracteres**; acima disso, RAG obrigatório.
- **Documentos são objetos reutilizáveis** — o mesmo doc pode ser anexado a **vários agentes**.
- `usage_mode`: `auto` (RAG, recupera só quando relevante — default) vs `prompt` (sempre no system prompt).
- RAG: `embedding_model` (`e5_mistral_7b_instruct`), `max_retrieved_rag_chunks_count` (≤20),
  `max_vector_distance` (default 0.6), `max_documents_length` (10k–50k). **+~250 ms de latência.**
  Docs abaixo de **500 bytes** não indexam.
- **Limite de índice RAG por workspace:** Free 1 MB · Starter 2 MB · Creator 20 MB · Pro 100 MB ·
  Scale 500 MB · Business/Ent 1 GB.
- **KB e RAG são incluídos em todos os planos, sem cobrança adicional.**
- Novo (20/jul/2026): `POST /v1/convai/agents/{id}/knowledge-base/rag-query` (query read-only).

> Nosso doc de KB (`api/elevenlabs-kb-sync.js:25-…`) é um markdown de poucos KB (config + até
> 50 fatos do manager). **Cabe folgadamente em contexto completo** — não precisamos de RAG, e
> os 250 ms dele seriam prejuízo puro.

### 2.11 Telefonia

**Twilio nativo (recomendado para o Brasil):** importa-se o número com Account SID + Auth
Token; a ElevenLabs autoconfigura o número no Twilio. Número comprado no Twilio faz inbound e
outbound; *Verified Caller ID* só faz outbound. **Regional routing:** no Twilio, Edge Location
= **`br1` (São Paulo)**, mesma região no número na ElevenLabs, **usando uma API key regional
do Twilio**.

**SIP trunking nativo:** `sip:+55…@sip.rtc.elevenlabs.io:5060`, TCP/TLS/UDP, auth Digest ou ACL
por IP, codecs **G711 8k ou G722 16k**, SRTP opcional. IPs estáticos (Enterprise) em regiões
**eu, in, sg** — **não há PoP no Brasil**. Transfers telefônicos ganharam `uui`
(RFC 7433, SIP REFER) em 29/jun/2026.

**Regulatório BR (Twilio):** exige **CNPJ**, comprovante de endereço físico local (P.O. box e
endereço virtual recusados), documentos com menos de 1 ano; a Anatel limita 5 números
toll-free por CNPJ. O Brasil **não** está na lista de países bloqueados pela ElevenLabs.

**Custos Twilio Brasil:** número local **$4,25/mês** · inbound local **$0,0100/min** ·
outbound fixo **$0,0310/min** · outbound móvel **$0,0663/min**.

**Batch calling:** `POST /v1/convai/batch-calling/submit` — `call_name`, `agent_id`,
`recipients[]` obrigatórios; opcionais `scheduled_time_unix`, `agent_phone_number_id`,
`whatsapp_params`, `timezone`, `branch_id`, `environment`, `target_concurrency_limit`.
**Cada destinatário aceita seu próprio `conversation_initiation_client_data`** (via CSV,
colunas extras viram dynamic variables; há colunas especiais `language`, `first_message`,
`system_prompt`, `voice_id`). Concorrência = **mín(50% do workspace, 70% do agente)**.
⚠️ **ZRM não pode ser habilitado em batch calls.**

**Canais suportados** (blog de 28/jul/2026): phone, web, **WhatsApp**, Slack, Zendesk, SMS,
Telegram*, Intercom*, Freshdesk* (*alpha) — relevante para a task #79.

([SIP](https://elevenlabs.io/docs/eleven-agents/phone-numbers/sip-trunking) ·
[Twilio nativo](https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/native-integration) ·
[regional routing](https://elevenlabs.io/docs/eleven-agents/phone-numbers/twilio-integration/regional-routing) ·
[batch calls](https://elevenlabs.io/docs/eleven-agents/phone-numbers/batch-calls) ·
[Twilio BR](https://www.twilio.com/en-us/voice/pricing/br))

### 2.12 Preço (jul/2026)

| Plano | $/mês | Minutos inclusos | **Simultâneas** |
|---|---|---|---|
| Free | 0 | 15 | 4 |
| Starter | 6 | 75 | 6 |
| Creator | 22 | 275 | 10 |
| Pro | 99 | 1.238 | 20 |
| Scale | 299 | 3.738 | 30 |
| Business | 990 | 12.375 | 40 |

- Excedente: **$0,080/min — igual em todos os tiers.** Ou seja: **o plano compra concorrência,
  não desconto.** Escolha o plano pelo pico simultâneo.
- **Burst:** até **3× o limite de concorrência**, cobrado ao dobro (**$0,160/min**) —
  **degrada, não bloqueia**.
- Mensagens de texto: $0,003 cada. **KB e RAG inclusos.**
- **"There is no limit to the number of agents you can create on any plan."**
  → nossa proliferação de agentes **não custa dinheiro**; custa operação.
- **Minuto = duração da conexão**, não só a fala do agente. **Mas** silêncio de inferência é
  *"billed at 5% of the usual per minute rate"*.
- **LLM é cobrado à parte**, pass-through, debitado dos créditos ElevenLabs. **Não há tabela
  oficial por token nos docs** — precisa ser instrumentado.
- **Corte de preço em 07/mai/2026:** Agents $0,10 → **$0,08/min** (−20%); TTS Flash $0,11 →
  **$0,05**/1k chars (−55%); Scribe v2 $0,40 → **$0,22**/h (−45%); mais o lançamento de
  **Pay-as-you-go**. ⚠️ **Contas antigas precisam migrar manualmente** no dashboard
  ("Switch to new pricing").

**→ Ação imediata, custo zero: conferir se a nossa conta já está no preço novo.**

([pricing agents](https://elevenlabs.io/pricing/agents) ·
[burst](https://elevenlabs.io/docs/eleven-agents/guides/burst-pricing) ·
[corte de preço](https://elevenlabs.io/blog/weve-lowered-api-agents-pricing-and-introduced-pay-as-you-go) ·
[otimização de custo](https://elevenlabs.io/docs/eleven-agents/customization/llm/optimizing-costs))

---

## 3. Vale adotar?

Esforço: **P** ≈ até meio dia · **M** ≈ 1–3 dias · **G** ≈ 1–2 semanas.

| Recurso novo | Vale adotar? | Esforço | Risco |
|---|---|---|---|
| Verificar/migrar para o pricing de 07/mai/2026 | **Sim — primeiro de tudo** | P | Nenhum |
| Confirmar `retention_days` real e derrubar a premissa do cron de 15 min | **Sim** | P | Nenhum (só medir) |
| `eleven_v3_conversational` como TTS | **Sim** (mesmo preço, 70+ idiomas, expressivo) | P | Baixo — validar latência pt-BR em A/B contra Flash v2.5 |
| Trocar `asr.provider` `elevenlabs` → `scribe_realtime` | **Sim — valor atual é deprecado** | P | Baixo |
| Parar de usar `eleven_turbo_v2_5` como default | **Sim** | P | Nenhum |
| LLM moderno no lugar de `gpt-4o-mini` (Gemini 3.5 Flash / GPT-5 Nano / Qwen hospedado) | **Sim** | P (campo) / M (validar) | **Médio** — muda comportamento; rodar pelos *branches* A/B que já temos |
| `turn_model: turn_v3` explícito + `turn_timeout` 8 → 4–5 s + `turn_eagerness` | **Sim** | P | Baixo |
| `soft_timeout_config` (filler "hmm" no lugar de silêncio) | **Sim** — ganho de UX barato | P | Baixo |
| `interruption_mode` no lugar do `disable_interruptions` deprecado | **Sim** | P | Baixo |
| **Post-call webhooks (HMAC)** substituindo o cron 15/15 | **Sim** | M | Baixo — cuidar do auto-disable após 10 falhas; manter cron diário como rede |
| `conversation/token` (WebRTC) + `enable_auth`/allowlist | **Sim** — fecha o agente público | P–M | Baixo |
| Corrigir vazamento de tools no `deleteAgent` | **Sim** — bug | P | Nenhum |
| Twilio Edge Location `br1` | **Sim** — latência de graça | P | Baixo (exige API key regional) |
| **Agente único + initiation webhook (telefonia)** | **Sim** | M–G | Médio — webhook entra no caminho crítico; precisa fallback |
| **Agente único no canal web** | **Não ainda** — ver §4.1 | G | **Alto** — overrides são enviados pelo cliente |
| Dynamic variables `secret__` para o webhook secret | **Sim** | P | Baixo — mantém o segredo fora do LLM |
| `environments` (staging vs production nas URLs de tools) | Talvez | M | Baixo — resolveria o `VERCEL_URL` hardcoded em `:853-855` |
| Agent Workflows / sub-agentes | **Não agora** | G | Alto — um agente de reserva não precisa de grafo |
| MCP tools | **Não agora** | M | Médio — nossos webhooks já cobrem e são mais auditáveis |
| SIP trunking nativo | **Não** | M | Alto — sem PoP no Brasil; Twilio `br1` ganha |
| Batch calling / outbound ativo | Talvez, fase 2 (confirmação por voz) | M | **Alto** — consentimento/regulação; decisão de produto |
| Canal WhatsApp nativo do ElevenAgents | **Avaliar junto com #79** | M | Médio — pode conflitar com o nosso webhook próprio |
| Branches + traffic split | **Já temos — manter** | — | — |

---

## 4. Arquitetura proposta

### 4.1 A decisão central — e por que ela é **híbrida**, não "tudo em um agente"

Hoje: **N restaurantes → N agentes + 7N tools + N docs de KB.**

A tentação óbvia é consolidar tudo em **um** agente compartilhado. Tecnicamente dá:
prompt, first message, voz, idioma, LLM, **tools e knowledge base** são todos sobrescrevíveis
por conversa. Mas **o motivo tem que ser o certo, e o canal muda a resposta.**

**O que NÃO é motivo:** custo. A ElevenLabs diz explicitamente que *não há limite de agentes
em nenhum plano*, e KB/RAG são inclusos. Consolidar não economiza um centavo.

**O que É motivo — operação:**
1. **A frota está congelada.** Não existe rotina de migrar N agentes. Trocar o TTS para
   `eleven_v3_conversational` ou corrigir o `asr.provider` deprecado hoje significa escrever um
   script de `PATCH` em N agentes e torcer para nenhum falhar no meio.
2. **7 recursos de tool por restaurante**, criados em série no onboarding (8 chamadas HTTP
   sequenciais antes do usuário ver o dashboard), com falha parcial possível — e vazando na
   exclusão (§1.3a).
3. **O KB apaga-e-recria a cada mudança de config**, com 12 s de espera na rota de settings.

**O que trava a consolidação no canal web — e é o achado mais importante desta pesquisa:**

> 🔴 No widget/SDK, **os overrides e as dynamic variables são enviados pelo cliente**.
> O conversation token autentica a *sessão*, mas a documentação **não** indica que ele
> *vincula* os overrides. Um cliente malicioso pode, em tese, abrir o devtools e iniciar a
> sessão com o prompt — ou o `restaurant_id` — de outro tenant.
> O **conversation initiation webhook**, que é o caminho realmente server-side, está
> **documentado só para inbound via Twilio**.

**Por que isso não é fatal para nós:** a nossa defesa real nunca esteve no agente. Está em
`api/elevenlabs-webhook.js:115-135`, que valida **o segredo contra o `restaurant_id` que a
chamada alega**. Um atacante que forje `restaurant_id` no dynamic variable não consegue nada
sem o `el_whsec_` daquele restaurante.

**Mas isso cria um problema novo no web:** se o `webhook_secret` virar dynamic variable enviada
pelo cliente, ele passa a viver no browser. No dashboard (onde o usuário *é* o dono) é
tolerável; na página pública de reserva e no demo, **não** — um visitante qualquer passaria a
segurar o segredo do restaurante.

**Solução elegante:** no caminho web, não mandar o segredo estático. Ao emitir o conversation
token, o nosso servidor emite junto um **token curto assinado por nós** (HMAC, ~15 min,
contendo `restaurant_id` + expiração) e o passa como **`secret__booking_token`** — que, pelo
prefixo, só vai em header e **nunca entra no prompt do LLM**. O webhook passa a aceitar as
duas formas: `el_whsec_` estático (telefonia, server-side) ou token assinado e expirável (web).
O cliente não consegue forjar, e o dano de um vazamento é de 15 minutos.

**Conclusão:** consolidar **primeiro a telefonia** (onde o initiation webhook garante que a
config vem do nosso servidor), e só depois o web, com o token assinado acima. Enquanto isso,
os dois modos convivem.

### 4.2 Diagrama — caminho telefônico (agente único)

```
  Cliente disca +55 11 xxxx-xxxx
            │
            ▼
  ┌──────────────────────────────────────────┐
  │ Twilio  · número BR · Edge = br1 (SP)    │   $4,25/mês + $0,010/min inbound
  └───────────────────┬──────────────────────┘
                      │ integração nativa (Account SID + Auth Token)
                      ▼
  ┌─────────────────────────────────────────────────────────────┐
  │           ElevenAgents — 1 AGENTE COMPARTILHADO             │
  │  "Seatable Host · pt-BR"                                    │
  │    tts.model_id        = eleven_v3_conversational           │
  │    asr.provider        = scribe_realtime  ← era 'elevenlabs' (deprecado)
  │    llm                 = gemini-3.5-flash (ou Qwen hospedado)
  │    turn.turn_model     = turn_v3  · turn_timeout = 4        │
  │    turn.soft_timeout_config = { timeout_seconds: 2.5 }      │
  │    platform_settings.auth     = enable_auth                 │
  │    platform_settings.privacy.retention_days = <definido>    │
  │    tools = 7 tools ÚNICAS, com {{restaurant_id}} na URL     │
  │            e {{secret__webhook_secret}} no header           │
  └──┬───────────────────────────────────────────────┬──────────┘
     │ (1) INÍCIO                                    │ (3) FIM
     │ conversation initiation webhook               │ post-call webhook
     ▼                                               ▼
 POST /api/elevenlabs-init                  POST /api/elevenlabs-postcall
 { caller_id, called_number,                 header: elevenlabs-signature (HMAC)
   agent_id, call_sid }                      { type:"post_call_transcription",
     │                                          transcript, analysis, metadata }
     │  called_number ──► restaurant_id             │
     ▼                                              ▼
 responde:                                   grava transcript + resumo + sentimento
 { type: "conversation_initiation_client_data",     ▲
   dynamic_variables: {                             │
     restaurant_id, restaurant_name, timezone,      └── SUBSTITUI o cron
     secret__webhook_secret, hoje, horarios },          sync-conversation-data
   conversation_config_override: {                      (96 invocações/dia → 0)
     agent: { prompt:{ prompt: <persona + KB inline> },
              first_message: <saudação do restaurante>,
              language: "pt" },
     tts:   { voice_id: <voz escolhida> } },
   branch_id: <variante A/B, se houver> }
     │
     │ (2) DURANTE — as tools únicas resolvem o tenant por variável
     ▼
 POST https://seatable.one/api/elevenlabs-webhook
      ?action=create_reservation&restaurant_id={{restaurant_id}}
      Authorization: Bearer {{secret__webhook_secret}}
     │
     ▼
 api/_lib/tool-handlers.js   ──►   Supabase (RLS por restaurant_id)
   (já existe, agnóstico de pipeline — nada a reescrever)
```

### 4.3 Diagrama — caminho web (fase posterior, com token assinado)

```
 Navegador (dashboard · demo · landing)
    │  GET /api/elevenlabs-conversation-token       (JWT do usuário)
    ▼
 Vercel
    ├─ resolve restaurant_id a partir do JWT   (guarda de elevenlabs-signed-url.js:42-70,
    │                                            reaproveitada integralmente)
    ├─ assina booking_token = HMAC{ restaurant_id, exp: +15min }
    └─ GET api.elevenlabs.io/v1/convai/conversation/token
           ?agent_id=<agente compartilhado>[&branch_id=<variante>][&environment=…]
    │
    ▼
 { token, conversation_id }  +  { booking_token }
    │
    ▼
 @elevenlabs/react  startSession({
    conversationToken: token,
    connectionType: 'webrtc',                  // já é o default para voz
    dynamicVariables: { restaurant_id, restaurant_name,
                        secret__webhook_secret: booking_token },
    overrides: { agent: { prompt:{prompt}, firstMessage, language:'pt' },
                 tts:   { voiceId } }
 })
    │
    ▼
 /api/elevenlabs-webhook aceita DUAS credenciais:
    · el_whsec_…  (estático — telefonia, server-side)
    · booking_token assinado e expirável (web)
   em ambos os casos validando contra o restaurant_id alegado
```

### 4.4 O que sobrevive sem mudança

- `api/_lib/tool-handlers.js` — intacto.
- `api/elevenlabs-webhook.js` — a validação `segredo × restaurant_id` (`:115-135`) continua
  sendo exatamente a defesa certa; ganha só um segundo formato de credencial.
- `getOrCreateWebhookSecret` — mantém o segredo por restaurante para a telefonia.
- Branches / traffic split (`voice-experiments.js`) — passam a valer para a frota inteira de
  uma vez, o que os torna **mais** úteis, não menos.
- O pipeline alternativo `_voice-server` (OpenAI Realtime) e o roteamento por `voice_engine` —
  continuam como plano B.

### 4.5 Riscos e mitigação

| Risco | Mitigação |
|---|---|
| **Overrides enviados pelo cliente no web** | Consolidar telefonia primeiro. No web, token assinado e expirável em vez do segredo estático (§4.1). A validação `segredo × restaurant_id` já existente é a defesa de fundo |
| O initiation webhook entra no caminho crítico da ligação | Endpoint dedicado, sem LLM, uma query indexada por `called_number`; cache de config por restaurante; **fallback**: prompt genérico que pergunta o nome do restaurante — comportamento que `elevenlabs-webhook.js:299-307` já contempla |
| Migração big-bang | Conviver: `restaurant_config.elevenlabs_agent_id` preenchido = legado; nulo = compartilhado. Migrar por lote, demos primeiro |
| Post-call webhook auto-desabilitado após 10 falhas | Manter o cron atual em frequência **diária** como rede; alarme quando não chegar webhook em X horas |
| `tool_ids` e `knowledge_base` em override **substituem**, não fazem merge | O agente compartilhado precisa nascer com o conjunto completo de tools; qualquer override tem que reenviar a lista inteira |
| Analytics ficam sob um `agent_id` só | Segmentar por dynamic variable; a API já tem `text-search` e `smart-search` por conversa |
| Concorrência é recurso **do workspace**, não do restaurante | Monitorar pico; burst (até 3×, ao dobro) degrada em vez de bloquear; subir de plano compra concorrência |

---

## 5. Custo estimado por restaurante/mês

**Premissas** (restaurante brasileiro no plano Profissional): 150 ligações/mês, 2,5 min de
média = **375 min/mês**. Câmbio ilustrativo **R$ 5,40/US$**.

| Item | Cálculo | US$/mês |
|---|---|---|
| ElevenAgents | 375 min × $0,080 | **30,00** |
| …com desconto de silêncio (5% da tarifa em silêncio de inferência; ~20% do tempo) | 300 × $0,08 + 75 × $0,004 | **24,30** |
| LLM (pass-through, modelo barato) | ~$0,016/ligação × 150 | **2,40** |
| Twilio — número BR | fixo | **4,25** |
| Twilio — inbound local | 375 × $0,0100 | **3,75** |
| **Total** | | **≈ $35–41** |

**≈ R$ 190–220/mês por restaurante.** Contra o plano Profissional (R$ 1.497), isso é
**13–15% de COGS de voz** — saudável.

### Cenários

| Cenário | Volume | ElevenAgents | LLM | Twilio | **Total** |
|---|---|---|---|---|---|
| Baixo | 60 lig. × 2 min = 120 min | $9,60 | ~$1 | $5,45 | **≈ $16** (R$ 86) |
| **Base** | 150 lig. × 2,5 min = 375 min | $24–30 | ~$2,40 | $8,00 | **≈ $35–41** (R$ 190–220) |
| Alto | 400 lig. × 3 min = 1.200 min | $96 | ~$6,50 | $16,25 | **≈ $119** (R$ 640) |

### Duas ressalvas honestas

1. **O custo de LLM é a única variável sem preço público.** Os docs listam os modelos
   suportados mas não publicam $/token — o número acima é estimativa. Dado o histórico de conta
   do projeto, **isso precisa ser instrumentado antes de escalar, não depois**. Trocar
   `gpt-4o-mini` por um modelo caro (GPT-5.5, Claude Sonnet 4.6) pode multiplicar essa linha
   por 10–20×.
2. **O plano se escolhe pela concorrência, não pelo preço do minuto** — $0,080/min em todos os
   tiers. Com as premissas acima, cada restaurante ocupa ~2,6% de uma linha no pico (19h–21h).
   O **Scale** (30 simultâneas, $299) cobre confortavelmente **100+ restaurantes**; o
   **Business** (40, $990) dá folga para várias centenas, e o burst vai até 3× antes de haver
   qualquer bloqueio. Fórmula para recalcular:
   `simultâneas ≈ (ligações_no_pico_por_hora × duração_min ÷ 60) × N_restaurantes`.

---

## 6. Ordem de implementação recomendada

### Fase 0 — Higiene (meio dia, ganho imediato, risco ~zero)
1. **Conferir se a conta está no pricing de 07/mai/2026.** Se não, migrar → −20% no minuto.
2. **Medir `platform_settings.privacy.retention_days` real da nossa conta.** Se for 2 anos
   (default documentado), a premissa do cron de 15 min cai — ver passo 11.
3. Corrigir o vazamento de tools em `deleteAgent` (`elevenlabsAgentService.js:353-356`: ler
   `prompt.tool_ids`, não `agent.tools`) e varrer o workspace por tools órfãs.
4. Remover o default `eleven_turbo_v2_5` de `elevenlabs-voice-settings.js:127,177`.
5. Corrigir/remover o caminho morto `useSignedUrl` em `useVoiceAgent.ts:76-84`.
6. Configurar **Edge Location `br1`** no Twilio (+ API key regional).

### Fase 1 — Modernizar a frota existente (2–3 dias)
7. Escrever o script que nunca existiu: **`PATCH` idempotente em todos os agentes** com
   `tts.model_id = eleven_v3_conversational`, `asr.provider = scribe_realtime` (o atual está
   deprecado), `turn.turn_model = turn_v3`, `turn_timeout` menor, `soft_timeout_config`,
   `interruption_mode`, e LLM moderno. Com relatório por restaurante.
8. Rodar a mudança de LLM **como branch A/B** (`voice-experiments.js` já faz isso) antes de
   promover — é a mudança de maior risco comportamental.
9. Fechar o agente público: `platform_settings.auth` + trocar o front para
   `GET /v1/convai/conversation/token`.

### Fase 2 — Push em vez de poll (2–3 dias) — *ganho de custo Vercel*
10. `POST /api/elevenlabs-postcall` com verificação HMAC (`elevenlabs-signature`) usando o
    helper do SDK.
11. Rebaixar `sync-conversation-data` de ***/15 para diário** (rede de segurança), sem deletar.
    **−92 invocações/dia**, exatamente o tipo de corte que o `CLAUDE.md` manda priorizar.

### Fase 3 — Agente único na telefonia (1 semana) — *a mudança estrutural, no canal seguro*
12. Criar **um** agente compartilhado pt-BR com 7 tools parametrizadas por `{{restaurant_id}}`
    e `{{secret__webhook_secret}}`. Habilitar, na aba Security, exatamente os campos de
    override que vamos usar — e só eles.
13. `POST /api/elevenlabs-init` — resolve `called_number → restaurant_id`, devolve
    `dynamic_variables` + `conversation_config_override` com persona e KB **inline** (cabem:
    poucos KB contra o teto de ~300k caracteres, e sem os 250 ms do RAG).
14. **Convivência:** `elevenlabs_agent_id` preenchido = legado; nulo = compartilhado. Migrar
    por lote — demos primeiro, depois clientes pequenos, depois o resto.

### Fase 4 — Agente único no canal web (1 semana) — *só depois da fase 3 estável*
15. Emitir o **booking token assinado** (HMAC, 15 min) junto do conversation token; aceitar as
    duas credenciais no `elevenlabs-webhook`.
16. Migrar o front para `dynamicVariables` + `overrides`, mantendo a guarda cross-tenant.
17. Quando a frota legada zerar: apagar agentes/tools/KB antigos e simplificar
    `elevenlabsAgentService.js` (deixa de precisar de `createAgent`, `syncKnowledgeBase` e
    `deleteAgent`).

### Fase 5 — Reavaliar (não agora)
18. **Canal WhatsApp nativo do ElevenAgents** — avaliar em conjunto com a task #79, pesando
    contra o nosso webhook próprio (que já existe e já é auditável).
19. Workflows/sub-agentes: só quando o escopo passar de reserva (pedido, cobrança).
20. MCP: só se aparecer integração de terceiro que não valha um webhook nosso.
21. Batch calling / outbound: decisão de produto + consentimento, não técnica.

---

## Lacunas declaradas (não encontrei — não inventei)

- Tabela oficial de **preço de LLM por token** nos docs da ElevenLabs.
- Latência em ms do `eleven_v3_conversational` (só o qualitativo "ultra-low-latency").
- **WER/benchmark do Scribe especificamente em pt-BR.**
- TTL do conversation token de WebRTC (o JWT tem `exp`, mas o valor não é documentado).
- Default/máximo de timeout para **webhook tools** (só está documentado para MCP: 5–120 s, default 30).
- Campos exatos do payload da API de importação de número Twilio (docs só cobrem a UI).
- Confirmação de que o WebRTC dos **Agents** roda sobre **LiveKit** — a página de LiveKit nos
  docs é do *Speech Engine*. **Não afirmar sem verificar.**
- Confirmação dos tiers de $0,10/$0,12 por minuto citados por terceiros — contradito pela
  página oficial, que mostra só $0,080.
- Se o alias `get_signed_url` (underscores, usado em `elevenlabs-signed-url.js:82`) ainda
  responde, agora que o doc grafa `get-signed-url`.
