# Estado do repositório — Seatable

> Escrito pela primeira passada do `/intel` em 2026-08-24. Janela: 30 dias
> (2026-07-25 → 2026-08-19, 168 commits). HEAD `c79ad6f0`, branch `main`.
> Reescrito a cada `/intel`. Fonte: o git, não o config.

## O parágrafo

Agosto foi o mês da Olímpia. Cerca de 60% dos commits do período são
prospecção, e o arco é claro: a máquina passou a mandar intro fria, follow-up
e proposta personalizada sozinha, e no meio do caminho três claims falsos
escaparam — um custou um lead — o que fez nascer o `claim-linter` como portão
de saída obrigatório de tudo que sai sem humano. Em paralelo, os crons
deixaram de rodar às cegas (watchdog cobrindo os 18), a herança do Airtable
foi enterrada de vez com o `DROP` de `restaurant_info`, e o custo de LLM foi
posto sob rédea (OpenRouter como provedor único, cérebro da Olímpia de Sonnet-4
para Haiku-4.5). Voz não apareceu uma vez na lista de arquivos quentes.

## O que shipou

- **Olímpia autônoma de ponta a ponta** — intro fria por cron (`a1db728e`),
  fila por qualidade com teto em banco (`5d6aacd0`, `0c6e9dc9`), follow-up por
  silêncio (`ab790849`), WhatsApp autônomo do fundador (`4aca154d`), proposta
  personalizada por prospect (`1b4912dd`), arquivamento aos 30 dias (`3027e2be`).
- **`claim-linter` como portão de saída** (`1702b779`) depois de três claims
  falsos em 07–08/08.
- **Watchdog nos crons** — 4, depois +5, depois os 9 restantes com divergência
  virando erro (`f4d63840`, `40f2717b`, `6489bc4b`, `5c843b38`, `7c441d30`).
- **`restaurant_info` aposentada** — quatro commits em 02/08 até o `DROP`
  (`caa0e4e1`).
- **ETL do CNPJ da Receita** — 26M linhas → ~615k por CNAE (`7a98321a`),
  stream com yauzl (`026671a8`), checkpoint por arquivo (`97ab4f1e`).
- **Demo deixou de ser teatro** — a "IA" respondia enlatado e toda chamada real
  morria em 400 (`3ce714b3` → `c2e8924c`, `34f03277`, `62ba3786`).
- **Custo de LLM sob controle** — OpenRouter único (`94f56856`), telemetria por
  chamador (`19db30f0`), Haiku-4.5 na Olímpia (`ddda37a1`).
- **Três vazamentos multi-tenant fechados** — agente enxergava e cancelava
  reserva de outro restaurante (`ac17be4d`), nota ia pra casa errada
  (`bb4a57c3`), contador somava o prédio inteiro (`bb7f132e`).
- **Redesign Liquid Glass v2** (18–19/08, PRs #21/#24/#25).

## O que está em voo

- Nenhum PR aberto — #17 a #25 já mergearam.
- `origin/claude/seatable-restaurant-ai-mcp-yjk8r2` (19/08) está **à frente do
  `main`**; é a única branch com trabalho não mergeado.
- Backend de voz **PersonaPlex declarado e não implementado** —
  `api/_voice-server/ws-server.js` lança `PersonaPlex backend not yet available`.
- `fly.toml` aponta para `api/voice-server/Dockerfile`, caminho inexistente
  (o real é `api/_voice-server/`).

## O que morreu

- `restaurant_info` e, com ela, a última herança estrutural do Airtable (02/08).
- Anthropic como provedor primário de LLM (30/07).
- Disparo de prospecção por **telefone fixo** — 76% do pool não tem WhatsApp
  (`128ea1c7`); substituído por ler o celular no site da casa (`9fc7bfe4`) e no
  menu do robô (`5c80a47d`).
- Duas cópias redundantes do dry-run (`69100d51`).
- Branches frias: `stress-test` parada desde fev/2026;
  `feat/prospecting-agent` desde jun.

## Áreas quentes

`tasks/lessons.md` (19) · `api/cron/prospect-founder-email.js` (13) ·
`api/_lib/prospecting/prospect-store.js` (12) · `api/_lib/integration-probes.js`
(10) · `api/prospect-admin.js` (9) · `vercel.json` (7) ·
`scripts/load-rf-cnpj.mjs` (7) · `api/_lib/prospecting/{prospect-responder,
prospect-agent,founder-email}.js` (7 cada).

`tasks/lessons.md` no topo é o diário de post-mortems — o ciclo
aprender→corrigir está ativo.

## Divergências com o config

Nenhuma destas foi aplicada sozinha. `bets` e `settled` só o Stefano mexe —
quando ele reabre um item, a correção fica registrada no próprio item.

1. **`settled[1]` — "voz é LiveKit + ElevenLabs" — é contradito pelo código.**
   Não existe LiveKit na arquitetura. Zero dependência declarada nos três
   `package.json`, zero env `LIVEKIT_*` no `.env.example`, zero import próprio.
   A única presença é `livekit-client` como dependência **transitiva** de
   `@elevenlabs/client@0.15.1` — encanamento interno da ElevenLabs, que ninguém
   aqui escolheu. A voz real é **Twilio → `api/_voice-server/ws-server.js` no
   Fly.io → ElevenLabs *ou* OpenAI Realtime**, selecionado por restaurante em
   `api/voice-engine-settings.js` (`VALID_ENGINES = ['elevenlabs',
   'openai_realtime']`). A pesquisa do próprio repo já sabia disso e marcava
   como pergunta **em aberto**
   (`.claude/plans/2026-07-31-olimpia-foco-total/pesquisa-elevenlabs/README.md`).
   **RESOLVIDO em 2026-08-25** — o Stefano reabriu e mandou corrigir. O
   `settled[1]` foi reescrito para o caminho real, nomeando os arquivos onde a
   escolha de motor vive (`api/voice-engine-settings.js`,
   `api/_voice-server/ws-server.js`), e guarda a linha antiga junto do motivo
   para que a correção não se perca. O `verdict_note` mantém a regra de
   descartar item de mercado sobre LiveKit, agora sem a contradição —
   com uma exceção nova e estreita: **a menos que quebre o próprio
   `@elevenlabs/client`**, já que é por ele que o `livekit-client` entra.
   Reconferido no lockfile antes da edição: `@elevenlabs/client` →
   `livekit-client` → `@livekit/{mutex,protocol}`, zero dependência direta,
   zero import, zero env `LIVEKIT_*`.

2. **`settled[0]` — "Airtable + n8n abandonada" — sustentado, com uma arma
   carregada.** n8n está limpo. Airtable não existe em produção, mas
   `update-vercel-env.sh` na raiz é executável, escreve `*_TABLE_ID` de Airtable
   no ambiente **production** da Vercel e roda `vercel --prod` — inclusive
   referenciando `restaurant_info`, dropada em 02/08. Rodar esse arquivo hoje
   reintroduz a configuração que o `settled` proíbe. Virou `known_gaps`.

3. **`stack` estava significativamente errado.** Faltavam Twilio (a telefonia
   inteira), OpenAI Realtime, Fly.io e OpenRouter; sobrava LiveKit. "MCP tools"
   é fóssil: não há servidor MCP vivo, `dist/` não existe, e os dois
   `test-*mcp*.js` da raiz estão órfãos desde out/2025. O nome do repositório é
   fóssil junto. *Corrigido no config, com evidência.*

4. **`known_gaps[1]` estava desatualizado.** O loop de dado do cliente **existe
   e roda**: `api/_lib/pos/service-completion-core.js` escreve
   `service_records` → `revenue_records` → upsert em `customer_ltv`, e
   `api/guest-profile.js` lê os três de volta por telefone, realimentando a
   ligação via `api/_services/guestMemory.js`. O que falta é só a perna do
   Racha. *Reformulado.*

5. **`known_gaps[3]` estava impreciso.** Existe camada de POS — só que
   americana: o `CHECK` de `pos_provider` aceita `square|toast|clover`, nenhum
   opera em SP. Consumer, Saipos e Goomer têm zero ocorrências em código.
   *Reformulado.*

6. **`sub_products` — o Racha não vive neste repositório.** Aqui existem só as
   duas pontas: `api/racha-proposta.js` e `api/racha-notify.js`. *Corrigido.*
   Consequência para a rubrica: item de intel sobre split de conta **não tem
   âncora de implementação aqui** e não pode passar de DISCUTIR neste repo.
