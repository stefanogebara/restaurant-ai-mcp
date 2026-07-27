# Teardown de integração — plataformas de restaurante no Brasil (27/jul/2026)

Dados brutos da pesquisa. As decisões que saíram daqui estão em
`2026-07-27-conclusoes-produto/README.md`.

Critério de honestidade: "não encontrei documentação pública" é um **dado**
(significa integração fechada), não um buraco na pesquisa. Nada foi inventado —
onde não há fonte, está escrito.

---

## Matriz de decisão

Legenda: **PLUGÁVEL** = dá pra ler conta e/ou escrever pagamento ·
**PARCIAL** = API existe mas falta a peça crítica · **FECHADO** = sem API
pública · **CONCORRENTE** = faz o que Seatable ou Racha faz.

### PDVs e gestão de salão

| Plataforma | Lê conta da mesa | Escreve pagamento | Sandbox | Classificação |
|---|---|---|---|---|
| **Abrahão** | `GET /table/{cod}/bill` | `POST /table/{cod}/payment` | n/d | **PLUGÁVEL** — o único par completo |
| **Colibri** (NCR → RS Solutions) | provável | provável ("pagar contas") | ? | **PARCIAL** — doc com DNS morto |
| **Saipos** | sim (status) | **não** | sim | **PARCIAL** — falta registrar pagamento |
| **Consumer** | não (fluxo invertido) | não | **não** | **PARCIAL** — você expõe a API, eles fazem polling |
| **Menew** (Linx) | n/d | n/d | n/d | **FECHADO** — doc no Linx Share, atrás de login |
| **TOTVS Chef** | módulos Mesa/Cartão | n/d | exige loja em produção | **PARCIAL** — roda on-premise |
| **Zig** | é o próprio PDV | — | — | **CONCORRENTE** (Zig Mesas + Reservas) |
| **Goomer** | não | não | — | **CONCORRENTE** (QR modo Mesa) |
| **Anota AI** (iFood) | não | não | — | **CONCORRENTE** (IA no WhatsApp + QR de mesa) |
| Linx Degust, Bluesoft | — | — | — | retaguarda/ERP, sem mesa |

### Reservas

| Plataforma | API pública | IA / voz | Preço | Classificação |
|---|---|---|---|---|
| **Tagme** | **não encontrada** | nenhuma | R$ 150–350/mês, 4.000+ casas | **CONCORRENTE** do Seatable |
| **Getin** | **não encontrada** | nenhuma (SMS a R$ 0,10) | R$ 239–415/mês, 3.000+ | **CONCORRENTE** do Seatable |
| **OpenTable** | **sim** (`docs.opentable.com`, OAuth2, slot lock, webhooks de PDV) | não | US$ 149–499 + taxa por cover | irrelevante no BR |
| **Restaurant Guru** | proibida por ToS | — | listagem grátis | agregador, canal — não rival |
| **ZipTable** | DNS não resolve | — | — | existência não confirmada |
| **Reserv.ai, Flly, ReservaBot, iFood "Cris"** | — | **sim, IA no WhatsApp** | — | **CONCORRENTES DIRETOS** reais |

### Pagamento na mesa / PSP

| Plataforma | Pix | Split | Self-service | Classificação |
|---|---|---|---|---|
| **Mercado Pago** | sim (QR estático/dinâmico/híbrido) | **sim** | **sim** — único | melhor plano B de PSP |
| **Pagar.me** (atual) | sim | sim, o mais maduro | não (contrato PSP) | PSP em uso |
| **Stone OpenBank** | excelente | **zero** | não | descartado por falta de split |
| **PicPay** | sim | não documentado | ? | descartado |
| **Cielo** | sim | não documentado | não | mas ver **Cielo LIO** abaixo |
| **Ame** | — | — | — | **MORTA** — cancelou a licença de IP no BACEN |
| **Qlub** | — | — | — | **CONCORRENTE DIRETO** da Racha, já no BR |
| **iFood "Na Mesa"** | pelo app iFood | não | opt-in comercial | **PARCIAL** — pedido nasce no iFood |

---

## As três integrações que destravam mais mercado

**1. Cielo LIO.** Integração *remota* por API REST aos módulos de **ordem e
pagamento** do PDV, publicação na Cielo Store. É a rota genérica mais viável no
Brasil para um terceiro ler a comanda — e vale para qualquer PDV rodando em LIO,
não um por um.

**2. Stone Connect 2.0.** Mesma ideia por outro caminho: o PDV cria ordens via
API e manda pagar no terminal (S920, Q92). Entrada pelo Programa de Parcerias,
não self-service. **Ressalva:** o Pix pelo Connect ainda constava como "em
desenvolvimento" na documentação.

**3. Abrahão.** É o único com o par completo documentado (`GET /bill` +
`POST /payment`, auth Bearer, token por estabelecimento, sem webhook — polling
por `GET /events`, que já tem os tipos `the-check` e `payment`). 25 mil
pagantes, 30 mil tablets. **Complicador:** fundiu com a Goomer, que é
concorrente da Racha.

---

## Achados que mudam premissa

**Open Delivery (Abrasel) é delivery-only.** Cobre `MERCHANT`, `ORDERS`,
`LOGISTICS` (+ beta de reconciliação financeira e contratos), Apache 2.0, spec
em `abrasel-nacional.github.io/opendelivery`. **Não tem mesa, comanda nem
reserva.** Não existe padrão aberto brasileiro que sirva de atalho.

**A Saipos tem duas APIs e só uma serve.** A *Order API*
(`saipos-docs-order-api.readme.io`) expõe consulta por mesa/comanda e o
`PUT /close-sale`. A *Data API* é **paga — R$ 59,90/mês por token-loja** — e só
cobre vendas, itens, financeiro e estoque: sem mesa, sem pagamento.
Credenciamento de parceiro em 5 dias úteis, token em 1.

**O `close-sale` da Saipos não registra pagamento.** Confirmado na doc e no
sandbox: ele sinaliza que o cliente pediu a conta (pinta a mesa de laranja para
o garçom). O body aceita só `order_id` e `cod_store` — sem valor, sem forma de
pagamento. Pedido criado manualmente no PDV nem tem `order_id`.

**Formato real do endpoint de mesa (descoberto sondando o sandbox, a doc
engana):** o parâmetro leva **colchetes literais**, um valor por chamada —
`?table=[5]` — e a resposta é um **array no topo** (mesa livre → `[]`), não
`{ sales: [...] }`.

**Correções factuais ao briefing original:** Colibri não é da Alterdata — é
NCR/Colibri, hoje do grupo RS Solutions. Menew é Linx Menew, não produto
independente.

**Reserve with Google:** Tagme, Getin, ChefsClub e OpenTable são todos parceiros
oficiais. O Seatable não é.
