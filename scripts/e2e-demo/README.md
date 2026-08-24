# E2E do funil "Demo em Conversa" (produção)

Dois roteiros Playwright que percorrem o funil REAL em seatable.one, num
Chromium de verdade (rAF vivo — animações e AnimatePresence funcionam, ao
contrário de panes headless ocultos):

- `funnel.mjs` — hero → busca → confirmação → criação sem e-mail → conversa
  → payoff → painel → captura por e-mail.
- `restaurante-novo.mjs` — caminho F4: nome inexistente → 3 perguntas → a
  recepcionista responde com os horários configurados → payoff → card
  "Configurada por você".

Ambos carregam uma **sentinela de datas**: qualquer `booking` fora da janela
hoje..+30d derruba o run (foi assim que o bug "sexta = 31/01/2025" apareceu).

## Rodar

```bash
npm i playwright          # uma vez (ou use um node_modules que já tenha)
node scripts/e2e-demo/funnel.mjs
node scripts/e2e-demo/restaurante-novo.mjs
```

Variáveis: `PW_RESTAURANTE`, `PW_CIDADE`, `PW_EMAIL` (default
stefanogebara+demotest@gmail.com). Screenshots caem em `shots/` ao lado.

## Custos e efeitos colaterais — por isso NÃO roda em CI

Cada run cria um demo REAL no banco (expira em 7 dias via cron), gasta
chamadas de LLM no demo-chat (tier 'chat', 10/min/IP) e o funnel.mjs envia
um welcome email de verdade para PW_EMAIL. Use como smoke manual depois de
mexer no funil — 2 bugs de produção foram achados assim em 24/ago (marcador
[[BOOKED]] omitido → #47; data resolvida para o ano errado → #49).
