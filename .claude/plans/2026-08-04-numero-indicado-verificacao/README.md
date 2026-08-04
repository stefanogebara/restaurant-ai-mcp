# Número indicado: procedência não é verificação

**Tarefa #89** · aberta em 04/08/2026 · pendente

## O incidente

O Capim Santo compartilhou, pelo WhatsApp, um cartão de contato com nome
"Adriana" e o número +5511977117070. O fundador pediu que a mensagem de
abertura fosse enviada do número pessoal dele para essa pessoa. Foi enviada.

Não era a Adriana. O número é de uma amiga do fundador, que recebeu um pitch
frio de uma empresa que não conhecia.

## O que NÃO falhou

Vale registrar, porque o instinto é procurar bug e não tem bug:

- O payload da Meta chegou íntegro. O vcard decodificado diz literalmente
  `N:;Adriana;;;` e `TEL;waid=5511977117070:+55 11 97711-7070`.
- O parser leu certo: gravou `[Contato compartilhado: +5511977117070 | nome:
  Adriana]`, exatamente o conteúdo do cartão.
- O envio foi para o número correto do cartão, com o destinatário conferido no
  cabeçalho da conversa antes de enviar.

Cada etapa cumpriu seu contrato e o resultado foi uma pessoa errada abordada.

## A premissa errada

O sistema trata "veio num cartão de contato" como equivalente a "número
verificado do decisor". O comentário em `api/_lib/prospecting/numero-indicado.js`
declara isso: compartilhar contato "é intenção explícita, não inferência".

É intenção explícita **de quem enviou**. Não é garantia de que o dado está
certo. Quem escolheu o contato na agenda pode ter escolhido o errado, e
escolheu.

Caminho atual, sem nenhuma checagem de que o número tem relação com a casa:

```
cartão chega → registrar_responsavel → lead novo → fila de intro → disparo
```

## O que construir

### 1. Cerca de plausibilidade antes de criar o lead

- DDD do indicado contra a praça de quem indicou. Divergência sozinha não
  bloqueia (dono pode ter celular de outro estado), mas rebaixa a confiança.
- Número indicado que já pertence a OUTRO lead, ou ao contato do fundador, é
  sinal forte de erro: não dispara.
- Recusa grava evento com o motivo. Barrar em silêncio troca um erro visível
  por um invisível.

### 2. Confirmação com a casa antes do primeiro toque

Em vez de escrever direto para o indicado, a Olímpia pergunta a quem indicou:
"esse número é da Adriana daí mesmo?". Só depois do sim o indicado entra na
fila.

Custa um turno de conversa e elimina a classe inteira do erro. O trade-off é
velocidade de funil: se pesar demais, aplicar apenas quando a cerca do item 1
levantar suspeita.

### 3. Mesmo cuidado no digest do fundador

`founder-digest.js` monta link `wa.me` para fechamento manual confiando no
mesmo campo. Deve exibir o nível de confiança do número e destacar quando não
passou por confirmação: o fundador escreve do número pessoal dele, onde o custo
de errar é maior.

## Aceite

- [ ] Teste que reproduz o caso real: cartão com nome plausível mas número de
      terceiro não vira disparo automático.
- [ ] Teste de que indicação legítima (DDD compatível, número novo) continua
      fluindo sem atrito.
- [ ] Evento na linha do tempo quando a cerca barra algo, com motivo legível no
      cockpit.

## Estado dos leads afetados

| lead | id | estado |
|---|---|---|
| "Adriana" (número da terceira) | `fbc89a34-4520-414b-bc85-c954b25fb9cd` | `optout` + número na lista de supressão |
| Capim Santo | `f70d9bbb-88e3-49ff-a211-3a28db96e717` | `numero_indicado` limpo; contato certo ainda pendente |

A supressão bloqueia todo caminho automático de contato, não só a sequência.

## Lição associada

`tasks/lessons.md`, seção "Dado que veio de terceiro não é dado verificado".
A regra geral: antes de agir sobre dado vindo de terceiro (cartão, telefone
raspado, e-mail de formulário, indicação), perguntar o que prova que está
certo. "A pessoa mandou" é procedência, não verificação.
