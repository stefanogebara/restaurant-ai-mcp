# Entrada da demonstração: duas portas visíveis

O hero publicado leva a `/demo/setup`, mas essa tela começa com busca por nome e cidade e só revela o caminho para restaurante novo depois de uma busca. Isso contradiz a promessa de ver a conversa virar reserva e faz o novo dono pensar que não pode entrar.

1. Dar duas escolhas explícitas na primeira tela: casa existente (busca) e casa nova (configuração curta). Preservar o nome e a cidade ao trocar de caminho.
2. Não chamar Google na escolha de casa nova. Exigir nome e cidade antes de criar; manter cozinha, horário e clima opcionais.
3. Fazer erros, zero resultados e “não encontrei” chegarem à mesma porta manual. Manter confirmação explícita para resultados do Google.
4. Alinhar título, descrição e promessa de tempo/dados reais aos dois caminhos em PT, EN e ES.
5. Regressão de interação, build e Playwright em 320/390/desktop no preview, depois verificar merge, SHA, alias e smoke de produção.

## Verificação

- [x] Testes de interação falharam antes da implementação e passaram depois (inclusive Enter no caminho novo).
- [x] Build, Jest 4620/6 ignorados e Vitest 1125 passaram; regressão final 7/7. Um teste de gestos da planta falhou sob execução concorrente e passou sozinho; a suíte completa passou em repetição sem build paralelo.
- [ ] Preview revisado em 320/390/desktop.
- [ ] Main e produção verificados por SHA e alias.

## Revisão visual local

- 320 px: sem rolagem horizontal nem controles fora da tela; o CTA manual é alcançável por rolagem normal.
- 390 px: as duas escolhas ficam visíveis antes dos campos; personalização recolhida deixa a ação principal perto dos campos.
- Desktop: título e escolhas conservam o canvas quente e a tipografia da marca.
