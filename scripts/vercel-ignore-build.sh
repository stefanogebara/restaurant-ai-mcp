#!/usr/bin/env bash
# Vercel "Ignored Build Step".
#
# CONVENÇÃO DA VERCEL, e ela é ao contrário do que a intuição diz:
#   exit 0  -> PULA o build
#   exit 1  -> FAZ o build
#
# POR QUE ISTO EXISTE (03/09/2026): o build deste projeto leva ~17 min de
# relógio, e o frontend responde por 38 SEGUNDOS deles. O resto é a Vercel
# empacotando 191 funções serverless, uma a uma (~3,4s de trace NFT cada).
# Nada disso muda quando o commit só toca documentação — e 9 dos últimos 38
# commits em main eram exatamente isso. Um quarto do gasto de CPU do ciclo
# saía de builds que não mudavam um byte do que é servido.
#
# FALHA PARA O LADO DE CONSTRUIR. Sem base de comparação, com git raso, ou em
# qualquer erro, o script manda construir. Um build a mais custa minuto; um
# build a menos indevido custa produção servindo código velho — e este projeto
# já perdeu dois dias com exatamente isso em jul/2026.

set -uo pipefail

construir() { echo "BUILD: $1"; exit 1; }
pular()     { echo "PULA: $1";  exit 0; }

# Caminhos que produzem bytes servidos. Tudo que não casar aqui é ruído para
# o deploy: docs, tarefas, lições, config de agente, workflows do GitHub.
DEPLOYAVEL='^(api/|client/src/|client/public/|client/index\.html|client/vite\.config|client/package(-lock)?\.json|package(-lock)?\.json|vercel\.json|scripts/vercel-ignore-build\.sh)'
# Exceções DENTRO de api/ e client/src: teste não vai para o bundle.
IRRELEVANTE='(__tests__/|\.test\.(js|ts|tsx)$|\.md$)'

base="${VERCEL_GIT_PREVIOUS_SHA:-}"
[ -z "$base" ] && base="HEAD^"

git rev-parse --verify "$base" >/dev/null 2>&1 || construir "sem base de comparação ($base)"

arquivos=$(git diff --name-only "$base" HEAD 2>/dev/null) || construir "git diff falhou"
[ -z "$arquivos" ] && construir "diff vazio — não dá para afirmar que nada mudou"

relevantes=$(printf '%s\n' "$arquivos" | grep -E "$DEPLOYAVEL" | grep -vE "$IRRELEVANTE" || true)

if [ -n "$relevantes" ]; then
  construir "$(printf '%s\n' "$relevantes" | wc -l) arquivo(s) deployável(is), ex: $(printf '%s\n' "$relevantes" | head -1)"
fi

pular "$(printf '%s\n' "$arquivos" | wc -l) arquivo(s), nenhum deployável"
