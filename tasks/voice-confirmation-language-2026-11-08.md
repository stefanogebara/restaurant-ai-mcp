# Confirmação WhatsApp no idioma do restaurante

- [x] Reproduzir o envio forçado em pt_BR para restaurantes em outros idiomas.
- [x] Selecionar apenas variantes do idioma do restaurante e tentar a próxima somente se a Meta informar tradução ausente.
- [x] Preservar a reserva e a resposta honesta quando nenhuma variante existir.
- [ ] Verificar testes, sintaxe, build, CI, deploy por SHA e comportamento publicado.

## Revisão

Testes dirigidos falharam antes da correção e passaram depois (42/42). Jest completo: 327 suites e 4.690 testes passaram, 1 suite e 6 testes já ignorados. Vitest: 143 arquivos e 1.140 testes passaram. Build e sintaxe passaram. Após ajuste pontual da prioridade de `pt`, os 42 testes dirigidos passaram novamente. CI, merge e produção ainda pendentes neste registro.
