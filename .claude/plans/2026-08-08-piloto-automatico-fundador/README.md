# Piloto automático do fundador

**Data:** 2026-08-08
**Decisão do fundador:** autonomia TOTAL, e-mail e WhatsApp, ambos pela Cloud API / Resend.
**Problema:** o funil escala mas o fundador não. Cada lead que a Olímpia entrega exige
abrir o e-mail, ler o histórico, mandar mensagem, lembrar se já mandou, checar resposta,
detectar redirecionamento pra outro contato, escrever e-mail e anexar apresentação.

---

## 1. O que já existe (não reconstruir)

| Peça | Onde | Estado |
|---|---|---|
| Digest diário de handoff | `api/cron/prospect-handoff-digest.js` | 08:30 BRT, lista handoff + agendando |
| Link wa.me com pitch pré-escrito | `_lib/prospecting/founder-digest.js` | funciona, um toque |
| "Já fechei" de um toque | `api/prospect-close.js` | token HMAC, GET/POST split |
| Envio WhatsApp | `_lib/channels/meta-adapter.js` | texto livre (janela 24h) |
| Envio e-mail | `_lib/email.js` (Resend) | sem anexo hoje |
| Captura de e-mail do lead | `prospect-responder.js` → `prospect_email` | grava, ninguém lê |
| Janela de 24h enforçada | `prospect-responder.js:396` | fora da janela → só template |

**Conclusão:** o gargalo não é falta de encanamento, é que o lado do fundador nunca teve
rail próprio. O que o fundador faz na mão acontece FORA do sistema (os dois leads de
07/08 nem estavam no CRM), então nada rastreia, nada monitora resposta, nada segue.

## 2. Os três buracos

1. **Sem rail de e-mail.** A Olímpia não tem ferramenta de e-mail. Endereço entregue pelo
   porteiro vira beco sem saída (caso Bario Bar, corrigido em 8e2b98f1 para ir pro digest,
   mas ainda depende do fundador enviar na mão).
2. **Sem rastreio do envio manual.** Fundador manda pelo WhatsApp pessoal, o sistema não
   sabe, então não monitora resposta nem faz follow-up.
3. **Sem anexo/link de apresentação.** O deck existe (`racha/docs/outreach/`), é
   personalizado por prospect e vive em OUTRO repo.

## 3. Por que o caminho autônomo precisa de guardrail por construção

Em 07-08/08 três claims falsos saíram sozinhos, todos gerados pelo modelo:
gorjeta direto pro garçom (custou um lead), "o fundador não faz reunião" (falso),
e "vou mandar a proposta pro e-mail" (impossível, sem ferramenta).

Autonomia total multiplica exatamente essa classe de erro. A resposta NÃO é reduzir a
autonomia que o fundador pediu, é tornar o caminho autônomo determinístico onde dá e
barrado por lint onde não dá:

- **Conteúdo mecânico usa template fixo revisado**, não composição do LLM.
- **Todo envio passa por um claim-linter** que bloqueia a família de frases proibidas
  (gorjeta direto, taxa pro consumidor, promessa de envio, agenda do fundador, preço).
  Bloqueio = não envia e escala, nunca "envia mesmo assim e loga".
- **Kill switch** por `cron_config` como todos os outros crons.
- **Teto de volume por dia** para um bug não queimar a base inteira antes de alguém ver.
- **Tudo em `prospect_messages`**, inclusive o que o fundador manda, pra fechar o buraco 2.

## 4. Fases

### Fase 1 — rail de e-mail + linter (esta sessão)
- [ ] `_lib/prospecting/claim-linter.js` puro: recebe texto, devolve violações. Zero I/O.
- [ ] `_lib/email.js`: `sendProspectProposalEmail({ to, lead, deckUrl })` com Resend.
- [ ] Template fixo de proposta (o texto já validado nos casos Bario / A Baianeira).
- [ ] Deck genérico do Racha, sem nome de prospect, hospedado em URL pública.
      Link, não anexo: 760KB de PDF em cold email derruba entregabilidade.
- [ ] Cron `prospect-founder-email`: pega leads em handoff COM `prospect_email` e sem
      proposta enviada, linta, envia, registra em `prospect_messages`, marca o lead.

### Fase 2 — WhatsApp autônomo do fundador
- [ ] Template Meta novo, voz do fundador, categoria Marketing, pt_BR. **Dependência
      externa de dias: começar a aprovação AGORA, é o caminho crítico.**
- [ ] Dentro da janela de 24h: texto livre pelo `MetaAdapter`.
- [ ] Fora da janela: o template aprovado.
- [ ] Registrar como `out` no `prospect_messages` para o monitor enxergar.

### Fase 3 — monitor de resposta e follow-up
- [ ] Estado novo do lado do fundador (`founder_sent_at`, `founder_channel`).
- [ ] Inbound depois de envio do fundador reabre o lead e notifica.
- [ ] Silêncio depois de N dias dispara follow-up (template).

### Fase 4 — deck por prospect
- [ ] Portar o `criar_demo` do Seatable: deck gerado com o nome da casa.
      É o maior ganho de conversão pendente, já anotado em `racha/docs/outreach`.

## 5. Fora de escopo, deliberadamente

- **Dirigir o WhatsApp pessoal do fundador por browser.** Viola os termos e o risco é
  banir o número, derrubando junto o canal da Olímpia. O rail é a Cloud API.
- **LLM compondo e-mail livre para prospect.** Fase 1 usa template fixo. Composição
  livre entra só depois do linter provar que segura em produção.

## 6. Verificação

- Linter tem teste por família de claim proibido, com as strings reais dos três
  incidentes de 07-08/08 como casos.
- Cron novo entra desarmado (`cron_config.enabled = false`) e sobe com dry-run antes
  de mandar para gente de verdade.
- `npx jest api/__tests__/prospect` verde antes de qualquer push.
