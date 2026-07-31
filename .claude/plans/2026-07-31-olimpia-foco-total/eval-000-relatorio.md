# Eval 000 — Olímpia (2026-07-31)

Juiz: anthropic/claude-opus-5 · 3/3 threads auditadas

## Médias por dimensão (1-5)

| dimensão | média |
|---|---|
| coerencia_produto | 1.00 |
| atende_o_lead | 1.67 |
| naturalidade | 2.67 |
| objetivo_do_turno | 2.00 |
| deteccao_maquina | 2.00 |
| respeito_recusa | 3.00 |

## Por thread

### Pizzaria e Esfiharia Classe A — bot (estado conversando, variante D)
Thread 100% autoatendimento em que a Olímpia percebeu o robô mas seguiu empilhando pitch de reservas (produto errado) para uma pizzaria de almoço, sem nunca citar o Racha nem pedir o decisor.
- **Pior turno**: "Vocês perdem muita mesa por no-show ou por não conseguir atender todas as ligações?"
- **Problema**: Terceira mensagem seguida disparada contra um autoatendimento de cardápio, aprofundando um pitch de reservas para uma casa de almoço/delivery que nem trabalha com reserva — e sem nenhuma ponte para o produto real (Racha).
- **Reescrita**: "Acho que caí no atendimento automático 🙂 Consegue me passar o contato do dono ou do gerente? É rapidinho: a gente resolve a conta na mesa pelo QR, cada cliente paga a parte dele no celular e a gorjeta vai direto pro garçom — sem app e sem maquininha."
- Mudanças sugeridas: Regra dura: ao detectar eco de máquina (mesma mensagem repetida, menu/cardápio automático, link de pedido), proibir qualquer novo pitch — o único turno permitido é um pedido curto de contato do decisor, e depois silêncio/encerramento. · Proibir mais de uma mensagem por turno; nunca enfileirar 2-3 bolhas seguidas, especialmente sem resposta humana no meio. · Obrigar ponte explícita do template de intro (Seatable/reservas) para o produto real na primeira mensagem própria: 'na real o que eu trago hoje é X — pagar a conta na mesa pelo QR', e nunca aprofundar dor de reserva/no-show. · Usar sinais do próprio lead para requalificar: se o negócio é pizzaria/esfiharia de almoço, delivery ou não trabalha com reserva, reposicionar para o Racha ou desqualificar, em vez de repetir o script de mesas vazias. · Fechar todo turno com CTA único e concreto: link da prévia de ~10s ou pedido do decisor — nunca pergunta aberta de sondagem sem próximo passo.

### Labareda drinks & BBQ — misto (estado conversando, variante D)
Olímpia fez pitch de reservas para um autoresponder, nunca puxou para o Racha nem para a prévia, e só escapou de nota pior porque não insistiu após a recusa do humano.
- **Pior turno**: "Oi! Obrigada pelo retorno rápido"
- **Problema**: Confundiu uma mensagem de autoatendimento ("em alguns instantes um dos membros da nossa equipe já vai te atender") com resposta humana e emendou elogio + pergunta de qualificação para a máquina, queimando o primeiro contato antes de qualquer humano ler.
- **Reescrita**: "Vi que é o atendimento automático 🙂 quando alguém da equipe puder ver: sou a Olímpia, queria falar 30 segundos com quem cuida do salão/caixa da Labareda. Pode me dizer com quem falo?"
- Mudanças sugeridas: Regra dura de detecção de autoresponder: se a primeira resposta contiver padrões como 'em instantes', 'nossa equipe vai te atender', 'mensagem automática', 'horário de funcionamento', NÃO responder com agradecimento/elogio/pergunta de qualificação — apenas pedir o decisor e aguardar humano. · Proibir elogios genéricos não ancorados em fato observável ('que movimento bacana', 'trabalho incrível'); só elogiar citando algo concreto do perfil/Maps. · Obrigar a ponte de produto no primeiro turno próprio: independentemente da variante de intro (Seatable/reservas), a Olímpia deve reposicionar explicitamente para o Racha ('na real o que eu trago hoje é dividir a conta na mesa pelo QR') e ter como único CTA a prévia de 10s — nunca call. · Consolidar em uma única mensagem por turno em vez de disparar 2–3 bolhas seguidas no mesmo minuto. · Em follow-up sem resposta humana, não perguntar 'como foi o movimento de ontem?': oferecer direto o link da prévia com uma frase de valor e uma saída fácil.

### Vermelho Grill — misto (estado conversando, variante D)
Olímpia manteve a conversa inteira no produto errado (reservas), atropelou dois sinais de recusa com rajadas de perguntas e nunca ofereceu a prévia do Racha, encerrando o turno sem próximo passo.
- **Pior turno**: "O que mais dá trabalho por aí: gente que some sem avisar nas reservas, ou conseguir atender todo mundo na correria do fim de semana?"
- **Problema**: Ignora o "Obrigada 😊" (sinal claro de encerramento), atropela com terceira mensagem seguida e ainda aprofunda no produto errado (reservas), sem nunca fazer a ponte para o Racha nem oferecer a prévia — deixa a conversa sem próximo passo e sem saída.
- **Reescrita**: "Fechado, falo com a pessoa certa então 🙌 Já que reserva vocês têm resolvido, deixo o que a gente faz hoje: o cliente paga a conta na mesa pelo QR, cada um a própria parte, gorjeta direto pro garçom — sem app e sem maquininha. Te mando a prévia de 10s pra você ver como ficaria no Vermelho Grill? Se não fizer sentido, me diz que eu paro por aqui."
- Mudanças sugeridas: Tornar obrigatória a ponte de produto na primeira resposta própria da Olímpia: qualquer intro herdada (Seatable/reservas) deve ser reancorada em 1 frase no Racha (pagar a conta na mesa pelo QR) — proibido continuar vendendo reservas/IA de atendimento por mais de um turno. · Regra de próximo passo único: todo turno da Olímpia termina com um só convite — a prévia self-service — nunca com pergunta de diagnóstico solta e nunca com proposta de call/reunião. · Limite de 1 mensagem por turno (máx. 2 curtas) e proibição de rajadas: agrupar raciocínio em uma bolha em vez de 3 mensagens no mesmo minuto. · Tratamento de recusa branda ("já temos quem cuida", "obrigada") como sinal de saída: uma única mensagem de encerramento com valor + porta aberta, sem pedir contato de terceiros nem insistir em diagnóstico. · Nunca pedir 'me passa o contato' antes de confirmar que o interlocutor não é o decisor; se ele se identificar como responsável, reconhecer sem elogio artificial ('Ah, perfeita então!') e ir direto ao valor. · Detecção de auto-reply: quando a resposta for menu/aviso automático, responder apenas pedindo o humano responsável, sem elogiar o sistema nem inserir pitch.
