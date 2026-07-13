# Motor de Conteúdo SEO — Seatable

**Objetivo do usuário (2026-07-12):** conseguir clientes organicamente. SEO +
"centenas de posts sobre Seatable e o que fazemos", + disparos da Olímpia +
calibração do modelo. Isto é o **passo 1 de 3**: motor de conteúdo → Olímpia
disparos/calibração → OS agêntico que roda tudo de madrugada.

---

## Tese central (a decisão que muda tudo)

**O comprador é o DONO do restaurante, não quem janta.** Todo o conteúdo tem
que alcançar o dono, não o cliente final.

- ❌ "Melhores restaurantes italianos em SP" → alcança o *diner*, constrói um
  mini-Yelp fora da missão, e é conteúdo fino (só repete o Google).
- ✅ "Sistema de reservas para restaurante italiano em SP" → alcança o *dono*
  procurando solução. O dado do `prospect_leads` vira **contexto de mercado
  local** (quantos restaurantes do tipo existem na cidade, % sem atendimento
  fora do horário, etc.), não uma listagem de concorrentes.

**Guardrail de verdade:** `prospect_leads` são PROSPECTS, não clientes. Nenhuma
página pode afirmar que esses restaurantes "usam a Seatable" (a página atual
`city-cuisine.js` afirma isso — vira mentira com dado de lead). Corrigir.

---

## O que já existe (mapa do Explore, 2026-07-12)

| Peça | Estado | Ref |
|------|--------|-----|
| Renderização | SPA Vite client-only **+** padrão server-rendered p/ SEO | `vercel.json:80-86`, `index.html:41` |
| Padrão que ranqueia | `/api/seo/*` → `seo-html.js renderPage()` → tabela `seo_page_cache` → edge cache `s-maxage=86400` → warm cron | `api/seo/city-cuisine.js`, `api/_lib/seo-html.js` |
| Páginas server-rendered | `/restaurants/:city/:cuisine` (EN, dados de `restaurant_config`=clientes), `/vs/:competitor` (EN, 3 concorrentes) | `api/seo/city-cuisine.js`, `api/seo/vs.js` |
| Páginas client-only (frágeis p/ SEO) | `/para/:slug` React, 23 páginas PT-BR hardcoded | `client/src/data/seoPages.ts`, `SeoLandingPage.tsx` |
| Warm cron | 02h UTC, só warma `/restaurants/*` a partir de pares (city,type) de clientes | `api/cron/warm-seo-cache.js` |
| Sitemap | dinâmico, mas re-lista os 23 slugs `/para/` à mão (drift) | `api/sitemap.js:114-135` |
| **Fosso de dados** | `prospect_leads`: milhares de restaurantes BR (nome, cidade, bairro, uf, rating, reviews, instagram, lat/lng) | `supabase/migrations/20260626_prospecting.sql:23-59` |
| JSON-LD | só client-side no `/para/` (invisível sem JS); server pages têm ZERO | `SeoHead.tsx:17-53` |
| Blog | **não existe** — greenfield | — |
| i18n | pt-BR primário/fallback, sem roteamento por locale | `client/src/i18n/config.ts` |

**Fork arquitetural nº1:** só construir no padrão **server-rendered** (crawler-safe).
Não adicionar mais páginas client-only `/para/`.

---

## Arquitetura do motor

Dois sub-motores, mesma fundação server-rendered:

### Fundação compartilhada (Fase 0 — pré-requisito)
- **`seo-html.js` upgrade**: shell PT-BR (`lang="pt-BR"`, nav/footer/CTA PT),
  suporte a `jsonLd` + helpers de schema (`SoftwareApplication`, `FAQPage`,
  `BreadcrumbList`, `LocalBusiness`/`ItemList`). Backward-compatible.
- **Sitemap de fonte única** (tabela, não arrays hardcoded em 2 lugares).
- Reusar `seo_page_cache` (gera-uma-vez / serve-estático, ~$0.001/página Haiku).

### Motor A — Páginas programáticas buyer-intent (rankeia rápido, escala p/ centenas)
- Fonte: `prospect_leads` (destrava toda cidade×cozinha onde temos LEADS, não
  só onde temos clientes — hoje quase nada).
- Página = pitch da Seatable p/ dono naquela cidade + **contexto de mercado
  local real** (N restaurantes do tipo, agregados) + FAQ + JSON-LD. PT-BR.
- Sem afirmar que os leads são clientes.
- Warm cron ampliado p/ a matriz de keywords.

### Motor B — Blog editorial (autoridade + long-tail; "posts sobre Seatable")
- Greenfield: `/blog/:slug` server-rendered (novo `api/seo/artigo.js`),
  tabela `content_articles` (slug, title, body, meta, jsonld, status, locale).
- Tópicos "papo de dono": reduzir no-show, WhatsApp p/ reservas, reduzir
  cancelamento, comparativos, guias por tipo de cozinha. Cada um ancorado em
  dado/feature real da Seatable → utilidade única (passa Helpful Content).
- **Pipeline de geração (espelha a visão manager→worker→inspector do usuário):**
  1. Qwen/Haiku triagem: que tópicos faltam (gap na matriz de keywords)?
  2. Fable (manager): escreve o brief/outline + ângulo, não o texto.
  3. Sonnet (worker): redige o artigo.
  4. Fable-fresh (inspector): audita contra rubrica (como o revisor do pauta-ai)
     — factual, on-brand "papo de dono", sem fluff, JSON-LD válido.
  5. **Grava como `draft`. Humano aprova → publica.** (NUNCA auto-publicar:
     outward-facing e difícil de reverter no SEO.)

---

## Guardrails (anti-penalidade + compliance)
- **Helpful Content:** cada página com dado/utilidade única. Sem texto girado.
  Nada de publicar 500 páginas idênticas com cidade trocada.
- **Publicação = ação humana.** Gero em `draft`; usuário revisa e dá o push
  (deploy é no push). Não deployo nem publico sozinho.
- **Sitemap incremental:** só entra no sitemap o que está `published`.
- **Custo Vercel:** warm cron já é barato (gera-uma-vez). Ampliar a lista com
  cuidado do budget de 60s/função (paginar/batch). Sem cron novo < 15min.

---

## Faseamento

- [x] **Fase 0 — Fundação** (commit aafc8a67): `seo-schema.js` (builders
      JSON-LD puros + hardening), `renderPage` com `lang`/`jsonLd`
      (EN byte-idêntico), 14 testes.
- [x] **Fase A — Programático buyer-intent** (2026-07-12):
      **Reality check dos dados** (Supabase prod): 4.634 leads TODOS em São
      Paulo, `sector`="restaurante" (sem cozinha), `neighborhood` vazio (mas
      `address` carrega bairro — futuro), ~31 clientes com `restaurant_type`
      = estilo (casual_dining), não culinária. E o handler antigo **404-eava
      sem cliente pré-existente** — por isso o motor estava faminto.
      **Desenho final**: matriz curada `api/_lib/seo-matrix.js` (15 cidades BR
      × 12 tipos = 180 páginas; fonte única p/ handler+sitemap+cron), handler
      novo `api/seo/reservas.js` em `/sistema-de-reservas/:cidade/:cozinha`
      (PT-BR, nunca-404 p/ combo válido, JSON-LD server-side, stats de
      mercado do prospect_leads como head-counts ≥50, prova social só com
      clientes reais ≥3, Haiku com "só use estes números" + fallback
      estático), rewrite no vercel.json, sitemap emite matriz, warm cron
      aquece a matriz (~40/noite, cheio em ~5 noites). 27 testes verdes.
      Legado `/restaurants` intacto (self-cache on visit).
- [x] **Fase B fatia 1 — Blog editorial servindo + 5 artigos** (2026-07-12):
      Conteúdo **no repo** (`api/_content/articles/`, dir underscore = não é
      função) em vez de tabela DB — o diff do PR é a revisão editorial e o
      **merge é o ato humano de publicação** (draft = branch não mergeada;
      nada auto-publica). Handlers `/blog` + `/blog/:slug` server-rendered
      PT-BR com Article/ItemList/Breadcrumb JSON-LD; sitemap; CSS de artigo
      no shell. 5 artigos "papo de dono": no-show (com /calculadora), WhatsApp,
      sistema com IA, comissão vs fixo, e o âncora com dado proprietário
      (4.678 restaurantes SP — números conferidos na base em 2026-07-12).
      Teste de integridade = inspector automatizado (campos, slugs, XSS,
      links internos resolvem, metaDescription ≤170).
- [ ] **Fase B fatia 2 — Pipeline de geração** (manager→worker→inspector):
      Fable escreve brief → Sonnet redige → Fable-fresh audita contra rubrica
      → abre PR draft. BLOQUEADO por credenciais (OpenRouter sem créditos +
      ANTHROPIC_API_KEY revogada — incidente Olímpia 401). Quando o usuário
      repor créditos, o pipeline vira script que gera artigo novo por PR.
- [ ] **Fase C — Medição**: Search Console, o que ranqueia, iterar tópicos.

Depois: passo 2 (Olímpia disparos/calibração) e passo 3 (OS agêntico) do vision.
