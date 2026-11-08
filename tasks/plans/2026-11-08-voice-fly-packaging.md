# Empacotamento do servidor de voz

O serviço persistente de chamadas usa `fly.toml`, que aponta para `api/voice-server/Dockerfile`. O diretório foi movido para `api/_voice-server` para não virar função Vercel, mas o caminho de build, `COPY` e `CMD` ficaram antigos. O runtime também importa `api/_services/guestMemory`, que a imagem atual não copia.

1. Reproduzir a falha de empacotamento com teste de caminhos do Fly e Dockerfile.
2. Corrigir os caminhos e incluir as dependências locais do runtime.
3. Validar com build Docker local e boot sem credenciais de produção, sem fazer uma chamada real.
4. Revisar checks, preview, merge e produção pelo SHA. Verificar separadamente se o serviço Fly recebeu novo deploy antes de afirmar que chamadas mudaram.

## Verificação

- [x] Regressões dos caminhos e da versão do Node falharam antes das correções e passaram depois (2/2).
- [x] Imagem Docker `node:22-slim` construída. Contêiner iniciou com credenciais fictícias, `/health` retornou 200 e zero sessões; foi parado em seguida.
- [ ] PR e Vercel verificados; estado do Fly informado separadamente.

Jest completo: 4626 passaram, 6 ignorados. O primeiro build Docker travou na autenticação local do Docker Desktop. Uma configuração temporária anônima resolveu o pull sem alterar credenciais do usuário. `https://seatable-voice.fly.dev/health` respondeu 200 antes deste PR, o que prova apenas a disponibilidade da versão que já estava no ar. O CLI Fly e `FLY_API_TOKEN` não estão disponíveis neste ambiente.
