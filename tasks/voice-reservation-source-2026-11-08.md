# Origem das reservas por voz

- [x] Reproduzir a origem incorreta em uma chamada real no sandbox.
- [x] Fixar o contrato de criação em um teste.
- [x] Marcar reservas criadas pelo agente de voz com `voice_ai`.
- [x] Rodar o teste focado e a verificação do projeto.
- [ ] Integrar o PR e conferir produção por SHA e alias.

## Evidência inicial

A conversa `conv_7201m6yjf3naft0rcdgje5n3n4dn` criou a reserva
`RES-20261108-XAlQN9sAm7qw` no sandbox. A linha veio com `source=manual`,
apesar de `notes=Created via AI Voice System`. A reserva foi cancelada após o
teste. O apelido temporário `Casa Azul` foi removido.

## Revisão

O primeiro teste fixou o payload do agente. A revisão da função de inserção
revelou que ela descartava `source`; um segundo teste reproduziu a perda.
`voice_ai` agora atravessa as duas funções até o payload de inserção.
O teste focado passou (40 casos), assim como o backend completo (4.678),
o frontend completo (1.140), o build e a sintaxe.
