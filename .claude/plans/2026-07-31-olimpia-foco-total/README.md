# Olímpia — foco total (prospecção, qualidade, treino, canais)

Mandato do fundador (31/jul): foco total na Olímpia — prospecção, qualidade das
respostas, templates, UI, fluxo de demo e "treinamento do modelo". US$175 de
créditos (Opus/Fable) para o treino. Depois: teste ponta a ponta do WhatsApp,
ElevenLabs (voz conversacional) e Instagram.

Tasks: #77 (treino/eval) · #78 (coerência+persona) · #79 (WhatsApp e2e) ·
#80 (ElevenLabs) · #81 (Instagram) · #82 (UI).

## O que "treinar a Olímpia" significa aqui

Não é fine-tuning (créditos de API não treinam pesos do Claude). É o loop:

```
conversas reais ──► JUIZ (Opus 5) audita cada thread com rubrica
                        │
                        ▼
                SÍNTESE (Fable 5) propõe o MENOR conjunto de
                mudanças de persona/template com maior impacto
                        │
                        ▼
                aplicar → medir de novo (eval-002, 003…)
```

Infra que já existe e o loop reaproveita:
- **Style pack** versionado em DB (camada de humanização que o "gym" da fase 10
  ajustava sem deploy) — mudanças de estilo entram por aí.
- **A/B de intro** com funil por variante (`prospect_variant_funnel`) — ativado
  hoje (A + C, 50/50).
- **Pipeline de template**: criar → submeter à Meta → aprovar → ativar
  (endpoint `template-create` sob CRON_SECRET, entregue 30/jul).

Harness: `scripts/olimpia-eval.js`. Saídas numeradas neste diretório
(`eval-001-relatorio.md`, `eval-001-sintese.md`; JSON bruto no scratchpad).

## DECISÃO #1 — RESOLVIDA (31/07, delegada pelo fundador): caminho (a), Racha fica

Racional: a decisão do wedge (22/07) foi reafirmada por todo o movimento desde
então (persona no-call, kit de implantação, ICP, digest); a única conversa
humana pós-flip (La Braciera Higienópolis) fluiu bem no pitch Racha; flipar
produto pra combinar com template antigo seria o rabo abanando o cachorro.

Executado: racha_intro_a (touch1/E, id 1091894500166229), racha_intro_b
(touch1/F, id 1515560346988125), racha_toque2 (touch2/B, id 1531080604707580) —
todos PENDING na Meta, registrados INATIVOS.

QUANDO APROVAREM: ativar E+F no touch 1 e DESATIVAR A+C (Seatable); ativar B no
touch 2 e desativar o A antigo (corpo ainda não auditado). Até lá: NENHUMA intro
nova (disparo é manual; basta não disparar). Toques 2/3 dos 4 leads de 30/07
continuam na escada Seatable — coerente dentro da própria cadeia de template.

### Contexto original da decisão


**Produção vende Racha** (`PROSPECTING_PRODUCT` ausente → default `racha`,
decisão "Racha como wedge", 22/07). **Mas todos os templates de intro aprovados
na Meta são copy de Seatable:**

| template | copy | problema com a persona Racha |
|---|---|---|
| A `olimpia_intro` (ativa) | "lotar mesas… atendimento por IA" + **"conversa rápida de 30 minutos?"** | produto errado **e** promete call que a persona é proibida de marcar |
| C `olimpia_intro_c` (ativa) | dores de reserva/ligação | produto errado |
| toque 3 (breakup) | neutra | ok para ambos |
| toque 2 / resgate | corpo não registrado localmente | auditar (provável era-Seatable) |

Consequência viva: o lote de ontem (5 leads) recebeu intro Seatable e a única
conversa que andou (La Braciera, bot) já levou pergunta de Racha ("como fecham
a conta quando a mesa divide?"). Quem lê vê dois papos diferentes.

**Caminhos (escolha do fundador):**
- **(a) Manter Racha** → aprovar os rascunhos de template Racha (abaixo),
  submeter à Meta, ativar quando aprovar. Até lá: não disparar intro nova
  (disparo já é manual; basta não disparar).
- **(b) Flipar para Seatable** → `PROSPECTING_PRODUCT=seatable` na Vercel +
  redeploy; templates atuais passam a bater 100%. Contradiz a decisão do wedge.

Rascunhos Racha para aprovação (voz da Olímpia, sem call, com porta de saída):

> **racha_intro_a** — "Oi, tudo bem? Aqui é a Olímpia, do Racha. Achei o {{1}}
> pelo Google e fiquei curiosa com uma coisa: na correria, o que mais trava na
> hora de fechar a conta — a fila no caixa, a dividida da galera, ou a
> maquininha passando de mão em mão? É isso que a gente resolve: o cliente paga
> a parte dele pelo QR da mesa, em segundos. Se não for prioridade, sem stress —
> é só me dizer que encerro por aqui."

> **racha_intro_b** — "Oi! Aqui é a Olímpia, do Racha 🙂 Vi o {{1}} no Google e
> queria te fazer uma pergunta rápida de quem vive salão: quando a mesa pede pra
> dividir a conta, como vocês fazem hoje? A gente deixa cada um pagar a própria
> parte pelo QR, sem app e sem maquininha rodando a mesa. Se quiser, te mostro
> em 10 segundos, direto do seu celular."

> **racha_toque2** (bump D+3, produto-neutro de propósito) — "Oi de novo 🙂 Sem
> pressa — só passando pra saber se viu minha mensagem. Se fizer sentido, te
> mostro na prática em 10 segundos, do seu próprio celular. Se não for o
> momento, me avisa que paro por aqui."

## Achados estruturais já colhidos (pré-eval)

1. Produto × template (acima) — decisão pendente.
2. **Modelo do agente ao vivo é `anthropic/claude-sonnet-4`** (AI_MODEL default
   em ai-client.js) — geração antiga. Candidato a upgrade (sonnet-4.6 ou 4.5)
   DEPOIS do baseline do eval, uma variável por vez.
3. Corpo de toque 2/resgate não registrado localmente (`body_preview` vazio) —
   recuperar da Meta e auditar.
4. `semHumanoNaThread` (sweep de limpeza do funil) existe e **não tem chamador**
   — funil conta bot como conversa. Ligar o sweep é candidato pós-eval.
5. Chave dos US$175: formato `sk-`+48, **401 em Anthropic/OpenAI/OpenRouter** —
   aguardando o fundador dizer de qual plataforma veio. Juiz roda via OpenRouter
   até lá.

## Ciclo 2 — o que a síntese pediu vs. o que o sistema já tinha

Duas das 5 propostas do Fable partiam de um modelo ERRADO do sistema. Verificar
antes de construir evitou duas obras inúteis:

| proposta | veredito | ação |
|---|---|---|
| Gate de nudge sem humano | **procede** — 8/25 threads | ✅ implementado (59a4281c) |
| Trava 30d pós-recusa | **já existe** — `selectNudgeStates` só aceita `conversando`/`agendando`; `recusou` nunca é nudgeado | nada a fazer |
| Anti-rajada "o código não tem guard" | **falso** — existem DOIS: coalescing de inbound (7s/24s) e split cap 2 | ver abaixo |

**O achado real da rajada:** o prompt manda *"UMA mensagem por turno... NÃO
quebre em várias bolhas"* e o código splitava em até 2 **por padrão**. Prompt e
código se contradiziam; o código ganhava. Resolvido com
`PROSPECTING_MULTIPART=0` (Production) — alinha os dois, é reversível por env
var, e segue a mesma trajetória de sempre (3 → 2 → 0: bolha extra denuncia
automação).

## Fases seguintes

- **#79 WhatsApp e2e**: payload inbound sintético assinado com META_APP_SECRET
  contra o webhook de produção, lead de teste no número do fundador → responder
  → entrega real. Cobre roteamento de demo.
- **#80 ElevenLabs**: levantar Conversational AI/Agents atual vs. nosso
  elevenlabsAgentService (agentes por restaurante, KB sync, signed URL);
  proposta de arquitetura + custo.
- **#81 Instagram**: DM via Graph API (mesmo app Meta, webhook assinado igual
  WhatsApp); requisitos de app review; espelho do whatsapp-webhook.
- **#82 UI**: auditoria Playwright do console de prospecção (funil A/B, lista,
  takeover, kill switch).

## Registro de decisões

- 31/07: C aprovada na Meta; A+C ativadas em A/B (origem: registro, sonda ok).
- 31/07: La Braciera (Morumbi e Higienópolis) parqueadas em `porteiro`.
  Higienópolis parqueada por engano de filtro — auditada por id: TINHA humano
  respondendo discovery Racha; revertida pra `conversando`. Busger Higienópolis
  (atingido pelo script de conserto com o MESMO vício de filtro) desfeito.
  Lição em tasks/lessons.md: mutação de lead só por id.
- 31/07: eval-001 baseline + 5 mudanças de persona aplicadas (443cd771).
- 31/07: chave dos US$175 identificada — AgentRouter (agentrouter.org),
  superfície OpenAI-compatível, catálogo SÓ Opus (sem Fable). Chave AUTENTICA
  via Node, mas o filtro de conteúdo deles BLOQUEIA os payloads do eval
  (transcrições reais) — "content-blocked". Créditos inutilizáveis pro juiz;
  harness ganhou roteamento com fallback automático pro OpenRouter e fica
  pronto caso o suporte deles libere. Não contornar filtro de conteúdo.
- 31/07: DECISÃO (a) executada — 3 templates Racha submetidos (PENDING).
- 31/07: INCIDENTE DE SALDO — conta OpenRouter em US$-0,03 (325,03/325) com
  painel verde; a agente ao vivo a um fio de emudecer. Sonda ganhou verificação
  de saldo (falha ≤0, atenção <5). Eval-001 consumiu parte dos últimos dólares.
  Recarga é do fundador. WhatsApp e2e (#79) ADIADO até a recarga — cada reply
  aprofunda o negativo e um 402 no meio invalidaria o teste.
