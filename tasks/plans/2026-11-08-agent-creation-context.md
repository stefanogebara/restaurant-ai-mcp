# Contexto no nascimento do agente de voz

O agente criado no onboarding lê `restaurant_config`, mas a consulta omite o perfil, o cardápio enriquecido, a estratégia, o depósito e a saudação salva. O prompt nasce genérico, apesar dos dados já estarem no banco; no onboarding, `custom_greeting` não é enviado ao serviço.

1. Demonstrar a perda com teste do payload real enviado à ElevenLabs.
2. Usar os campos existentes de `restaurant_config` ao construir o prompt e preservar o endereço passado pelo chamador.
3. Usar a saudação salva no banco quando não há uma saudação explícita na chamada, mantendo a explícita com prioridade.
   Usar o idioma solicitado na criação para o prompt, mesmo se o cadastro ainda tiver o idioma anterior. Falhar sem criar agente quando a leitura do banco retorna erro.
4. Rodar testes e build, revisar o PR, verificar preview, merge, `main`, deploy e smoke pelo SHA exato. Não confundir aceite de API com chamada telefônica real.

## Verificação

- [x] Três regressões falharam antes da correção: contexto ausente, erro do banco ignorado e idioma do prompt divergente. Depois, 33 testes focados passaram.
- [x] Jest 4624 passaram (6 ignorados), Vitest 1123 passaram, build, sintaxe da API e `git diff --check` passaram.
- [ ] Checks e preview do PR passam no SHA final.
- [ ] `main` e produção verificados por SHA e alias, smoke após alias.
