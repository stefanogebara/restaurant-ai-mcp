# Formato de `docs/intel/INTEL.md`

Arquivo rolante, append no topo, lido por humano e por agente. Nunca reescreva
o histórico; só acrescente e mova itens entre seções.

```markdown
# Intel — <projeto>

> Atualizado por `/intel`. Config em `intel.config.json`, rubrica em
> `.claude/skills/intel/references/rubric.md`.
> Índice de dedup: `docs/intel/seen.jsonl`.

## Em aberto — precisa de decisão do Stefano

### [DISCUTIR 9/15] Título curto e concreto
**Data:** 2026-08-22 · **Fonte:** [SiliconANGLE](https://…) · **Eixos:** P3 A2 D2 E1 L1
**O que é:** dois a quatro períodos. Mecanismo, não manchete. Números reais.
**Por que toca este projeto:** referência a arquivo, módulo ou aposta concreta.
**A pergunta:** uma pergunta que só o Stefano responde. Nunca retórica.

## Fila de trabalho
Itens promovidos vivem em `BACKLOG.md`. Aqui fica só o ponteiro:
- [PROTOTIPAR 12/15] Título → `BACKLOG.md#slug`

## Radar
Uma linha por item REGISTRAR, mais novo em cima.
- `2026-08-22` Título — o fato em meia linha. [fonte](https://…)

## Arquivo
Itens que foram resolvidos, descartados depois de discutidos, ou que
envelheceram. Mova pra cá com uma linha dizendo o que aconteceu.
```

## Formato de `docs/intel/BACKLOG.md`

```markdown
### <slug> — Título
**Origem:** INTEL 2026-08-22 · **Veredito:** PROTOTIPAR 12/15
**Hipótese:** se <mudança>, então <efeito mensurável>.
**Spike:** o experimento mínimo. Caixa de tempo explícita.
**Medir:** a métrica e o número que conta como sucesso.
**Parar se:** condição de desistência, escrita antes de começar.
**Toca:** `caminho/do/arquivo.ts`, `outro/modulo.py`
**Status:** aberto | em andamento | fechado (<data>, <resultado>)
```

## `docs/intel/seen.jsonl`
Uma linha JSON por item já avaliado, inclusive descartados.
`{"url":"…","hash":"…","date":"2026-08-22","verdict":"DESCARTAR","score":3}`
O hash é sha1 dos 200 primeiros caracteres do título normalizado — pega
republicação com manchete trocada.
