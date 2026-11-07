# Pós-chamada do agente de voz compartilhado

- [x] Testar isolamento por conversa e rejeição de agente divergente, inclusive em entregas repetidas.
- [x] Ingerir chamadas do agente compartilhado apenas quando a conversa já estiver vinculada a um restaurante ativo, real e concluído.
- [x] Rodar testes específicos e conjunto backend; revisar diff.
- [ ] Abrir PR, aguardar checks, integrar e verificar deploy/produção.

## Limite

Este lote não atribui número, não ativa o agente compartilhado e não altera ferramentas ou webhooks da ElevenLabs. A vinculação autenticada durante a chamada será o próximo lote.

## Revisão

- Testes novos falharam antes da correção e passaram depois.
- Jest: 319 suítes, 4.580 testes passaram (6 preexistentes ignorados).
- Build do cliente e verificação de sintaxe passaram.
- Vitest local: 1.109 passaram e 1 falhou no seletor de período devido à troca de horário de verão em Europe/Madrid; o mesmo teste passou com `TZ=UTC`. Corrigir em PR próprio.
- Banco de produção: `agent_conversations.conversation_id` é único; `restaurant_config` tem `is_demo` e `onboarding_completed`.
