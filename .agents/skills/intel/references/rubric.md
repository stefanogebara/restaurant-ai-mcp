# Rubrica de triagem — como decidir se uma notícia importa

Toda avaliação é feita **por projeto**. O mesmo paper pode ser IMPLEMENTAR no
TwinMe e DESCARTAR no Roça. O contexto vem de `intel.config.json`.

## Etapa 1 — Portões (gates). Falhou, para aqui.

| Gate | Regra | Se falhar |
|---|---|---|
| G1 Fonte | Existe URL primária acessível (arXiv, repo, blog de engenharia, release, filing)? | teto = REGISTRAR |
| G2 Leitura | O analista **abriu** a fonte e extraiu mecanismo/números, não só a manchete? | não pontua, volta pra fila |
| G3 Novidade | Não está em `seen.jsonl` nem é reescrita de item já registrado? | DESCARTAR (dedup) |
| G4 Escopo | Toca pelo menos um `focus_areas` do projeto? | DESCARTAR |

## Etapa 2 — Cinco eixos, 0 a 3 cada. Máximo 15.

**1. Proximidade** — distância entre o item e o que o projeto realmente faz.
- 0 mesma indústria, problema diferente · 1 problema adjacente
- 2 mesmo problema, stack diferente · 3 mesmo problema, stack compatível

**2. Acionabilidade** — dá pra fazer alguma coisa com isso, com esta stack, em ≤2 semanas?
- 0 nada a fazer · 1 só muda como a gente fala do produto
- 2 dá pra testar num spike · 3 tem código/receita reproduzível

**3. Durabilidade** — ainda importa em 6 meses?
- 0 notícia de ciclo · 1 tendência de trimestre
- 2 mudança estrutural do mercado · 3 técnica ou fato que vira base

**4. Evidência** — quão sólido é o que está sendo afirmado.
- 0 copy de anúncio · 1 números autodeclarados
- 2 benchmark ou dado auditável · 3 benchmark **e** artefato reproduzível

**5. Alavanca ou ameaça** — muda nossa posição ou nossa capacidade.
- 0 neutro · 1 contexto de mercado
- 2 concorrente ocupa espaço que a gente quer, ou técnica melhora um gargalo conhecido
- 3 ameaça direta a uma aposta nossa, ou destrava algo que hoje está bloqueado

## Etapa 3 — Escada de veredito

| Score | Veredito | O que acontece |
|---|---|---|
| 0–4 | `DESCARTAR` | só entra em `seen.jsonl`. Nunca aparece pro Stefano. |
| 5–7 | `REGISTRAR` | uma linha em `INTEL.md`, seção Radar. Sem ação. |
| 8–10 | `DISCUTIR` | entra em `INTEL.md` com **uma pergunta específica** que só o Stefano responde. Sobe pro resumo matinal. |
| 11–13 | `PROTOTIPAR` | vira item em `BACKLOG.md` com um spike de 2h–1 dia: hipótese, o que medir, critério de parada. |
| 14–15 | `IMPLEMENTAR` | item em `BACKLOG.md` com arquivos alvo, critérios de aceite e risco. |

### Travas que sobrescrevem o score
- Sem G1 (fonte primária) → teto `REGISTRAR`, não importa o score.
- Para passar de `DISCUTIR`, o analista precisa **nomear arquivo ou módulo real
  deste repositório** que o item toca. Não achou? Cai para `DISCUTIR`.
- `IMPLEMENTAR` exige que o item resolva um problema que já está escrito em
  `BACKLOG.md`, no código como TODO, ou nos `known_gaps` do config. Novidade
  atraente sem problema correspondente é `PROTOTIPAR`, no máximo.
- Dois itens que apontam pro mesmo movimento se fundem num só, com score do maior.

### Calibração
Numa semana normal, de ~20 candidatos: ~12 DESCARTAR, ~5 REGISTRAR, ~2 DISCUTIR,
~1 PROTOTIPAR, ~0 IMPLEMENTAR. Se todo item está virando PROTOTIPAR, a rubrica
está sendo aplicada com generosidade — releia a coluna Evidência.
