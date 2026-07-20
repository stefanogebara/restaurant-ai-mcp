# Racha — Pay-at-table / check-splitting for Brazil
## Comprehensive market, product & architecture analysis

**Date:** 2026-07-17
**Research basis:** 8-agent workflow (`racha-market-research`, run wf_bb8e6ccf-840): 4 deep-research streams (sunday, Brazil competitors, payment rails/regulatory, market sizing) + completeness critic + 3 gap follow-ups (qlub Brazil reality, POS API access, real adoption rates). ~135 sourced findings. Per-stream dumps in session scratchpad (`wf-*.md`).

---

## 1. Executive verdict

**The naive thesis — "Sunday doesn't exist in Brazil, let's clone it" — is false in both halves.**
It DOES exist in Brazil (qlub, $72M raised, live since 2022 with 27 POS integrations and a
Ticket/Edenred partnership), and cloning it standalone is the pattern that has **never worked
anywhere**: sunday collapsed from 7 countries to 3 and survived only via hardware + a consumer
fee that got it class-actioned; me&u/Mr Yum had to merge in the world's best QR market; Liuv
(the Brazilian native, Cielo-backed) is dead; iFood — with the largest consumer distribution
in Brazilian foodservice — killed its own dine-in QR product in April 2024.

**But the research reveals a real opening, and it is exactly Seatable-shaped.** The only
structurally comfortable positions in this category are *anchored* ones:
(a) POS owning it natively (Toast), (b) **a reservation/CRM platform bundling it as
expansion revenue** (TheFork PAY, Zenchef Pay), (c) vertical fintech with hardware
(sunday post-pivot). Position (b) is us. Meanwhile the only funded player in Brazil (qlub)
shows every sign of maintenance mode: zero Brazil disclosures since Mar/2023, zero Brazil
job openings (15 open roles, all Gulf/SEA/US), 745 Instagram followers, no Reclame Aqui
page, India quietly dropped from its market list.

**Recommendation: build it — as a separate product and brand, but NOT as a separate
standalone company yet.** Sell it through the same machine (Olímpia + the 4.6k-lead SP
database), gate everything on a 20-venue SP pilot with a hard adoption threshold, and
formalize the holding only after the pilot proves the unit economics that killed everyone
else don't kill us.

---

## 2. What the research established (the load-bearing facts)

### sunday (the archetype)
- $124M raised in 2021, 7 countries, then July 2022: headcount 400→100, exited 4 markets.
  Post-mortem causes: thin payments margins can't fund blitzscaling; POS vendors bundle
  QR-pay free (Toast); post-COVID QR fatigue; investor pivot to profitability.
- Survived by going deep in US/UK/France, adding a **hardware terminal** (PAX A920, Dec/2024)
  and a **consumer-side 0.5–2% checkout fee** — which produced a Jan/2026 US class action
  (Hoke v. Sunday App) for hidden drip pricing. Venue count is FLAT since 2022 (~3.5k).
- Published benefits (self-reported): 12 min saved/table, +11–18% tips, +12% check,
  5x Google reviews, 70-83% guest adoption. All from upscale full-service in card-first markets.

### qlub (the incumbent we'd actually fight)
- Entered Brazil Mar/2022 (first transaction Jul/2022), SP-based, $72M total funding,
  Series B Jul/2025 (Mubadala, Mastercard minority). Brazil still listed as active market.
- Localized properly: Pix + Apple/Google Pay + the deepest voucher stack (Ticket, Sodexo,
  VR, Flash, Caju, Swile, iFood Benefícios) + **exclusive-feeling Ticket/Edenred deal**
  (zero fee on Ticket payments, 50% off implementation). 27 Brazilian POS integrations.
- BUT: no Brazil venue count ever published; no BR press since Mar/2023; no BR job openings;
  global growth slow (2,000→3,000 venues in 28 months); clients real but modest
  (Gurumê, Casa Bauducco, Rei do Mate, Terraço Gastronomia, Villa Gusto).
- Pricing shape (best evidence): restaurant-side ~1.5–3% of GMV + implementation fee +
  SaaS extras + instant-settlement upsell. **No consumer fee in Brazil.**

### The adoption ceiling (the single most important finding)
- qlub's own Brazilian testimonial page has the owner of Terraço Gastronomia conceding
  adoption stayed **below his 70% expectation — "é uma questão cultural."**
- The only >80% Brazilian case is Villa Gusto — a **por-quilo buffet** where QR replaced a
  12-cashier queue. Queue-replacement formats work; waiter-served tables resist.
- Structural exclusions: ~12% of foodservice TPV is meal vouchers + ~10% cash → ~22% of
  volume can't ride a generic web checkout. 52% of Brazilians still *prefer* credit cards
  (parcelamento/points) despite 87% using Pix.
- The incumbent UX is strong: the maquininha comes TO the table and splits N ways; comanda
  individual pre-solves splitting in bars/botecos.
- Negative signals: iFood killed Na Mesa (Apr/2024); 11% of restaurants adopted-then-abandoned
  QR menus; SP (Dec/2025) and RJ passed printed-menu laws; Outback/Madero needed R$10–20
  discounts to induce QR payment.
- **Defensible planning band: 10–30% of checks migrate in committed full-service venues;
  60–85% only in queue formats.** The imported "40%" assumption has zero Brazilian evidence.

### Rails & regulatory (all green lights, with guardrails)
- **Buildable without a BACEN license** by riding a licensed PSP with split-settlement
  (Pagar.me/Stone, Iugu, Asaas, Zoop, Dock, Mercado Pago). Pure tech layer that never
  holds funds stays outside Res. BCB 494/2025. Sub-acquirer obligations bind at R$500M/yr.
- **Pix dynamic QR (Pix cobrança)** is the perfect primitive: per-charge txid, webhooks,
  instant D+0 settlement, ~0.99–1.19% cost. Pix NFC is negligible (~1M tx/mo) and blocked
  on iPhone pending the CADE-Apple settlement — QR-first, NFC later.
- Card MDR 2–4% credit (D+30, anticipation 1–2.5%/mo), debit ~1%. VR/VA capped 3.6% MDR
  (contested by injunction).
- **Tips:** Lei 13.419/2017 + STJ Tema 1102 — the 10% belongs to employees, must run through
  payroll; digital tips must settle to the restaurant CNPJ flagged for distribution, never to
  waiters' personal Pix keys. The serviço must be optional/removable in the UI.
- **Consumer fee: don't.** STJ tolerates a disclosed convenience fee; PROCON-SP is hostile;
  sunday got class-actioned. Lei 13.455/2017 legalizes Pix discounts (steering lever).

### POS access (the feared blocker, mostly disproven)
- Two commercially open, documented check-level APIs: **NCR Colibri Cloud REST**
  (explicitly "consultar mesas… lançar pedidos, **pagar contas**"; ~30k BR clients; SDK +
  marketplace + validation path) and **Oracle Simphony STS Gen2** (Checks API standard).
- Mid-market leaders (Saipos, Consumer, Sischef, EPOC, TOTVS Chef, Teknisa) publicly
  document order-IN only; payment write-back is bilateral (qlub got it — proof it's grantable).
- Watch-outs: iFood bought Saipos+OPDV+3S (Apr/2025) to monetize the salão (Maquinona);
  Consumer signed an "exclusive" comanda deal with Cielo LIO; Stone-owned Linx Degust is the
  one major absent from qlub's list. Zak is a subacquirer (closed by design).

### Market size (honest numbers)
- Brazil: ~1.4–1.8M foodservice points, but only ~85–135k true full-service restaurants.
  SP city: ~110k foodservice points, **~12.5k full-service restaurants** (SinHoRes).
- SP-city full-service dine-in table-payment volume ≈ **R$8–15bn/yr** (SAM).
- Realistic capture: venue doing R$1.8M/yr × 85% dine-in × **20% migration** ≈ R$300k
  captured TPV/venue/yr. At ~1% blended take + R$299/mo SaaS:
  - 100 venues ≈ R$0.6–0.9M ARR
  - 500 venues (4% of SP full-service — aggressive) ≈ **R$3–4.5M ARR**
- **Conclusion: a solid second product line with shared CAC; NOT a standalone venture-scale
  business on SP full-service alone.** Expansion vectors that change the math: queue formats
  (por-quilo/food halls), bars via tab-view (comanda digital), other capitals, voucher rail.

---

## 3. Strategy

### Positioning
**"O jeito mais rápido de fechar a conta"** — not "an app to split bills."
Restaurant-side pitch (the buyer): faster table turns at peak (the #1 painkiller — 12–16 min/table
claimed by both sunday and qlub), more tips for staff (payroll-compliant), more Google reviews,
zero hardware, cheaper than card-machine MDR when volume steers to Pix.
Diner-side promise: no app, no signup, no fee — scan, see the conta, split, Pix, done.

Racha vs Seatable: two brands, one company (for now). Racha = transactional, consumer-visible,
bares+restaurantes. Seatable = operational CRM/reservations for full-service. Cross-sell both
directions; the Racha data exhaust (who dined, spend, frequency) feeds Seatable's CRM as the
retention hook.

### ICP (in order of attack)
1. **SP mid/upscale full-service on NCR Colibri** — the segment with the shared-check pain
   AND the open API AND Seatable overlap. (Groups/dinner, ticket R$300–600/table.)
2. **Por-quilo / food-hall / counter formats** — where Brazilian adoption is PROVEN (80%+),
   check-read is trivial (balança/PDV total), and queues are the pain. Different pitch: fire
   your queue, not your waiter.
3. **Bares with comanda individual** — phase 2: digital comanda view + self-checkout
   (view your own tab, pay and leave). Bigger pool (37k bares in SP state) and the comanda
   culture becomes an ally instead of an obstacle.

### Monetization (sunday's lawsuit and Pix economics both say: no consumer fee)
- SaaS: R$199–399/mo (Goomer-anchored, cheaper than Zak's take).
- Payments: Pix at cost +0.3–0.5%; cards pass-through PSP MDR +0.5–1%; instant-settlement upsell.
- Later: voucher acceptance (needs an Alelo/VR/Pluxee conversation — qlub locked Ticket),
  Racha→Seatable CRM upgrade path.
- Kill criterion for the whole bet: pilot venues must show **≥25% of checks migrating by
  week 8** and restaurant retention after the trial; below that, park the product (the
  research says the category dies on adoption, not on tech).

### GTM (the unfair advantage)
- **Olímpia sells it.** Same prospecting machine, second offer: leads that rejected "CRM/
  reservas" get the "fechar conta mais rápido" pitch — bares/casual venues that were dead
  leads for Seatable become Racha ICP. The prévia gets a Racha act (mock conta of THEIR venue).
- Founder-led pilot: 10–20 venues in 2–3 SP neighborhoods (density beats breadth — sunday's
  own recovery lesson), free 60-day pilot, waiter incentive plan (tips uplift is the staff
  bribe; the server is the real distribution channel — sunday's Trustpilot shows what happens
  when servers hate it).
- Do NOT blitz. qlub's Brazil story (1,000-venue target, achieved unknown, then silence) is
  the cautionary tale.

### Holding structure
Defer legal restructuring until the pilot passes its gate. Sequence: (1) Racha as product
line + separate brand/repo/infra now; (2) if pilot passes, spin into its own CNPJ under a
holding with Seatable; (3) revisit at first external capital. Reason: every week spent on
entity structure before 20 venues use the product is waste — and the category's base rate
argues for cheap validation first.

### Naming
"Racha" is strong (the verb Brazilians already use) but collides with street-racing slang
and needs an INPI search. Alternatives to test: **Rachou**, **Fechô**, **Dividi**, **Contati**.
Domain + INPI class 36/42 check before any public use.

---

## 4. Product spec

### v0 — pilot (8–10 weeks of build)
**Flow:** QR (table-specific, printed stand) → conta view → split (equal N / by item /
custom amount) → optional 10% serviço (removable, pre-selected) → pay (Pix dynamic QR
in-flow; card via PSP checkout fallback) → receipt via WhatsApp → Google-review prompt.
- Check source v0: **Colibri Cloud API** (integrated venues) + **manual/PDV-total mode**
  (non-integrated: waiter enters total or imports items via our lightweight panel) —
  qlub's own fallback pattern.
- Split engine: deterministic, centavo-exact (largest-remainder allocation), partial-payment
  state machine on the check (paid/pending per share), table closes only at 100%.
- Tips: settle to restaurant CNPJ, flagged in the split rules + report for payroll (Lei
  13.419-compliant); NEVER to personal Pix keys.
- Restaurant panel: live tables/checks, payment status, end-of-day reconciliation export,
  waiter leaderboard (tips).
- Payments: one split-PSP partner (RFP: Pagar.me Customizado vs Zoop vs Iugu — negotiate
  Pix ≤0.8%, card MDR pass-through, split rules, D+0 Pix settlement). We are never
  merchant-of-record; funds flow PSP→restaurant subaccount.
- WhatsApp receipt → Racha's own consumer graph seed (LGPD: contract-execution basis,
  explicit opt-in for marketing).

### v1 — after pilot gate
Oracle Simphony integration; 2–3 bilateral POS deals (Consumer/Sischef/EPOC — qlub proved
grantable); voucher rail talks (Alelo/VR/Pluxee); comanda-digital mode for bares;
por-quilo mode (scale integration); Pix NFC when the Apple/CADE settlement lands;
loyalty/CRM bridge to Seatable.

### Explicitly NOT building
- OCR receipt scanning (can't close the loop, no restaurant value, no moat).
- Consumer app download (browser-only, like every survivor).
- Consumer-side fee (litigation + trust; monetize the restaurant).
- Order-at-table v1 (that's Goomer/Takeat's saturated turf; we enter at the CHECK).
- Hardware (that's sunday's $124M lesson, not our wedge).

---

## 5. Architecture

**Separate everything** (per founder decision): new repo, new Supabase project, new Vercel
project, own domain. Shared: nothing at the code level; patterns and sales channel only.

```
racha/
├── apps/web          # diner PWA (React/Vite, mobile-first, no login) + restaurant panel
├── api/              # Node serverless (Vercel) — same idioms as Seatable
│   ├── _lib/checks/  # check model, split engine (pure), state machine
│   ├── _lib/pos/     # POS adapters: colibri.ts, manual.ts, (simphony.ts)
│   ├── _lib/pay/     # PSP adapter (split rules, Pix cobrança, webhooks), tips routing
│   └── webhooks/     # PSP payment confirmations (idempotent, wamid-style dedup)
├── supabase/         # own project: venues, tables, checks, check_items, payments,
│                     #   splits, tips_ledger, pos_credentials (vault), events
└── .claude/agents/   # the agent OS (below)
```

Key decisions baked in from day 0 (Seatable lessons applied):
- **Pix-first, QR-based, browser-only**; card fallback via PSP-hosted field (we never touch PANs → minimal PCI scope).
- Payment state machine is event-sourced (every webhook appended, never mutated) — money
  bugs must be replayable.
- All money paths through SQL RPCs with explicit error checks (the PostgREST UPDATE+or
  lesson from Seatable, learned the hard way).
- Reconciliation job from day 1: PSP ledger vs our splits, alert on drift ≥ 1 centavo.
- Kill switches per venue + per rail (cron_config pattern).
- LGPD: consumption data under contract-execution basis; DPO note; no cross-product data
  sharing without explicit consent (holding-clean).

### Agent OS (`racha/.claude/agents/`)
Curated per our earlier discussion — loud failures, no silent-success:
- `market-scout` — ongoing competitive watch (qlub moves, iFood salão, POS M&A).
- `product-strategist` — PRD owner; grounded in pilot telemetry.
- `payments-architect` (top reasoning tier) — PSP integration, split correctness, fund-flow design.
- `builder` (fast tier) — implementation against the spec.
- `code-reviewer` + `security-reviewer` + `fintech-compliance` — **mandatory gate on any
  code that moves money**; compliance agent carries Lei 13.419 / Res. 494 / LGPD checklists.
- `e2e-runner` + daily canaries — a scripted synthetic check: open check → split 3 ways →
  2 Pix + 1 card → reconcile to the centavo. Runs against staging daily; a red canary
  pages, never silently logs.
- Report-card: pass/fail log per task type (no autonomy-graduation ceremony; money code
  always gates through review).

---

## 6. Risks (ranked)

1. **Adoption ceiling (kills the category, not just us):** Brazilian full-service diners may
   cap at 10–20% QR usage. Mitigation: pilot gate ≥25%; waiter incentives; queue-format ICP
   where 80% is proven; kill/park discipline.
2. **qlub wakes up** (Mastercard money, Ticket exclusive): compete on segments they ignore
   (por-quilo, bares) + Seatable bundle economics they can't match.
3. **POS platform risk** (iFood/Stone/Cielo closing APIs): stay multi-adapter, lead with
   Colibri/Simphony (open), keep manual mode as universal fallback.
4. **Thin unit economics:** Pix kills spread; SaaS-first pricing; treat payments margin as
   upside, not the model.
5. **Regulatory drift** (Res. 494 perimeter, conta-bolsão reclassification): payments counsel
   opinion on fund-flow design before pilot; never hold funds.
6. **Focus tax on Seatable:** Olímpia's funnel is 3 days old and unproven; Racha build must
   not starve the thing that pays for it. Sequence: Seatable to first paying customers, Racha
   v0 build in parallel via agent OS, founder time majority on Seatable until pilot start.

## 7. Next actions
1. Founder validation sprint (1 week, zero code): pose as buyer to qlub's WhatsApp sales
   (pricing/take-rate), call 2 qlub venues (Terraço, Villa Gusto) for real adoption %, ask 10
   Olímpia-warm restaurant owners "would you pay R$299/mo for faster table turns?"
2. PSP: **DECIDED 2026-07-19 → Pagar.me (Stone)** — full decision record +
   activation runbook in `racha/docs/psp/README.md`. Deciding facts: Stripe's
   Pix for Brazil-based businesses is invite-only (kills the wedge); Pagar.me
   has native Pix + recipient split (no custody) + documented Google Pay web.
   Trade accepted: no web Apple Pay today → phase 2 = apply for Stripe's Pix
   invite in parallel; if granted, Stripe becomes a card/Apple-Pay-only
   secondary adapter (the adapter layer routes per method by design). The
   real adapter (`api/_lib/pay/pagarme-psp.js`, verify-by-refetch webhooks,
   split-always) is BUILT and tested; founder does account + keys + webhook
   config per the runbook. House-account LOADS stay Pix-only. Payments-counsel
   opinion still pending (unchanged).
3. NCR Colibri partner application (validation path is documented).
4. INPI/domain search on names.
5. If all four come back alive → scaffold `racha` repo + agent OS, build v0 (8–10 weeks),
   20-venue SP pilot.

## 8. inKind deep-dive (2026-07-19)

Research: 8-agent workflow (model mechanics, economics/health, category comparison,
Brazil applicability + critic follow-ups on the Rewards Network precedent, renewal
behavior via SEC filings, and Brazilian breakage/funding law).

**Correction to earlier framing:** inKind never acquired Seated — Seated went to Sofar
Sounds (Feb 2021) and still operates independently. Do not cite that premise anywhere.

### 8.1 What inKind actually is
A restaurant-**financing** company wearing a dining-rewards app; pay-at-bill is only its
redemption rail. Mechanics: buys F&B credit at 2:1 — $1 cash per $2 face (audited
confirmation in Gin & Luck / Death & Co SEC filings) — and resells it to ~5M app users at
~65–83% of face via bonus bundles (25–33%), inKind Pass ($9.99/mo, ~20% back in credit),
and Costco cards (~25–35% off). Margin = spread + breakage (earned rewards expire ~2
months after the month earned) + float + subscription. It is a POS *tender*
(Toast/Square/Lightspeed/SpotOn), not an acquirer — no MDR; tips always go to the card.
Scale: 7,700+ US locations, $600M+ deployed, ~$350M GOV 2025; essentially bootstrapped
(~$5M) for 8 years, then $450M (Feb 2026) + $320M Liberty Mutual debt (Jul 2026).
US-only; zero Brazil/LatAm signal.

The marketing ("no debt, never pay us back") omits the machine: an **all-assets security
interest** on partner venues (audited, Gin & Luck FY2025), a **credit-buyback clause**
converting slow-redeeming credit into an interest-bearing loan, exclusivity terms,
effective cost to the restaurant of ~52–55% of face (Fork CPAs), and pilot-tranche
underwriting: $5–10k/unit test → observe redemption 30–60 days through the app → full
funding paced ~24 months at 2–4% of daily revenue, human Chief Risk Officer + "Sherlock"
AI. The claimed "<1%" is a *closure* metric, not a loss rate.

### 8.2 The 40-year control experiment: Rewards Network
The identical model (cash for 2:1 dining credit + consumer rewards network) has run since
1984 as Transmedia → iDine → Rewards Network, with audited SEC data through full cycles:
- Steady-state credit losses **4–6% of program sales**, 8.5–12.5% in stress years;
  loss allowance hit **21% of the portfolio** at the 2008 trough. inKind's young,
  expansion-era book has never seen a downturn.
- Two near-death episodes, both self-inflicted growth pushes (loosened underwriting →
  write-offs doubled, CEO fired).
- Structural adverse selection in renewals (RN's own 10-K): successful restaurants
  graduate and leave; RN fires the deteriorating; the book re-originates from distressed
  supply forever.
- Merchant backlash: California class action alleging effective APRs to 419%; ~$30M
  settlement ≈ 40% of a year's net revenue. The usury-recharacterization risk maps
  directly onto any Racha advance recovered via checkout splits.
- Survived 2008–09 only by **shrinking the credit leg 24% and growing the zero-capital
  demand leg** — the finance product is pro-cyclical and contracts exactly when
  restaurants most need cash. Endgame after $2B deployed: ~$120M take-private; today a
  white-label utility running every US airline dining program.

**Verdict: the durable asset is the demand/redemption channel, not the credit book.**
inKind's real innovation is distribution (app, Costco, corporate perks, house accounts),
not finance. SEC repeat-behavior data confirms a barbell: marquee multi-unit groups
(Death & Co, Gather ~$2.1M) genuinely re-up; the small-independent tail is uniformly
capital-stacked (Toast Capital/Libertas/EIDL, negative equity) — Groupon-flavored.

### 8.3 Brazil fit
- **Demand exists.** Selic 14.25%; receivables anticipation costs venues 2.75–2.99%/mo;
  Abrasel: 38–44% of establishments overdue, ~35% operating in the red. Stella Artois'
  "Apoie um Restaurante" proved consumers prepay at 2x face (R$50 → R$100, 4,000+
  venues). No inKind clone operates in Brazil; Zig/Meep normalized closed-loop prepaid.
  Pix payers earn no card rewards — discounted credit is the only "cashback" available
  to them.
- **Regulatory fork.** Single-venue credit with the restaurant as issuer = "âmbito
  limitado" (Lei 12.865/2013 art. 6º §4º; Res. BCB 150/2021) — outside BACEN's
  perimeter. A universal multi-restaurant wallet = e-money requiring **prior** payment-
  institution authorization (Res. 494/2025 killed operate-first).
- **Breakage must be repriced.** ~60-day expiry on *paid* credit + refund-at-discretion
  is void under CDC arts. 39/51 (12 months is the judicially blessed floor; TJ-SP
  festival-cashless precedent; PROCON's fine formula multiplies by profit from the
  infraction). The two-tier version survives: principal never expires and is refundable;
  breakage lives only on clearly-labeled bonus/rewards credit, where 30–90-day expiry is
  shipped Brazilian practice (iFood's own wallet).
- **A credit book IS fundable later.** Lei 14.905/2024 exempted PJ-PJ operations and
  notas comerciais/CCBs from the 12%/yr usury cap; merchant-receivables FIDCs price at
  ~CDI+3.7–5% ≈ 1.5–1.8%/mo blended — half the venue's anticipation cost. Threshold:
  ~R$10M/mo volume, R$100–300k setup. Sequencing: consignment first, FIDC book later.
- **VR/VA crowds out employee lunch** (PAT tax treatment unbeatable), but Decreto
  12.712/2025 (MDR cap 3.6%, 15-day settlement) has restaurants primed to love anyone
  who pays upfront.

### 8.4 What Racha steals (sequenced) and what it must not
1. **House accounts v1 (steal now, capital-light):** per-restaurant prepaid credit —
   Pix load + bonus (e.g., R$200 → R$230–240), redeemed inside Racha's QR checkout.
   Restaurant is the issuer (âmbito limitado); Racha takes SaaS + a cut of the bonus
   spread on consignment (remit on redemption — no credit inventory at Selic ~15%).
   Structural edge over inKind: inKind spends 3–6 months per POS integration to reach
   the redemption moment; **Racha owns the redemption moment natively.**
2. **Pilot-observe-scale underwriting (steal now):** fund/bonus tiny, watch redemption
   through our own rail, then size — the single most stealable mechanic, and our
   checkout data + Seatable's reservation graph substitute for inKind's $600M-funded
   discovery app.
3. **Advances repaid in dining credit (later, gated):** consignment-light, per-venue
   exposure caps, sub-7-month usage periods, day-of-week throttles (RN's converged
   controls), priced against the ~3%/mo anticipation benchmark, sold as demand-gen.
   Only after a payments-counsel opinion on loan recharacterization (the RN
   class-action analog) — same gate as risk #5.
4. **Never:** universal wallet without an IP license; breakage on principal;
   refund-at-discretion terms; 50%-of-face discounts chasing desperate venues
   (adverse selection is the model's documented failure mode).

Adds to §7 next actions: model the house-account spread with real pilot data (what
bonus % clears in Brazil vs the 25–33% US tiers); include the "who is the issuer"
question in the payments-counsel scope; monitor Zig/Meep (fastest plausible movers into
everyday-restaurant house accounts).
