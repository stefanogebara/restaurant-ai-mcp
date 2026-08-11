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

### Fase 1 — rail de e-mail + linter ✅ (08-09/08)
- [x] `claim-linter.js` puro, 7 famílias, cada uma com o motivo junto do padrão.
- [x] `sendProspectProposalEmail` com Resend, remetente **Racha** (não Seatable).
- [x] Compositor determinístico, auto-lintado, com link do demo em vez de anexo.
- [x] Cron `prospect-founder-email`, com dry-run, teto, kill switch e idempotência.
- [x] **Armado em 09/08.** Primeiro envio autônomo: Bario Bar → compras@bario.com.br.

### Fase 2 — WhatsApp autônomo do fundador ⛔ BLOQUEADA
- [x] Três templates escritos e validados contra o linter (no fim deste doc).
- [ ] **Submeter na Meta.** Só o fundador pode; é dependência externa de dias e
      trava todo o resto da fase. **Nada aqui anda até isso.**
- [ ] Dentro da janela de 24h: texto livre pelo `MetaAdapter`.
- [ ] Fora da janela: o template aprovado.

### Fase 3 — monitor de resposta e follow-up ✅ (10-11/08)
- [x] Inbound de lead calado avisa o fundador em dois canais, com o texto do lead,
      cooldown de 6h e eco de máquina filtrado.
- [x] Follow-up por silêncio no canal de e-mail: espera de 4 dias, qualquer inbound
      cancela, um por lead, e o texto assume que pode estar enganado.
- [ ] **Resposta por e-mail continua invisível.** Vai pro replyTo (Gmail do
      fundador). Precisa de inbound próprio (MX + webhook) — decisão de infra, não
      de código. É o último buraco grande do loop.
- [ ] Follow-up por WhatsApp: depende da Fase 2.

### Fase 4 — proposta por prospect ✅ (11/08)
- [x] Página personalizada em `/proposta?t=TOKEN`, token com rótulo próprio
      (`racha-deck:v1:`), separado do token de "já fechei".
- [x] Personalização honesta: nome, cidade e setor. O setor muda a DOR apresentada.
- [x] Endpoint só lê, em qualquer verbo (scanner corporativo pré-busca a URL).
      Sem beacon de abertura, pelo mesmo motivo.
- [x] Link entra na proposta e vira o MOTIVO do follow-up.
- [x] Verificado em produção com token real: HTTP 200 e a página certa.

---

## 7. Estado em 11/08/2026

**No ar e rodando sozinho:** proposta por e-mail (13/16/19 UTC, teto 20/dia),
follow-up por silêncio, aviso de resposta ao fundador, proposta personalizada.
Suíte completa: 3351 testes verdes.

**Só o fundador destrava:**
1. Submeter os três templates na Meta (trava a Fase 2 inteira).
2. Decidir o inbound de e-mail (último buraco do loop).
3. Domínio próprio pro Racha antes de escalar volume — hoje a prospecção fria sai
   do mesmo domínio dos transacionais do Seatable, e denúncia de spam num lead frio
   dana a reputação que entrega confirmação de reserva de cliente pagante.

**Armadilha operacional conhecida:** rodar o cron LOCAL assina o link da proposta
com o `CRON_SECRET` do `.env.local`, que não é o de produção (são três segredos
diferentes nos .env; o de produção está no `.env.vercel.local`). Link assinado
local = 404 pro prospect. Rodar local só com `?dry=1`.

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

---

# Templates Meta para o WhatsApp do fundador

**Para submeter no WhatsApp Manager.** Categoria **Marketing**, idioma **pt_BR**.
Dependência externa de dias: é o caminho crítico da Fase 2. Submeter antes do código ficar pronto.

Regras da Meta que estes textos já respeitam:
- Não começam nem terminam com variável (rejeição automática).
- Duas variáveis no máximo, ambas com exemplo de preenchimento.
- Sem promessa de ganho financeiro, sem urgência falsa, sem CAPS.
- Marketing em pt-BR pede saída fácil: o botão de recusa cobre isso.

Todos passam pelo `claim-linter` (`api/_lib/prospecting/claim-linter.js`).

## 1. `racha_fundador_intro`

Primeiro contato do fundador depois que a Olímpia entrega o lead (estado `handoff`),
quando a janela de 24h já fechou.

```
Oi {{1}}! Aqui é o Stefano, fundador do Racha, o pagamento de conta na mesa por QR que a Olímpia apresentou pra vocês do {{2}}.

Queria te convidar pra ser uma das primeiras casas a testar, sem custo e sem contrato: seus clientes escaneiam o QR da mesa, cada um paga a sua parte no Pix ou cartão, e a mesa fecha sem fila de maquininha.

Dá pra ver em 30 segundos, do seu celular, exatamente a tela que o seu cliente vê. Posso te mandar?
```

| Variável | Significado | Exemplo |
|---|---|---|
| `{{1}}` | Nome do responsável | Leo |
| `{{2}}` | Nome da casa | Bario Bar |

**Botões (Quick Reply):** `Quero ver` · `Agora não`

O `Agora não` é o que evita denúncia de spam: dá saída em um toque e alimenta o
`marcar_optout` em vez de virar bloqueio do número.

## 2. `racha_fundador_followup`

Silêncio depois do primeiro toque do fundador. **Um só**, nunca em série.

```
Oi {{1}}, é o Stefano do Racha de novo. Só pra não deixar solto: mandei um convite pra vocês do {{2}} testarem o pagamento na mesa por QR, e sei que essas mensagens somem na correria.

Se não fizer sentido pra casa, me diz que eu paro por aqui, sem problema nenhum. Se quiser ver como fica, é meio minuto no celular.
```

**Botões (Quick Reply):** `Quero ver` · `Não tenho interesse`

## 3. `racha_fundador_proposta_email`

Para quando o porteiro entrega um e-mail e a proposta sai por lá. Fecha o loop que
hoje morre em silêncio (caso Bario).

```
Oi {{1}}, obrigado por passar o contato! Mandei a proposta do Racha pro e-mail que você indicou, com um link pra ver o pagamento na mesa funcionando em 30 segundos.

Qualquer dúvida pode me chamar por aqui mesmo.
```

**Botão (Quick Reply):** `Tudo certo`

> Só pode ser disparado **depois** de o e-mail ter saído de verdade. É exatamente a
> promessa que o incidente do Bario quebrou: a mensagem afirma um envio, então o envio
> precisa ter acontecido antes, não depois.

## Depois de aprovado

Registrar em `prospect_templates` e apontar o env do disparo do fundador para o nome
aprovado. Nunca disparar texto livre fora da janela de 24h.
