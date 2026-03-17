# Seatable Research Feed

## 2026-03-16 — Karpathy Loop #1

### Competitor Intel

- **Resy + Tock merging** under AmEx umbrella this summer. Combined fine-dining inventory is significant. Resy also deepening **Toast POS integration** — servers see guest preferences (wine, birthdays) on handheld devices in real-time. This is the data-at-the-table play.
- **OpenTable** leaning into AI guest segmentation for personalized follow-ups and occupancy optimization.
- **SevenRooms** doubling down on predictive loyalty — AI-driven churn risk and high-spender identification.
- **Voice AI market crowding**: Vox AI ($8.7M seed), Loman AI ($3.5M), Presto ($10M — backed by ElevenLabs CEO), Audivi AI. Also: Newo.ai, Slang, RestoHost, Hostie, Revmo. Market projected $49B by 2029.

### AI/Voice Tech

- **ElevenLabs Conversational AI 2.0**: Natural turn-taking (handles "um"/"ah"), auto language detection mid-call, built-in RAG, Git-style agent branching, MCP integration for mid-conversation actions (CRM lookup, booking, payment).
- **ElevenLabs Multimodal**: Agents now process speech + text simultaneously.
- **Eleven v3 TTS**: Most expressive model yet — worth testing for Seatable voice quality upgrade.

### Brazil Market

- **WhatsApp Flows** now supports in-chat appointment booking and seat selection — directly relevant to Seatable's WhatsApp channel.
- **WhatsApp pricing change** (Jan 2026): Per-delivered-template-message billing replaces flat 24h conversation fees. Local billing coming to Brazil H2 2026.
- **Messaging limits**: Verified businesses jump straight to 100K daily limit (no more gradual 2K->10K->100K).
- Brazil restaurant sector shifting from intuition to data-driven operations; São Paulo remains primary tech hub.

### Production Health

- `https://seatable.one` — **200 OK** (healthy)

### Opportunity Scan

1. **WhatsApp Flows for In-Chat Booking** (Effort: M) — WhatsApp now supports structured flows where customers can select date/time/party-size without leaving the chat. This eliminates the friction of redirecting to a web link. Seatable already has the WhatsApp channel live — adding Flows would be a natural upgrade that matches how Brazilian users expect to interact.

2. **Upgrade to ElevenLabs v3 + Turn-Taking** (Effort: S) — Eleven v3 TTS is more expressive, and ConvAI 2.0's turn-taking model handles natural speech patterns ("um", pauses) much better. Quick config change on the agent could noticeably improve voice call quality and reduce awkward interruptions during reservations.

---

## 2026-03-16 — Karpathy Loop #2 (14:00 UTC)

### Competitor Intel

- **Resy + Tock merger confirmed for summer 2026** — doubles Resy inventory to 25K+ venues. Toast-Resy integration now live: guest preferences (wine, allergies, birthdays) displayed on Toast handhelds at the table. This is the "data-at-the-table" play — Seatable's Manager AI briefings already do this via WhatsApp, but a handheld/tablet view could be a differentiator.
- **Voice AI market heating up fast**: Loman AI (24/7 phone answering), RestoHost AI, Hostie AI all shipping. Burger King piloting "Patty" voice assistant in 500 locations. FSR Magazine calls voice AI "mission-critical for independents in 2026." Market projected $49B by 2029. Validates Seatable's direction but competition is real.
- **OpenTable** pushing AI guest segmentation + automated off-peak promotions. SevenRooms doing predictive churn/high-LTV identification — Seatable already has both (customer_ltv + retention campaigns).

### AI/Voice Tech

- **Anthropic**: Claude Sonnet 4.6 launched — 1M token context now GA (was beta). Web search + code execution tools now GA (no beta header). Structured outputs GA. **Action**: Can drop any beta headers in API calls.
- **ElevenLabs**: Multimodal ConvAI — agents process speech + text simultaneously. Git-style agent branching for A/B testing agent configs. **Action**: Agent branching could let us test different voice personas per restaurant without risk.
- **Haiku 3 deprecated** — retirement April 19. Migrate any Haiku 3 usage to Haiku 4.5.

### Brazil Market

- **Get In** and **Tagme** are the dominant Brazilian reservation platforms (digital waitlist, CRM, NPS). São Paulo remains primary tech hub with 60% of LatAm VC. No major WhatsApp API changes since Loop #1.

### Production Health

- `https://seatable.one` — **200 OK**

### Opportunity Scan

1. **ElevenLabs Agent Branching for A/B Voice Testing** (Effort: S) — Use the new Git-style branching to create variant agents per restaurant (e.g., formal vs. casual greeting, different languages). Zero-risk testing of voice personality changes. Directly leverages a new platform feature we're already paying for.

2. **Tablet "Host View" for Table-Side Guest Context** (Effort: L) — Toast+Resy's big play is showing guest preferences on server handhelds. Seatable already has the data (customer_history, visit_count, preferences, VIP status). A dedicated tablet-optimized view that hosts can glance at during service would match this capability without requiring POS integration. Big effort but high differentiation for premium restaurants.

---

## 2026-03-17 — Karpathy Loop #3 (00:30 UTC)

### Competitor Intel

- **DoorDash acquired SevenRooms for $1.2B** — signals that delivery giants now want dine-in intelligence. SevenRooms' AI guest tags (VIP, high-spender, brunch-lover, churn risk) are now backed by DoorDash's consumer data. This is a competitive escalation: delivery + dine-in + loyalty in one platform. Seatable's customer intelligence already matches SevenRooms feature-for-feature — the threat is distribution, not capability.
- **Resy + Tock merger** proceeding for summer 2026 under AmEx. Combined ~25K venues. Toast-Resy POS integration now live — servers see wine preferences, birthdays, allergies on handhelds. AmEx dining data powering "richer, more personalized hospitality."
- **Toast** positioning as "AI operations command center" for enterprise brands (CAVA, Wingstop, Sweetgreen, Shake Shack). Enterprise focus = opportunity for Seatable in independent/mid-market restaurants.
- **Voice AI startups flooding in**: Vox AI ($8.7M seed, Amsterdam→SF, 90+ languages, drive-thru focus), Loman AI ($3.5M seed, Austin, phone automation), Audivi AI (seed, undisclosed). Established players: Presto, ConverseNow, SoundHound, Hi Auto. Newer: Incept AI (audio quality), Palona AI (brand-customizable agents), Revmo.ai. Market $10B→$49B by 2029.
- **Chain adoption accelerating**: Taco Bell, Wendy's, Bojangles, White Castle, Taco John's all expanding voice AI deployments.
- **Revenue impact data**: Forbes 2026 reports restaurants seeing +$3K-$18K/month per location from AI. Newo.ai claims 2-6 additional reservations/day per location.

### AI/Voice Tech

- **ElevenLabs Eleven v3** — most expressive TTS model yet. Supports audio tags (`[whispers]`, `[sighs]`) in Text-to-Speech endpoint. New **Text to Dialogue** endpoint: structured JSON speaker turns → cohesive audio with overlapping speech, emotional transitions, interruptions. Could enable richer Manager AI voice briefings.
- **ElevenLabs ConvAI 2.0** (March 2026) — "sophisticated, capable, and trustworthy voice agents." Agent versioning now includes `version_id`, `branch_id`, `main_branch_id` on responses. Conversations track which agent version was used. **Action**: Our Voice A/B Testing feature (Phase 12) aligns perfectly with this — we built agent branching just as ElevenLabs shipped native version tracking.
- **ElevenLabs API updates** (Feb 2026): `loudness` parameter for volume control, `guidance_scale` for prompt adherence, voice bookmarking (`is_bookmarked`). Non-Latin voice captcha fix (Hebrew, Thai, etc.).
- **Agent guardrails strengthened** — stronger safety + better search over conversations and uploaded files. Relevant for our per-restaurant KB docs.

### Brazil Market

- **ANR (Associação Nacional de Restaurantes)** confirms AI is "tangible reality" in Brazilian food service — optimizing processes, improving CX, redefining management.
- **Data-driven shift**: Industry events converge on data orientation for 2026. Software crossing weather forecasts + event schedules + sales history + order channels + customer behavior to predict demand in advance. Restaurants adjusting purchases, inventory, staffing, and marketing in real time.
- **Adoption stats**: 38% of Brazilian establishments use some automation, 21% combine bots with human service, 17% use AI in management/service/operations. Growth trajectory is steep.
- **Deloitte (2025)**: 78% of restaurants in Spain plan to implement AI before 2027 — similar trajectory expected in LatAm.

### Production Health

- `https://seatable.one` — **200 OK** ✅ (verified in prior cycle)

### Opportunity Scan

1. **Eleven v3 for Manager AI Voice Briefings** (Effort: S) — The new `[whispers]`/`[sighs]` tags and Text to Dialogue endpoint could make morning/end-of-day briefings feel dramatically more natural. Instead of robotic TTS, the manager hears a conversational briefing with emotional inflection. Quick win: swap TTS model in briefing-sender.js.

2. **Counter DoorDash+SevenRooms with "Independent Restaurant Intelligence"** (Effort: M) — DoorDash acquiring SevenRooms means enterprise chains get delivery+dine-in+loyalty bundled. Seatable's positioning for independent restaurants becomes sharper: "All the intelligence of SevenRooms, none of the DoorDash fees." Marketing narrative, not code change. Update landing page copy and positioning.

3. **Track Agent Version Performance** (Effort: S) — ElevenLabs now returns `version_id` on every conversation. We can log this alongside our existing voice_experiments data to measure which agent version converts best. Wire the version_id into our analytics without building custom tracking.
