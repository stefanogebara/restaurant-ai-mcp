# Estado do repositório — Seatable

> Reescrito pelo `/intel` de 2026-10-12. Janela: desde o commit de intel anterior
> nesta branch (`3b443a58`, "intel: 24 itens (2026-10-05)", conteúdo do PR #163
> ainda não mergeado) até hoje (`d3b79919`), via merge de `main`. Reescrito a
> cada `/intel`. Fonte: o git e o GitHub, não o config.

## O parágrafo

**O achado operacional é, pela quarta vez, o mesmo — só que agora com um dado novo: a
semana de código andou bem, a semana de intel continua travada.** O PR #163 foi marcado
"pronto pra revisão" em 05/10 (depois de passar 7 dias em draft) justamente para quebrar
o padrão dos PRs #153/#155, que morreram do mesmo jeito. **Não quebrou.** Ficou aberto
mais 7 dias sem nenhum commit, review ou comentário humano — chegando a esta rodada com
**14 dias** desde a primeira promessa de "pronto pra revisão". Esta rodada não abre PR
novo (abrir um quinto PR paralelo seria repetir o erro que o próprio #163 já diagnosticou
duas vezes): continua na mesma branch `intel/2026-09-28`, mescla os 11 PRs que `main`
ganhou desde então, processa os 44 candidatos novos encontrados pelos 5 scouts e devolve
o PR atualizado. Fora do `/intel`, a semana foi produtiva: 11 PRs mergeados em 48h
(11-12/10), um sprint coordenado de UI/confiabilidade — configurações separadas por
domínio (voz/WhatsApp/integrações), CRM mobile legível, Insights/retenção honestos com
a fonte de dado real, campanha de marketing com histórico fiel ao estado de entrega, e
correções de fronteira de tenant em WhatsApp e telefone. No meio desse sprint, um achado
lateral que vale registrar: a PR #177 (mergeada) e a PR #169 (ainda draft, bloqueada de
propósito) tocam o **mesmo arquivo** (`api/phone-integration-simple.js`) resolvendo o
mesmo tipo de problema — número de telefone compartilhado entre restaurantes — por
caminhos diferentes; a #169 ainda carrega um aviso explícito de produção ("3 linhas de
telefone ativas, só 2 números distintos — um número atende 2 restaurantes") que não foi
resolvido, e agora precisa reconciliar com o que a #177 já mudou no mesmo arquivo antes de
poder avançar. No mercado, a Toast — já parceira da Resy — confirmou que está testando o
próprio atendente de telefone por IA (early access, sem mecanismo publicado), e a
ElevenLabs trocou o default de TTS do agente sem que isso nos afete, porque o snapshot de
payload (fechado em 01/09) já trava exatamente esse campo — o que também expôs que uma
linha do `known_gaps` do config estava desatualizada (dizia que o snapshot não existia);
corrigida nesta rodada.

## O que shipou

- **Sprint de confiabilidade de UI, 11 PRs em 48h (#173→#183, 11-12/10)** — sem relação
  com `/intel`, mergeados por sessões `codex/*` paralelas: separação de Configurações em
  abas de Voz/WhatsApp/Integrações com fechamento do roteamento de telefone compartilhado
  entre tenants (#177); workspace de Instagram refeito (#179); CRM mobile legível com
  histórico/valores corrigidos (#182); Insights e retenção com risco/valor corretos,
  e-mail localizado e fronteira de cliente validada (#181); histórico de campanha
  refletindo entrega real em vez de estado otimista, com leitura/envio escopados por
  tenant (#180); e quatro correções de idioma/diagnóstico no teste de WhatsApp da demo
  (#173-#176). Nenhum desses PRs tem relação com o pipeline de intel — são o trabalho
  "normal" da semana, registrado aqui porque é o que `main` ganhou enquanto o #163 ficava
  parado.
- **Correção mecânica no `known_gaps` do `intel.config.json`** — a linha sobre "não há
  snapshot do payload de criação do agente ElevenLabs" estava desatualizada desde
  01/09/2026, quando o spike `elevenlabs-payload-snapshot` fechou essa lacuna
  (`api/__tests__/elevenlabs-agent-create-payload.test.js`, confirmado existente via git).
  Corrigida nesta rodada — fato verificável, não julgamento.
- **Correção mecânica em `docs/intel/seen.jsonl`** — a nota de dedup do artigo "iFood
  lança reserva de mesa via Tagme+Get In" (10/06/2026) apontava para o item errado
  (`RESOLVIDO 2026-09-01`, que é sobre Resy/Toast/Square, não sobre Get In/Tagme).
  Corrigida para apontar ao item correto (`DISCUTIR 11/15` "Português + WhatsApp"), que
  por sua vez ganhou uma Atualização registrando que a integração Tagme+Get In do iFood
  já operava 3 meses antes do investimento formal de setembro.

## O que está em voo

- **PR #163→continuado (este PR)** — marcado "pronto pra revisão" há 14 dias, zero
  review humano. Nesta rodada ganha 44 candidatos de intel processados e os 11 PRs de
  `main` mesclados; continua precisando de alguém abrir e olhar.
- **PR #169** (draft, aberto 05/10, agora 7 dias, bloqueio de propósito — "não mergear"):
  carrega um número de telefone duplicado entre 2 restaurantes ainda não resolvido em
  produção, e agora também precisa reconciliar com `api/phone-integration-simple.js` do
  jeito que a #177 (mergeada) deixou o arquivo. Ninguém tocou desde a criação.
- **PR #165** (draft, aberto 30/09, agora 12 dias, `mergeable_state: dirty`): WIP legítimo
  de redesenho de Insights — critério explícito de não mergear (nota 9/10 ainda não
  atingida: a rodada mais recente de crítica por screenshot deu 6.5/10 desktop, 6.8/10
  mobile, 5.5/10 database-only, abaixo até da leitura de 05/10). Continua sendo o único
  draft "saudável" da lista — sabe que está incompleto e diz o quê falta.
- **PR #140** (draft, aberto 06/09, agora **36 dias**, `mergeable_state: dirty`): a
  landing fotográfica provavelmente redundante desde que `main` ganhou a landing hero em
  produção (commits de 25/09, PR #157 fechado sem merge mas com o conteúdo entrando por
  outro caminho). Segue sem decisão do Stefano sobre se é intencional ou esquecido.
- **PR #90** (aberto 26/08, agora **47 dias**, `mergeable_state: clean`, zero
  commit/comentário desde a criação): o item mais velho parado sem explicação continua
  parado. Pequeno (42+/8-), isolado, remove dois specs do Racha que zeravam a coleta e2e.
- **4 PRs de dependabot abertos** (#154 desde 21/09 — **21 dias**; #166-#168 desde 05/10 —
  7 dias): nenhum revisado em nenhuma das últimas passadas.
- **7 issues `[design-drift]`** — seguem abertas e paradas desde 25/05, agora **~140 dias**.
- **Eval do Manager AI** (PR #99) — continua bloqueado por `OPENROUTER_API_KEY` ausente
  neste ambiente.
- **BACKLOG.md em aberto, sem spike rodado:** `elevenlabs-queueing` (21/09),
  `ia-liga-pro-restaurante` (28/09), `elevenlabs-parallel-tool-calls` (28/09),
  `twilio-bulk-lembretes` (31/08), `ucp-catalogo-legivel`, `identidade-reserva-externa`,
  `tool-evento-privado` (24/08). Novo nesta rodada: `elevenlabs-on-openrouter` (12/10).

## O que morreu

Nada removido de propósito nesta janela.

## Áreas quentes

`docs/intel/*` — quarta semana seguida como área quente de **processo**, mas com um dado
novo: o problema não é falta de trabalho (11 PRs reais entraram em `main` nesta janela),
é especificamente este PR de intel não ser revisado. `api/phone-integration-simple.js` —
tocado por um PR mergeado (#177) e um draft bloqueado (#169) resolvendo a mesma classe de
bug (telefone compartilhado entre tenants) por caminhos diferentes; precisa de
reconciliação antes do #169 avançar. `api/_lib/channels/meta-adapter.js` — segue
descartando webhook de status sem ler `pricing_category`, relevante enquanto a cobrança
de WhatsApp de 01/10 continuar sem confirmação oficial da Meta (DISCUTIR 10/15 no
`INTEL.md` — nesta rodada o changelog oficial da Meta não teve entrada nova desde maio,
então o item não ganhou Atualização; segue como estava em 05/10).

## Divergências com o config

Nenhuma linha de `bets` ou `settled` tocada por julgamento nesta janela. Uma correção
mecânica aplicada ao `known_gaps` (ver "O que shipou" — snapshot de payload ElevenLabs já
existe desde 01/09, a linha antiga dizia o contrário) e uma correção de bookkeeping em
`seen.jsonl` (nota de dedup do item iFood/Tagme apontava para o item errado) — ambas são
fatos verificáveis no git, não decisões de produto, e por isso aplicadas direto em vez de
registradas como pendência.
