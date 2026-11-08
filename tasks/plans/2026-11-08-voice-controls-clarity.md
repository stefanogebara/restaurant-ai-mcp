# Clareza dos controles de Voz

No celular, a página de Voz mostra controles técnicos quando os valores salvos não coincidem com um preset e apresenta quinze chips de idioma. Há também uma falha de estado: aplicar um preset dispara três alterações no mesmo render, podendo preservar só a última.

1. Aplicar cada preset como uma única alteração completa, preservando a velocidade atual.
2. Deixar os controles técnicos recolhidos por padrão, com indicação de ajuste personalizado quando necessário.
3. Trocar a grade de quinze idiomas por um seletor compacto e acessível, mantendo todos os idiomas e o aviso de mudança pendente.
4. Verificar testes, build e tela em 320/390 px, depois PR, produção por SHA e smoke pós-alias.

## Verificação

- [x] Testes de preset, controles avançados e idioma: 12 testes direcionados passaram.
- [x] Suites locais: Jest 4605 passaram (6 ignorados); Vitest 1119 passaram. Sintaxe de API passou.
- [x] Prévia local em 320/390 px: sem rolagem horizontal, controles e seletor funcionais.
- [x] Build de produção local: `npm run build` passou.
- [ ] Verificações de PR.
- [ ] Preview e produção por SHA; autenticação disponível para UI real.
- [ ] Checks e smoke pós-alias.
