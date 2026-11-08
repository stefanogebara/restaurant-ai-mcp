# Nome falado na linha compartilhada

## Plano

- [x] Confirmar o número, agente, autenticação e vínculo por conversa em produção.
- [x] Fazer chamada real sem reserva e localizar a falha no áudio e na ferramenta.
- [x] Testar apelidos explícitos e colisões entre restaurantes antes de alterar o identificador.
- [x] Aceitar apelido somente com cidade e vínculo único; manter a busca exata pelo nome oficial.
- [ ] Verificar testes, integrar e confirmar o deploy pelo commit e domínio.
- [ ] Configurar apenas o restaurante sandbox e repetir a chamada real.
- [ ] Confirmar o registro correto no banco e no painel, sem criar reserva.

## Revisão

O teste real chegou ao agente principal pelo número compartilhado; a ElevenLabs
transcreveu “CI” como “C1” e a busca exata recusou a identificação. O teste da
ferramenta com contexto telefônico válido autenticou e gravou o vínculo do
restaurante sandbox. A consulta sem vínculo retornou 409; a consulta vinculada
retornou a hora de São Paulo. A conversa sintética foi removida após o teste.

O novo apelido só vale quando configurado no restaurante, com cidade informada
e sem colisão de nome com outro restaurante ativo nessa cidade. Nenhum outro
restaurante recebeu opt-in ou alteração de configuração.
