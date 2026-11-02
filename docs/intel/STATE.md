# Estado do repositório — Seatable

> Reescrito pelo `/intel` de 2026-11-02. Janela: desde `f6ab5db` (HEAD de
> `main` em 21/10, já coberto pela rodada anterior) até agora — **zero
> commits novos em `main`, mergeados ou diretos, em sete dias**. `git log
> --since=2026-10-26` em `main` devolve vazio; `f6ab5db` é ao mesmo tempo o
> HEAD atual e o `base` do PR #214. Fora de `main`: 10 PRs abertos (7 de
> dependabot — 3 abertos hoje de manhã — e 3 não-dependabot, nenhum tocado por
> humano desde a rodada anterior). Reescrito a cada `/intel`. Fonte: o git e
> o GitHub, não o config.

## O parágrafo

Semana sem commit nenhum em `main` — a primeira desta série em que o
`/intel` não tem nenhum código novo para resumir, só o próprio backlog de PRs
envelhecendo mais sete dias. O PR #214 (a rodada de 26/10, que já tinha
herdado e resolvido o represamento de três rodadas de intel anteriores —
`#153`/`#155` fechados sem merge, `#163` fechado sem merge) está com
`mergeable_state: clean` e zero comentário humano desde então: os três
comentários que recebeu são todos de bot (Vercel preview, CodeRabbit "sem
revisão automática — repositório com menos de 10 estrelas") mais a própria
nota de correção do agente que o abriu, avisando que a branch-base
(`intel/2026-09-28`) tinha revertido ~1.100 linhas de correções de segurança
reais de WhatsApp e precisou de um merge de `main` para parar de fazer isso.
Esta rodada parte exatamente de onde o #214 parou — a branch
`intel/2026-10-26` — em vez de reabrir o mesmo represamento pela quarta vez.
Fora do intel, o quadro é o mesmo congelamento: `#169` (trava de
autosserviço de número compartilhado) continua se autodeclarando "não
mesclar" até alguém confirmar manualmente qual de dois restaurantes é o dono
legítimo de um número ativo duplicado; `#165` (reforma de 189 arquivos de
Insights/Analytics/CRM) segue com `mergeable_state: dirty` e os mesmos três
bloqueios que o próprio PR lista (nota visual abaixo da barra, OAuth de
Preview redirecionando para produção, merge de CRM inseguro para dado real);
`#140` (herói fotográfico em React) soma 57 dias coexistindo com a versão
que já foi ao ar por outra rota (`d38c5b5`, artefato estático) sem que
alguém decida fechá-lo; e `#90` (conserto do e2e) passa de dois meses aberto
sem nenhum bloqueio declarado — parece simplesmente esquecido. A fila de
dependabot, que na rodada passada tinha 4 PRs, agora tem **7** — três novos
nesta própria manhã (`#215`–`#217`), somados a `#168`/`#198`/`#199`/`#206`
já represados desde outubro — nenhum bump de dependência de rotina entrou em
`main` desde pelo menos 05/10.

## O que shipou

Nada. Nenhum commit, merge ou direto, entrou em `main` nesta janela.

## O que está em voo

- **PR #214** (`intel/2026-10-26`, draft, aberto há 7 dias, `mergeable_state:
  clean`) — a rodada de intel anterior, que já herdou e resolveu o
  represamento de `#153`/`#155`/`#163`. Zero review humano; esta rodada
  (`intel/2026-11-02`) estende essa mesma branch em vez de abrir uma quarta
  linha paralela — ver "Divergências".
- **PR #169** (`codex/phone-tenant-safety`, draft, 28 dias) — sem mudança:
  continua autodeclarado "não mesclar" até confirmação manual de qual dos
  dois restaurantes é o dono legítimo do número compartilhado duplicado.
- **PR #165** (`codex/platform-insights-redesign`, draft, 33 dias,
  `mergeable_state: dirty`) — sem mudança nos três bloqueios que o próprio
  PR declara (nota visual, OAuth de Preview, merge de CRM inseguro).
- **PR #140** (`feat/landing-fotografica-e-teste-whatsapp`, draft, 57 dias) —
  sem mudança; continua coexistindo com a versão já publicada por artefato
  estático. Fechar sem merge é chamada do Stefano, não mecânica.
- **PR #90** (`claude/e2e-racha-quebra-listagem`, não-draft, 68 dias) — sem
  mudança; nenhum bloqueio declarado, parece esquecido.
- **7 PRs de dependabot abertos** (`#168`, `#198`, `#199`, `#206`, e os três
  novos `#215`–`#217` de hoje) — nenhum bump de rotina mesclado desde pelo
  menos 05/10. Risco acumulado: patch de segurança de dependência (`npm
  audit`) parado por quatro semanas.
- **Eval do Manager AI** e **G5 — onboarding em conversa** seguem como nas
  rodadas anteriores: nenhum commit tocou `onboarding-agent.js`/
  `agent-loop.js`, arnês de 20 casos não rodou.

## O que morreu

Nada — não houve commit nesta janela para matar ou manter nada.

## Áreas quentes

Nenhuma mudou de temperatura por falta de commit. Seguem quentes por
heranças de rodadas anteriores: `api/_lib/prospecting/confirmacao-indicacao.js`
(detector de confirmação — lista fechada), `api/racha-notify.js`, `supabase/
migrations/20261016184431_whatsapp_booking_integrity.sql` (a própria
migration lista o que não cobre), `api/whatsapp-settings.js` + registro
central de roteamento. Nova, desta rodada: a fila de PRs em si —
`#214`/`#169`/`#165`/`#140`/`#90` e os 7 de dependabot — é agora a maior
área quente do repositório, não por código instável, mas por decisão
represada.

## Divergências com o config

1. **Nenhuma.** O `intel.config.json` da branch `intel/2026-10-26` já
   aplicou as duas correções mecânicas verificáveis (caminho de
   `api/_crons/send-reminders.js` e o `known_gap` do snapshot do payload da
   ElevenLabs, ambos confirmados contra o repositório atual: os dois
   arquivos existem). Esta rodada não encontrou nenhum commit novo em `main`
   para gerar divergência nova.
2. **Processo, não conteúdo — registrado para não se repetir:** o PR #214
   demonstrou que herdar a branch anterior em vez de redigitar o trabalho
   (que é exatamente o que o próprio #214 fez com `#163`) é o padrão certo
   quando `main` não avançou. Esta rodada (`intel/2026-11-02`) faz o mesmo:
   parte de `intel/2026-10-26`, não de `main`. **Recomendação:** fechar
   `#214` sem merge quando esta PR for revisada — ela herda e estende tudo
   que `#214` tinha.
