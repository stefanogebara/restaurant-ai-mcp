# Confirmação por WhatsApp após reserva por voz

- [x] Testar a resposta quando a Meta rejeita ou não confirma o envio.
- [x] Dizer ao hóspede apenas o estado que o servidor conhece.
- [x] Preservar a reserva mesmo se a mensagem falhar.
- [x] Verificar testes locais e build; falta o check do PR.
- [ ] Integrar e conferir produção por commit e alias.

## Defeito observado

`sendTemplateMessage` devolve `{success:false}` sem lançar erro quando a Meta
rejeita o template. O handler ignora esse retorno. A fala final promete que o
WhatsApp chegará, mesmo sem comprovação de aceite. A chamada real do sandbox
confirmou a reserva, mas não comprovou a entrega da mensagem.

## Revisão

O teste focado falhou antes da correção e passou depois. O backend completo
passou com 4.681 testes, o frontend com 1.140, e o build e a sintaxe passaram.
Uma resposta HTTP positiva da Meta significa aceite para envio, não entrega;
a fala foi ajustada para refletir isso. A data e a hora da fala agora usam o
idioma do restaurante em português, espanhol e inglês. O template da Meta
continua fixo em `pt_BR`; isso exige uma decisão separada baseada nas
variantes efetivamente aprovadas na conta Seatable.
