# Demo Experience — "O Espelho" (2026-07-10)

**Objetivo:** transformar o demo na máquina de fechamento das reuniões que a Olímpia agenda.
Design impecável (anti-vibecoded), jornada de conversão engenheirada, oferta de 2 meses grátis.

**Base de pesquisa:** 5 agentes (2026-07-10) — conversão PLG, teardown de concorrentes,
craft visual, psicologia da oferta (BR), mapa do código. ~90 findings com fontes; os
essenciais estão destilados abaixo.

---

## 1. A tese — "demo espelho"

Descoberta central do teardown: **nenhum concorrente (EUA ou BR) faz demo personalizado.**
Slang/RestoHost usam áudios gravados de restaurante fictício; Hostie tem um "restaurante-demo"
pra ligar; Loman liga pra você — todos genéricos. A interseção WhatsApp+IA+restaurante no BR
está vazia (Blip/Zenvia não fazem restaurante; Tagme/Get In não têm IA **nem trial**).

Nós já temos o ativo que ninguém tem: o scrape do Google Maps que pré-popula o restaurante
REAL do prospect. A tese: **o mercado demonstra o produto; nós demonstramos o negócio do
prospect já rodando no produto.** O mesmo ativo, em 5 estágios do funil:

| Estágio | Mecanismo | Efeito psicológico |
|---|---|---|
| Pré-reunião | Olímpia manda voice note da IA atendendo COMO o restaurante dele + link do demo dele | endowment antes do 1º contato; show-rate ↑ |
| Na reunião | Dono manda WhatsApp real → reserva pinga no dashboard DELE (aha < 3 min) | aha = 5-10x conversão; demo controlado pelo prospect fecha 38% vs 18% |
| Fechamento | Tela de oferta sobre o dashboard co-configurado | efeito IKEA completo + zero-price effect |
| Leave-behind | Link persistente do demo + número do agente demo pra mostrar ao sócio | 4+ sessões de demo = 96% win rate; multi-stakeholder +72% |
| Ativação | Cadência D1/D3/D7 WhatsApp; marco = 1ª reserva real da IA | mata a procrastinação do período longo |

## 2. A oferta — "2 meses por nossa conta" (arquitetura)

**Tensão da pesquisa, resolvida:** PLG data diz que trial longo procrastina (61+ dias converte
~10pp pior) e card-on-file converte 3-5x. MAS: (a) somos venda assistida (motion mais
convertedor que self-serve, o gap do cartão se recupera no follow-up humano); (b) no BR
"teste grátis + cartão" é padrão de golpe documentado no Reclame Aqui; (c) Yelp valida a
estrutura exata ("$0 for up to 60 days" é o flagship deles contra o OpenTable); (d) seria o
primeiro trial da categoria no BR. → Mantemos os 2 meses, mas **engenheirados**:

1. **Nunca "teste grátis"** (semanticamente contaminado no BR). É: *a assinatura começa
   hoje; os 2 primeiros meses são por nossa conta.* Reverse trial vestido de presente.
2. **Framing:** headline "2 meses grátis" + suporte "R$2.994 por nossa conta" (precificar o
   presente — Raghubir 2004) + data exata da 1ª cobrança. Nunca "60 dias" (vira janela de
   avaliação), nunca "17% off". Preço pós-período com reframing temporal: "R$1.497/mês —
   uns R$50/dia; uma mesa de 4 recuperada paga o dia."
3. **Sem cartão no fechamento.** Compromisso sem cartão: método (Pix Automático/cartão) e
   data da 1ª cobrança acordados por escrito no WhatsApp na reunião. Dia 45: "resumo dos
   seus 2 meses" (inventário de endowment real) + link de autorização do Pix.
4. **Reversão de risco BR-nativa:** "Cancela quando quiser, com uma mensagem no WhatsApp.
   Sem multa, sem ligação, sem formulário." Mensal sem fidelidade; anual só oferecido no
   dia 60 (retenção anual 3-5x, mas vender depois do valor provado).
5. **Anti-procrastinação (o risco documentado dos 60 dias):** onboarding agendado NA
   reunião ("terça 15h conectamos seu WhatsApp — 20 min"); marco de ativação = 1ª reserva
   real atendida pela IA na semana 1; D30 mini-report WhatsApp ("a IA atendeu 47 conversas
   e agendou 31 reservas"); D60 converte por perda honesta (lista o que existe na conta) —
   sem countdown fake (fake urgency = -31/37% LTV quando detectada).
6. **Bônus bundled à la Yelp:** "importamos seu histórico de clientes grátis" (pipeline CSV
   da Phase 11 já existe).
7. **Coreografia da reunião (escada de micro-sins / IKEA):** confirma horários → confirma
   cardápio → ELE corrige algo ao vivo → ELE batiza a atendente → ELE aprova a saudação →
   "Pronto. Seu restaurante está configurado." → SÓ ENTÃO a tela de oferta.
8. **Prova social:** só verdadeira. 1 restaurante nomeado + foto do dono + 1 número
   ("recuperamos 22 reservas em março"). Nada de "3 restaurantes nos Jardins" fabricado —
   donos se checam no WhatsApp; fabricação detectada = dano de marca máximo.

**Copies da tela de oferta (3 variantes prontas, pt-BR):** ver seção 6.

## 3. Brief de design — Warm Glass endurecido (anti-vibecoded)

Warm Glass já esquiva os 2 tells mais gritantes (dark-mode-com-glow; gradiente indigo).
Risco residual: excesso de vidro, radius desorganizado, emoji-ícone, dados fake-looking,
layout de landing de kit. Regras (enforçáveis em review):

**Cor/superfície**
- R1. Zero indigo/violet/purple/fuchsia (grep falha o review). Accent = burgundy, 3-5 usos
  por tela: CTA primário, nav ativa, 1 elemento de status vivo. Só.
- R2. Vidro 1 nível de profundidade. GlassCard nunca contém outro vidro. Blur 8-15px.
  Container-em-container máx. 2 níveis; agrupar com whitespace e tipografia, não caixas.
- R3. Contraste garantido contra o orb mais escuro (4.5:1 body); fallback sólido para
  `prefers-reduced-transparency`; painel grande com scroll = achatar pra sólido + hairline.
- R4. Sombras em camadas, direção única de luz, 3 níveis nomeados (rest/raised/overlay).
  Nunca #000 puro em texto.

**Tipografia/espaçamento**
- R5. Instrument Serif display usado com coragem (é a alavanca nº1 de "hospitality, não
  SaaS template"); DM Sans no UI; `tabular-nums` em TODO número dinâmico; `text-wrap:
  balance` em headings. Formatação pt-BR sempre (R$ 1.240,00 · 19h30) — locale misturado
  é tell de demo fake.
- R6. Grid de 4px; radius com fórmula de nesting (externo = interno + padding); valores
  arbitrários (`p-[13px]`, `rounded-[13px]`) falham lint.

**Motion**
- R7. Tudo < 300ms, ease-out (`cubic-bezier(0.23,1,0.32,1)` entrada); modais 200-400ms;
  press `scale(0.97)` 100-160ms. Nunca ease-in, nunca bounce, nunca `scale(0)`.
- R8. O ÚNICO motion ambiente é o que comunica estado: reserva pingando, timer, typing da
  IA. Zero stagger de página inteira; `transition: all` falha review; `prefers-reduced-motion`
  respeitado; hover atrás de `@media (hover:hover)`.

**Conteúdo**
- R9. Zero emoji-como-ícone. Lucide, 1 stroke width, alinhado opticamente.
- R10. Dados demo indistinguíveis de produção: nomes brasileiros plausíveis, horários e
  party sizes realistas, `Aniversário` com acento.
- R11. Copy "papo de dono": ban em "revolucione/potencialize/all-in-one" e CTAs genéricos.
  Todo CTA nomeia o desfecho ("Ativar meu restaurante"). Teste: o founder falaria isso
  num café?
- R12. Estados não-happy desenhados: skeleton que espelha o layout final (zero layout
  shift), scrape falhou, demo expirado, dashboard vazio pré-scrape.

**Estrutura**
- R13. Sem kit de landing AI: sem badge-pill sobre H1, sem 3 feature-cards idênticos com
  ícone em cima, sem stat-banner row, sem 1-2-3 com círculos numerados, sem ALL-CAPS
  section labels. O dashboard ao vivo É o herói.
- R14. Enforcement estrutural: tokens semânticos, lint contra valores arbitrários,
  DESIGN.md atualizado a cada correção. Gate final de PR: "um designer retocaria isso?"
  — precisa ser não.

## 4. Débito atual (mapa do código — consertos obrigatórios)

- `DemoBanner` (urgência "N dias restantes", tiers red/amber) é **código morto** — nunca
  importado; `daysLeft` da API é buscado e nunca exibido. Religar.
- Funil de entrada (`DemoSetupPage`/`DemoSetupForm`) usa **fill flat** `bg-warm-white` +
  tokens legados — viola "página nunca tem fill flat". Redesenhar em glass.
- `RealRestaurantCard` (.glass-card) e `AIKnowsCard` (ad-hoc branco) lado a lado,
  inconsistentes. Nenhum componente demo usa os primitivos `<GlassCard>` — adotar.
- **Dois sistemas de strings** (useDemoLocale hardcoded vs i18n JSON) — unificar; wow-cards
  com fallback EN em dashboard pt-BR.
- E-mails transacionais (welcome + 3 nurtures) **inglês-only**; welcome é stub "BISECT"
  de texto puro. Reescrever pt-BR + HTML.
- Promessa de trial inconsistente: FAQ diz "todos os planos, 14 dias"; código dá trial só
  no Growth/Profissional. A oferta de 2 meses precisa reconciliar TODAS as superfícies
  (lista completa no relatório do agente 5).
- Exit-intent diverge da spec (12A-4 dizia WhatsApp CTA; implementado é "Start Free Trial").
- Wow-card frágil em F5/deep-link (depende de router state).

## 5. Plano de implementação (fases shippáveis)

**F1 — Fundação visual (Warm Glass compliance)**
Entrada /demo/setup em glass sobre gradiente; todos os componentes demo migrados pros
primitivos Glass; DemoBanner religado com daysLeft; i18n unificado pt-BR-first; estados
não-happy (R12); dados seed corrigidos (R10); regras R1-R14 aplicadas; e-mails pt-BR.

**F2 — O aha ao vivo + coreografia da reunião**
O agente demo respondendo WhatsApp/ligação REAL na reunião → reserva pinga no dashboard
(pop-in como payoff); checklist de co-configuração (micro-sins: corrigir horário, batizar
IA, aprovar saudação) com estado "Pronto. Configurado."; tela de oferta (seção 6) que só
aparece após a co-configuração completa.

**F3 — Oferta no backend**
Stripe: 2 meses (trial_period_days=60 ou coupon 100%-off-2-months) em todos os planos;
reconciliar as ~15 superfícies de copy; fluxo sem-cartão (compromisso por WhatsApp +
Pix Automático D45 — inicialmente operado manualmente); bônus import CSV no bundle.

**F4 — Leave-behind + ativação**
Link persistente compartilhável do demo (sobrevive F5/deep-link); voice note pré-reunião
gerada do scrape (integra com a Olímpia); cadência D1/D3/D7; D30 mini-report; D60
conversão por endowment. Tracking de reaberturas do leave-behind como sinal de deal quente.

## 6. Copies da tela de oferta (variantes do research, pt-BR)

**A — "Já está pronto" (endowment + presente; default):**
> **O [Restaurante] já está configurado.** Suas mesas, seu cardápio, seus horários — e a
> [nome escolhido], sua atendente de IA, pronta para atender o WhatsApp.
> **Comece hoje com 2 meses grátis.** R$2.994 por nossa conta. Você não paga nada até [data].
> ✓ Sem cartão agora — depois, Pix ou cartão, você escolhe
> ✓ Cancela quando quiser, com uma mensagem no WhatsApp. Sem multa.
> ✓ Essa semana a gente ativa seu WhatsApp junto com você (20 min)
> [Ativar meu restaurante]

**B — "Conta de dono" (loss frame + matemática/dia):**
> **Quantas reservas você perde por telefone não atendido?** Uma mesa de 4 perdida por
> semana ≈ R$800/mês indo embora.
> **Teste na prática: 2 meses por nossa conta (R$2.994).** Se em 60 dias a [IA] não tiver
> se pagado em reservas recuperadas, manda um "cancela" no WhatsApp. Sem multa, sem cartão.
> Depois: R$1.497/mês — menos de R$50/dia. Uma mesa recuperada paga o dia.
> [Começar agora — primeiro pagamento só em [data]]

**C — "Prova de vizinho" (usar SÓ com prova real):**
> **O [Peer], aqui em [bairro], deixou a IA atender o WhatsApp.** "Em março foram 22
> reservas que a gente teria perdido." — [Nome], sócio [+foto]
> Seu restaurante já está configurado — a gente acabou de te mostrar.
> 2 meses grátis (R$2.994), sem cartão, cancela por WhatsApp. Terça a gente conecta seu
> número. Quinta a [IA] atende a primeira reserva.
> [Quero os 2 meses grátis]

## 7. Fontes-chave (amostra)

- Zero-price effect: Shampanier/Mazar/Ariely 2007, Marketing Science
- Bonus > discount: Chen et al. 2012, Journal of Marketing
- Trial longo procrastina: field experiment n=680K, Frontiers in Psychology 2025
- Opt-out vs opt-in + sales-assist: growthspree/visionary-marketing benchmarks 2026
- Demo interativo 38% vs screen-share 18%: optif.ai n=939
- "Teste grátis+cartão = golpe" no BR: Reclame Aqui (múltiplos)
- IKEA effect exige conclusão: Norton/Mochon/Ariely 2012, HBS
- Prova local "guests in this room": Goldstein/Cialdini 2008
- 16 tells de AI slop: developersdigest.tech; 7 sinais: Fountain Institute
- Motion premium: Emil Kowalski (emilkowal.ski, skills repo)
- Glass a11y: NN/g, Axess Lab
- Yelp "$0 up to 60 days": business.yelp.com
- Toast playbook: OpenView/BVP memos
