# Ação de salvar em Voz

Referência: `DESIGN.md` (burgundy para ação, conteúdo no canvas), tela Voz publicada em 390 px e navegação inferior móvel. A página mostra “Salvar Alterações” desabilitado antes de qualquer edição; depois de editar algo abaixo da dobra, a ação permanece longe, no topo.

| Decisão | Fonte | Motivo |
| --- | --- | --- |
| Mostrar Salvar só com mudanças pendentes | Estado `isDirty` da página | Remove um controle sem função no estado inicial. |
| Fixar a ação acima do menu inferior no celular | Navegação móvel publicada | Salvar fica alcançável ao editar ajustes longos. |
| Manter ação no cabeçalho no desktop | Hierarquia existente | Preserva o comportamento conhecido em tela ampla. |

## Verificação

- [x] Build e testes.
- [x] Revisar estado inicial e estado alterado em 390 px e desktop no preview autenticado anterior.
- [x] Confirmar que o botão não cobre o fim do formulário. A nova distância foi medida em 320 e 390 px; falta confirmar o novo commit no preview exato.

## Revisão parcial

O build final passou e contém a regra CSS de 6rem mais as áreas de segurança. O cliente passou 1.111 testes e o backend, 4.605 (6 pulados). A sintaxe das funções API passou. A ação aparece quando `isDirty` ou `isSaving`; o espaço no fim do conteúdo evita sobreposição com os últimos controles. No preview autenticado em 390 px, o botão apareceu somente após selecionar outra opção de voz e deixou o rodapé livre. Em 320 px, a navegação inferior ficou 84,5 px alta e se sobrepôs ao botão inicial em 4,5 px; com 6rem, a folga medida foi de 11,5 px em 320 e 24 px em 390. A inspeção do novo commit no preview exato ainda falta.
