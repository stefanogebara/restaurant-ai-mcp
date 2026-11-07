# Presets de data em dias do calendário

- [x] Reproduzir com teste a travessia do horário de verão.
- [x] Corrigir 7/30/90 dias preservando o dia local.
- [x] Rodar testes, build e revisar diff.
- [ ] Abrir PR, integrar após checks e verificar produção.

## Revisão

O novo teste falhou antes da correção: 7 de novembro selecionava 9 de outubro em vez de 8 de outubro. Depois da correção, 138 suítes e 1.111 testes passaram em Europe/Madrid. O build do cliente passou. A primeira execução completa falhou por dependências ausentes no worktree; foi reiniciada após vincular as dependências locais.
