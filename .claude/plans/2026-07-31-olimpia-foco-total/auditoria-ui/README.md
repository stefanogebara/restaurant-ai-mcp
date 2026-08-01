# Auditoria do cockpit da Olímpia (01/08/2026)

Tela real: `client/src/pages/OlimpiaOps.tsx` (rota `/olimpia`; `ProspectingCockpit.tsx`
é só um redirect) + 7 componentes em `client/src/components/prospecting/`, todos
servidos por `api/prospect-admin.js` (~30 ações via `?action=`).

## O fio que costura os achados graves

Todo painel lê `q.data?.x ?? fallback` e **nenhum** checa `isError`. Num backend
que achata toda falha em `'Internal error'` (`prospect-admin.js:609`), isso vira
uma tela que **afirma saúde quando na verdade está cega**. Não é um bug por
painel; é o mesmo bug seis vezes, e viola a regra da casa de que erro nunca é
silencioso.

| onde | o que a tela diz quando o fetch falha | verdade |
|---|---|---|
| `OlimpiaOps.tsx:118` | bolinha verde "Agente ativo" | desconhecido |
| `LeadList.tsx:147` | "Fila limpa 🎉" | desconhecido |
| `ThreadView.tsx:147` | "Carregando conversa…" pra sempre | erro |
| `VariantsPanel.tsx:80` | "Nenhuma abordagem registrada — usa o padrão" | desconhecido |
| `InsightsPanel.tsx:66`, `GymPanel.tsx:147` | painel em branco | erro |
| `DiscoveryPanel.tsx:322` | botão oferece disparar 250 | saldo desconhecido |

Único painel que acerta: `WaIdentityPanel.tsx:138`.

## Prioridade 1 — o cockpit não mostra o que faz a agente emudecer

Três coisas silenciaram a Olímpia nas últimas duas semanas. **Nenhuma das três
aparece na tela.**

1. **Saldo do OpenRouter.** Em 31/07 a conta chegou a US$-0,03 e a agente parou
   de responder. A sonda que detecta isso já existe
   (`api/_lib/integration-probes.js:225`, falha em saldo ≤ 0, atenção < 5) e é
   servida por `/api/admin-health` — que **nenhum arquivo do client consome**.
   Grep por `openrouter|saldo|credits` em `client/src`: zero.
2. **Cron parado.** O motor que responde é `prospect-flush`, mas o console só lê
   os kill switches `prospecting-agent` e `prospecting-dispatch`
   (`prospect-admin.js:108-110`). Desligar `prospect-flush` no Supabase deixa a
   agente muda com o painel verde. Não há coluna `last_run_at` em `cron_config`,
   então também não há "última execução há X min".
3. **Lead esperando resposta.** `due_followups` conta a escada fria (leads que
   nunca falaram). Não existe em lugar nenhum um contador de *inbound sem
   outbound* — exatamente o sintoma do incidente do Coco Bambu, que ficou 15h
   sem resposta com a tela toda verde.

**Ação:** uma faixa de saúde no topo com saldo do LLM, idade da última execução
de cada cron de prospecção, e "N leads esperando resposta há mais de Xh". Os
dados 1 e 3 já existem no backend; o 2 precisa de `last_run_at` em `cron_config`.

## Prioridade 2 — dois estados de funil que mentem no número

- **`recusou` não tem bucket** (`prospect-admin-view.js:16-40`). Cai no fallback
  e vira `replied`, que o front pinta de verde "Respondeu" (`types.ts:104`) e
  mantém na fila de Triagem para sempre (`types.ts:111`). Lead que disse "não é
  o caso" entra no funil como positivo e entulha a fila.
- **`porteiro` não tem rótulo nem cor** (`types.ts:96-108`), apesar de o backend
  criá-lo de propósito para revelar denominador contaminado. Renderiza o token
  cru em cinza.

## Prioridade 3 — o A/B pode levar a decisão errada

`VariantsPanel.tsx:53` coroa "Melhor abordagem até agora" por maior taxa bruta,
**sem n mínimo**: `sent=1, replied=1` ganha de `sent=500, replied=40`. E o RPC
`prospect_variant_funnel` não filtra por data, então uma troca de template desta
semana fica diluída em meses de histórico. Além disso a coluna diz "Enviadas"
mas conta *leads com variante atribuída*, não mensagens.

Isto ficou concreto hoje: as variantes E e F mostram `sent=5` e `delivered=0` —
o lote inteiro caiu em telefone fixo. Sem coluna de falha visível, a tela sugere
"aguardando resposta" onde a verdade é "nada foi entregue".

**Ação:** exigir n mínimo (~30) antes de coroar, mostrar coluna de falhas ao lado
de entregues, e filtrar o funil por janela (30/60/90 dias, como o InsightsPanel
já faz).

## Prioridade 4 — fluxo sem saída no toque 4

`WaIdentityPanel.tsx:269` deixa registrar o modelo de resgate (toque 4) e
instrui "ligue no painel de Abordagens". Mas `VariantsPanel.tsx:66` itera
`[1,2,3]` — o toque 4 nunca é renderizado, e o modelo nasce `active:false`
(`prospect-admin.js:191`). Ou seja: registrável, nunca ativável. Correção de uma
linha.

## Resto (menor, agrupado)

- **A11y**: `aria-expanded` em abas que não são disclosure (`OlimpiaOps.tsx:217`);
  abas Triagem/Todos sem ARIA nenhuma; popovers de snooze e respostas prontas
  (`ThreadView.tsx:196, 321`) sem `role`, sem Esc, sem clique-fora, sem foco —
  e sem usar `GlassModal`, que existe para isso; botões só-ícone (`✕`, `⧉`, `⏰`)
  sem nome acessível.
- **Contraste**: `text-stone-400` sobre branco dá ~2.6:1 contra os 4.5:1 que o
  DESIGN.md exige, em **23 lugares** — quase todos rótulos de 10-11px que dão
  significado aos números.
- **Responsivo**: barra de ações do thread com até 7 botões `shrink-0` sem
  `flex-wrap` (`ThreadView.tsx:187`) transborda na coluna estreita.
- **Design system**: `GlassModal` e `GlassPill` não são usados nenhuma vez na
  pasta; cartões internos são recriados à mão (`rounded-xl border bg-white/60`)
  em 6 lugares.
- **Sessão**: `/olimpia` não está em `isProtectedPage` (`api.ts:45`), então um
  401 não redireciona pro login — cai no estado silencioso acima. É também a
  única rota de dashboard sem `ErrorBoundary` próprio (`App.tsx:170`).
- **Confirmação**: "Pediu pra sair" grava opt-out LGPD **sem confirmação
  nenhuma** (`ThreadView.tsx:239`), enquanto ações reversíveis têm `confirm()`.
- **Tamanho**: `DiscoveryPanel.tsx` 423 linhas / 4 responsabilidades;
  `prospect-admin.js` 613 linhas / ~30 ações num `if`-chain, cujo catch genérico
  é o que impede o front de mostrar causa útil.

## Ordem sugerida

1. Estados de erro nos 6 painéis + faixa de saúde (saldo, crons, fila parada).
2. Bucket `recusou` + rótulo `porteiro`.
3. n mínimo e coluna de falhas no A/B.
4. Toque 4 no VariantsPanel.
5. A11y dos popovers + contraste.
6. Confirmação no opt-out.
