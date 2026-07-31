# Síntese eval 001 — mudanças propostas

Modelo: anthropic/claude-fable-5

## Mudança 1 — Detector de autoatendimento (bloco "MÁQUINA OU GENTE?")

- **Problema**: A Olímpia pitcha, elogia e faz discovery para robôs de atendimento (cardápio automático, "como podemos ajudar?", horários, "iremos te atender em breve"). `deteccao_maquina` ≤ 2 em **16 de 25** auditorias (nota 1 em 10). É a maior fonte de turnos queimados e o único padrão presente em quase todos os pior_turno.
- **Onde**: persona (`prospect-agent.js`, `buildSystemPrompt`) — novo bloco antes de "REGRAS INEGOCIÁVEIS".
- **Trecho atual**: ausente. O mais próximo é a regra 6 ("MENSAGEM IRRELEVANTE/ACIDENTAL: se vier algo fora do assunto…"), que não cobre autoresposta — o modelo trata cardápio como assunto.
- **Proposta** (adicionar):
  ```
  INTERLOCUTOR — MÁQUINA OU GENTE? Antes de responder, classifique a última mensagem.
  SINAIS DE AUTOATENDIMENTO: link de cardápio/pedido, menu numérico ("digite 1"),
  horário de funcionamento, formulário ("Nome:", "Dia e horário:"), saudação
  institucional ("obrigado por entrar em contato", "como podemos ajudar?",
  "em breve um atendente..."), nome da casa em 3ª pessoa, ou texto IDÊNTICO a um
  já recebido nesta conversa. Se detectar máquina: PROIBIDO pitch, elogio,
  agradecimento, small talk e pergunta de dor. O ÚNICO movimento permitido é UMA
  linha nomeando o automático e pedindo o responsável (ex.: "acho que caí no
  atendimento automático 🙂 quem cuida do salão/reservas por aí?"). Se vier uma
  SEGUNDA mensagem automática sem humano no meio, chame ignorar — não insista.
  Nada do que uma mensagem automática diz conta como resposta humana.
  ```
- **Risco/efeito colateral**: falso positivo com humano de escrita formal — mitigado porque o movimento de fallback (pedir o responsável em uma linha) também é aceitável para um humano.

## Mudança 2 — Anti-invenção estendida a fatos do lead e a tempo/rotina

- **Problema**: Elogios e contexto fabricados — "kafta com arroz sírio incrível", "pato no tucumã" (prato errado), "que legal o site novo", "abriram agora", "correria boa no sábado" (era terça), "terça mais tranquila depois do feriado" (feriado ainda não tinha acontecido), cidade errada repetida do cadastro. Aparece em **11 de 25** auditorias e é a mesma classe de falha que já derrubou a nota do Google (regra 1d).
- **Onde**: persona (`prospect-agent.js`) — nova regra 1e ao lado de 1b/1c/1d, mantendo o padrão anti-invenção existente.
- **Trecho atual**: as invariantes cobrem só nome, casos e nota: `'1d. NOTA DO GOOGLE: nunca invente a nota nem o número de avaliações...'` — nada sobre pratos, movimento, datas ou cidade.
- **Proposta** (adicionar após 1d):
  ```
  1e. FATOS DO LEAD E TEMPO: nunca afirme nada sobre o restaurante que não esteja
     literalmente nesta conversa ou no contexto acima — pratos, cardápio, site,
     "abriram agora", movimento, expansão. Cidade do cadastro é HIPÓTESE: confirme
     antes de usar em elogio. E nunca cite dia/rotina não verificáveis ("como foi
     ontem?", "fim de semana puxado, né?", feriado): use a DATA E HORA AGORA acima
     ou não fale de tempo. Elogio sem fato real = não elogie.
  ```
- **Risco/efeito colateral**: aberturas ficam menos "quentes"; aceitável — rapport falso custa mais que rapport nenhum.

## Mudança 3 — Política de follow-up: sem humano = 1 toque pedindo decisor; recusa = trava

- **Problema**: Follow-ups que fingem conversa em andamento ("E aí, como foi o movimento de ontem?") quando nenhum humano jamais respondeu — **8 auditorias**; e reabertura após recusa explícita ("Lembrei de vocês" um dia depois de "acho que não é o caso") ou insistência após "já temos sistema" — **5 auditorias** (Jasmim Rosa, Banzeiro, Vermelho Grill, Santa Chicória, Fazenda do Mineiro).
- **Onde**: modelo/infra (orquestrador dos nudges/`injectUserTurn`) + persona.
- **Trecho atual**: ausente — o prompt tem "não insista… depois de UMA tentativa" para dentro do turno, mas nada governa os toques agendados; a instrução de nudge injetada gera o rapport presumido.
- **Proposta**:
  - Infra: o orquestrador só dispara nudge de "retomar conversa" se existir ≥1 turno inbound classificado como humano; sem humano, o nudge vira **um único** toque de reengajamento neutro ("assumindo que ninguém leu ainda") pedindo o decisor, e depois a thread para. Após recusa explícita registrada, bloquear qualquer nudge por ≥30 dias.
  - Persona (adicionar ao bloco RITMO): `- Se o lead disse que "já tem sistema" ou "não é o caso": no máximo UMA pergunta leve de contexto; a segunda tentativa é proibida — encerre agradecendo e deixando a porta aberta. "Já temos quem cuida disso" significa que ELE tem solução, não que você deve pedir o contato de outra pessoa.`
- **Risco/efeito colateral**: menos toques totais → menos volume de conversa, mas os toques cortados são exatamente os que geraram optout (Goguiya) e desgaste de marca (Banzeiro).

## Mudança 4 — Corrigir o companion de handoff ("boa pergunta… com o time")

- **Problema**: Fallback determinístico disparado como non-sequitur: no Sobreiro, o lead disse "Já passei seu contato" (nenhuma pergunta) e recebeu "boa pergunta — vou confirmar direitinho com o time", inventando um "time" numa operação solo. **1 auditoria**, mas é string hardcoded que sai em todo handoff sem texto do modelo — bug de fábrica, não de conversa.
- **Onde**: persona (`prospect-agent.js`, `COMPANION_TEXT.handoff`).
- **Trecho atual**:
  ```
  handoff: `boa pergunta — vou confirmar direitinho com o time e te retorno 🙂 se preferir falar direto com o fundador, esse é o número dele: ${FOUNDER_WHATSAPP}`,
  ```
- **Proposta** (diff):
  ```
  handoff: `deixa eu confirmar isso direitinho e te retorno 🙂 se preferir falar direto com o fundador, esse é o número dele: ${FOUNDER_WHATSAPP}`,
  ```
  E adicionar no prompt, junto da regra 3: `Nunca diga "boa pergunta" se o lead não perguntou nada, e nunca mencione "time/equipe" — fale em primeira pessoa.`
- **Risco/efeito colateral**: nenhum relevante; mantém o contato do fundador (invariante da regra 11).

## Mudança 5 — Enforcement determinístico anti-rajada no envio

- **Problema**: 3 bolhas no mesmo minuto sem resposta humana em **~16 de 25** auditorias — apesar de a regra já existir no prompt, o modelo a viola e o responder envia cada parágrafo como bolha separada. Regra de prompt sozinha comprovadamente não segura.
- **Onde**: modelo/infra (responder, na etapa de envio — o código já sabe separar bolhas: `String(texto).split(/\n{2,}/)` em `stripForeignPhoneBubbles`).
- **Trecho atual**: no prompt existe `'- UMA mensagem por turno, curta. NÃO quebre em várias bolhas.'` — mas nenhum guard no código faz cumprir.
- **Proposta**: antes de enviar, colapsar o texto da ação em UMA bolha (`texto.replace(/\n{2,}/g, '\n')`), exceto quando a bolha extra é o link real da prévia colado pelo sistema. Logar quando o colapso agiu (métrica de aderência do modelo à regra RITMO).
- **Risco/efeito colateral**: mensagens pontualmente mais densas numa bolha só; melhor que o padrão "disparo em rajada" que denuncia automação.

## O que NÃO mudar

- **Coerência de produto**: 4–5 em todas as 25 auditorias — zero deriva de pitch, época respeitada. A separação persona/perfil (`prospect-product.js`) está funcionando; não tocar no baseline Seatable (é reversão byte-a-byte por design).
- **Invariantes anti-invenção existentes (1, 1b, 1c, 1d) e guards de telefone**: nenhuma auditoria mostra preço, caso de cliente, nota ou número inventado — só **estender** (Mudança 2), nunca afrouxar.
- **Comportamento pós-recusa dura**: Bom Prato (5/5), Labareda (4) e Goguiya (4) mostram que, diante de "não temos interesse" explícito, ela já encerra sem contornar. O problema é só recusa *branda* e reabertura agendada (Mudança 3).
- **Racha sem call**: manter `agendaDemoTool: false` e o bloco "SEM REUNIÃO" — nenhuma mudança acima introduz agendamento.
- **Templates `olimpia_intro_b` e `olimpia_toque3`**: o intro_b já prepara o pedido de decisor ("se não for você quem cuida disso, só me apontar a pessoa certa") — exatamente o movimento que a Mudança 1 exige; e o toque3 encerra com leveza. Não reescrever.
