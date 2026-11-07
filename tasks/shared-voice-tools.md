# Ferramentas de voz compartilhada

- [x] Escrever testes de autenticação e vínculo imutável entre conversa, agente, número chamado e restaurante.
- [x] Identificar apenas restaurantes reais que aderiram explicitamente, por nome exato e cidade quando houver ambiguidade.
- [x] Bloquear ferramentas antes do vínculo; ignorar identificadores de restaurante fornecidos pelo modelo.
- [x] Usar o número do chamador fornecido pela ElevenLabs na nova reserva.
- [x] Bloquear consulta, alteração e cancelamento de reservas até haver verificação de titularidade do hóspede.
- [x] Rodar 4.596 testes de backend, testes específicos após os últimos ajustes, sintaxe e revisão de segurança.
- [ ] Abrir PR, esperar checks e integrar.
- [ ] Configurar segredo e variáveis em produção depois do backend testado; só então alterar as ferramentas da ElevenLabs.

## Limite

Não trocar a atribuição do número nem o webhook do workspace antes de comprovar um teste de conversa, reserva e pós-chamada sem vazamento entre restaurantes.

O opt-in é `ai_config.phone.shared_routing_enabled === true`. Nenhum restaurante recebe tráfego do agente compartilhado até ser habilitado explicitamente. O provedor deve enviar o segredo Bearer e os cabeçalhos `x-agent-id`, `x-conversation-id`, `x-called-number` e `x-caller-number` com variáveis de sistema da ElevenLabs. As quatro ferramentas sensíveis de cliente/reserva não devem ser configuradas no agente compartilhado até existir verificação de titularidade.

## Revisão

- 320 suítes e 4.596 testes de backend passaram na verificação completa; os testes específicos passaram depois dos últimos ajustes.
- O vínculo usa a chave única `agent_conversations.conversation_id` existente; uma corrida de inserção só é aceita se agente, número chamado, chamador e restaurante coincidirem.
- A busca por nome é exata após normalização de acentos. Uma lista truncada ou nomes repetidos sem cidade não produz vínculo.
- O número do chamador da ElevenLabs limita a nova reserva. Consulta, alteração e cancelamento aguardam uma etapa de verificação do hóspede.
- Nenhum segredo, opt-in, número, ferramenta ou webhook externo foi modificado neste lote.
