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

## DECISÃO PENDENTE #1 — o desalinhamento produto × template (estrutural)

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
  Higienópolis parqueada por engano de filtro (não auditada) — o eval verifica a
  thread e reverte se houver humano.
