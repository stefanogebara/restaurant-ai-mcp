# Saudação real do agente de voz

Ao salvar a saudação personalizada, `/api/voice-persona` atualiza o banco e a base de conhecimento, mas não o `first_message` que a ElevenLabs fala ao atender. A troca de idioma substitui esse campo por uma saudação genérica, mesmo se o restaurante salvou uma própria.

1. Testar primeiro os dois caminhos: salvar saudação deve atualizar prompt e primeira fala no agente; trocar idioma deve preservar uma saudação personalizada.
2. Compartilhar a geração da saudação padrão entre criação, troca de idioma e edição da persona.
   Ao reconstruir o prompt, carregar também perfil, dados enriquecidos, estratégia e políticas do restaurante para não apagar contexto já aprendido.
3. Distinguir no retorno/UI o valor salvo no Seatable do PATCH aceito pela ElevenLabs; isso ainda não prova uma chamada real. Avisar que saudação personalizada não é traduzida ao trocar idioma.
4. Para o motor OpenAI, levar `agent_name` e `agent_greeting` do banco ao servidor de chamadas e usar a saudação salva como primeira fala. Não exigir um sync de ElevenLabs.
   Normalizar códigos regionais como `pt-BR` e `es-ES` no prompt e usar o idioma configurado como padrão quando a língua de quem liga não estiver clara.
5. Rodar testes, build e verificações do PR; validar publicação por SHA e alias. Não alegar chamada telefônica real sem realizá-la.

## Verificação

- [x] Testes de regressão antes da correção: 6 falhas esperadas.
- [x] Testes e build locais: Jest 4612 passaram (6 ignorados); Vitest 1115 passaram; build passou.
- [x] Após o rebase e a distinção do motor OpenAI: 21 testes focados de backend e 3 de interface passaram. CI integral fará a nova varredura.
- [x] Auditoria do servidor OpenAI encontrou persona descartada pelo loader. Regressão demonstrada primeiro; após a correção, 29 testes focados passaram (loader, primeira fala, API, sync).
- [x] Regressão do sync mostrou que o prompt era reconstruído sem conhecimento e políticas; consulta completada com as colunas existentes no esquema.
- [x] Regressão de idioma demonstrou `pt-BR` e `es-ES` tratados como inglês e padrão fixo em português; prompt agora usa o idioma configurado.
- [x] Prévia local Playwright em 320 e 390 px: formulário e ações visíveis, sem rolagem horizontal. Sem autenticação ou salvamento no ambiente real.
- [ ] Checks, preview e produção por SHA.
