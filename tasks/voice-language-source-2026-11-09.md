# Idioma canônico na confirmação por voz

- [x] Reproduzir divergência entre `agent_language` e `ai_config.language` que levou a Meta 132001 em produção.
- [x] Carregar `agent_language` nos caminhos de restaurante por ID, agente e telefone.
- [x] Priorizar `agent_language` nas respostas e no template de confirmação por voz.
- [ ] Verificar testes, CI, deploy por SHA e chamada sintética; limpar o sandbox.

## Revisão

A chamada sintética no deploy de #279 criou a reserva, mas Meta recusou o template em en_US e en (132001). O sandbox tem agent_language=pt e ai_config.language=en-US; o carregador omitia agent_language. Os testes reproduziram a falha antes da correção e passaram depois (17/17 dirigidos). A revisão completa, CI, publicação e nova chamada ainda estão pendentes.
