# Chamadas no celular — revisão de hierarquia

Referência: `DESIGN.md` (Liquid Glass v2), página de Chamadas publicada em 390 px e painel do Gerente IA. O aviso de roteamento permanece visível antes das ações sobre o telefone.

| Decisão | Fonte | Motivo |
| --- | --- | --- |
| Lista antes das métricas no celular | Chamadas publicada, 390 px | O histórico é a tarefa principal; hoje nenhuma chamada aparece na primeira tela. |
| Período visível, filtros secundários recolhidos | Filtros atuais + controles em cápsula do painel | Mantém o filtro mais usado à mão sem gastar a tela com cinco controles. |
| Texto curto no resumo do telefone; detalhes em Voz | `DESIGN.md` e página Voz | Preserva o alerta necessário e remove explicação duplicada. |
| Ações secundárias discretas, conteúdo no canvas | Liquid Glass v2 | Mantém a hierarquia visual do painel. |

## Verificação

- [x] Revisar 320, 390 e 1200 px no navegador com dados de apresentação e os componentes reais.
- [ ] Exercitar filtros, abertura de chamada e navegação para Voz no preview autenticado.
- [x] Rodar testes focalizados, guardas de design e build.
- [x] Conferir diff e registrar limites antes do PR.

## Revisão até aqui

O build de produção do cliente passou novamente após os ajustes. Testes focalizados passaram (3/3); a suíte completa do cliente passou novamente (1.112/1.112), incluindo os guardas de paleta. A sintaxe das funções API passou. O backend passou (4.605/4.605; 6 pulados). Após a primeira revisão visual, a linha de chamada ganhou duas alturas no celular para mostrar o nome completo; o título e as ações foram encurtados em 320 px. O browser mostrou a primeira chamada dentro da tela de 390 px e nenhum transbordamento horizontal em 320 px com filtros abertos.

O navegador local usou dados de apresentação. A prova autenticada precisa ocorrer no preview ou em produção. Esta mudança só reorganiza a leitura do histórico; não altera roteamento, agentes nem chamadas reais.
