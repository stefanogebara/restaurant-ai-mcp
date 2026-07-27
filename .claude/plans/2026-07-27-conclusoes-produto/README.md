# Conclusões de produto — o que a pesquisa de 27/jul/2026 obriga a decidir

Documento de decisão, não de dados. O levantamento bruto (plataforma por plataforma,
com endpoint, preço e fonte) está no diretório
`2026-07-27-mapa-mercado-fluxo-completo/`. Aqui ficam só as conclusões que mudam o
que a gente constrói.

---

## 1. Não existe padrão aberto de mesa no Brasil. Toda integração é bilateral.

O **Open Delivery** da Abrasel — o único padrão aberto do setor, Apache 2.0 — cobre
`MERCHANT`, `ORDERS` e `LOGISTICS`. **Não tem mesa, não tem comanda, não tem
reserva.** É delivery-only por construção.

Isso mata a hipótese mais confortável ("a gente pluga no padrão e pronto"). Cada PDV
é uma negociação, um contrato e uma homologação separada. Integração de PDV é
**trabalho comercial recorrente**, não um sprint de engenharia que termina.

## 2. O gargalo da Racha não é técnico — é quem controla a comanda.

Das ~15 plataformas levantadas, **uma única** documenta o par completo que a Racha
precisa: ler a conta aberta *e* registrar o pagamento.

| Plataforma | Lê conta da mesa | Registra pagamento | Situação |
|---|---|---|---|
| **Abrahão** | `GET /table/{cod}/bill` | `POST /table/{cod}/payment` | **único par completo confirmado** |
| Colibri | provável | provável ("pagar contas") | doc com DNS morto (NCR→RS Solutions) |
| Saipos | sim (status) | **não** | `close-sale` só pinta a mesa de laranja |
| Consumer | não (fluxo invertido) | não | você expõe a API, eles fazem polling |
| Menew, Zig, Goomer, Anota AI | não documentado | não | — |

Três leituras duras disso:

**(a) O `close-sale` da Saipos não fecha nada.** Está na doc e o sandbox confirmou:
ele avisa o garçom que o cliente pediu a conta. Não tem campo de valor nem de forma
de pagamento. O adaptador Saipos que já está escrito serve pra *ler* a mesa — a baixa
do pagamento continua manual. Isso precisa estar no discurso de venda desde o
primeiro dia, senão vira promessa quebrada na implantação.

**(b) A Abrahão, que é a chave, se fundiu com a Goomer** — que vende QR de mesa com
conta compartilhada, ou seja, concorre com a Racha. Pedir a API de pagamento deles é
pedir ao concorrente que abra a comanda. Não descarta, mas muda o tom da conversa.

**(c) As duas rotas genéricas são as adquirentes**: Cielo LIO (API REST remota aos
módulos de ordem e pagamento, publicação na Cielo Store) e Stone Connect 2.0
(Programa de Parcerias, terminais S920/Q92 — com Pix ainda constando "em
desenvolvimento"). São mais lentas de entrar, mas cada uma destrava *muitos* PDVs de
uma vez, em vez de um por um.

## 3. A Racha já tem um sósia operando no Brasil: Qlub.

Mesmo QR na mesa, várias pessoas escaneiam o mesmo código, divisão por item / por
valor / igual, gorjeta opcional. E — o ponto que dói — **já integrou Alterdata,
TOTVS, Micros/Oracle, Bematech e SisChef**, exatamente o trabalho que a conclusão 2
diz ser o gargalo. Tem parceria comercial com a Ticket.

Somando Qlub + iFood Na Mesa + Goomer Go modo Mesa + Zig Mesas + Anota AI com QR de
mesa: **o espaço "QR na mesa" está ocupado**. O que continua vazio é o *pós-pago com
divisão real por pessoa, lendo a comanda de um PDV que a gente não controla* — e é
exatamente onde o gargalo da conclusão 2 morde.

## 4. O preço do Seatable está acima do teto do mercado de reservas.

| | Preço | Base instalada |
|---|---|---|
| Tagme | R$ 150–350/mês, sem taxa por reserva | 4.000+ casas |
| Getin | R$ 239–415/mês | 3.000+ parceiros |
| **Seatable Essencial** | **R$ 497/mês** | — |
| **Seatable Profissional** | **R$ 1.497/mês** | — |

O plano de entrada custa mais que o plano mais caro do concorrente líder. Isso só se
sustenta se a venda for **substituição de mão de obra** (uma recepcionista custa
muito mais que R$ 1.497) — nunca "software de reserva melhor". Numa comparação
feature-a-feature contra o Getin, a conversa de preço se perde antes de começar.

Decisão pendente: ou desce o Essencial pra faixa R$ 250–350 e trata a IA de voz como
upgrade, ou tira o Essencial da comparação de reservas e vende só o pacote de IA. O
que não dá é ficar no meio.

## 5. "IA no WhatsApp" já é commodity no Brasil. Voz não é.

Tagme e Getin não têm IA nenhuma — o Getin ainda **cobra SMS a R$ 0,10 por
mensagem**, exatamente o custo que um agente de WhatsApp torna obsoleto. Esse é o
flanco.

Mas o concorrente perigoso não é a Tagme: são **Reserv.ai** (que já tem mapa de
mesas), Flly, ReservaBot e a **Cris do iFood**. Todos atacam pelo mesmo ângulo e já
estão no ar.

Conclusão: **a diferenciação do Seatable não pode ser "IA no WhatsApp"**. Tem que ser
(1) agente de **voz** — nenhum concorrente brasileiro anuncia isso — e (2)
profundidade operacional que bot de WhatsApp não tem: mapa de salão, ML de no-show,
depósito, staffing, Manager AI. Isso já está construído; o que não reflete é a
comunicação.

## 6. Reserve with Google é mesa obrigatória, e a gente não está nela.

Tagme, Getin, ChefsClub e OpenTable estão todos na lista oficial de parceiros do
Google. É por Maps e Busca que o consumidor brasileiro procura restaurante. Um
sistema de reservas fora dessa lista perde a demanda inteira que chega por ali.

É item de distribuição, não de produto — mas com impacto maior que a maioria das
features do roadmap.

## 7. PSP: Mercado Pago é o único self-service com Pix + split.

Pagar.me (o atual) tem o split mais maduro, mas é restrito a cliente com contrato
PSP. Stone OpenBank tem Pix excelente e **zero split**. PicPay e Cielo não publicam
split. **Ame morreu** — cancelou a licença de Instituição de Pagamento no Banco
Central.

Não é motivo pra trocar agora. É o plano B documentado, e importa saber que existe um
caminho sem contrato caso a Pagar.me trave.

---

## O que isso muda no roadmap

**Racha**
1. Parar de tratar integração de PDV como feature e tratar como **canal**: o alvo são
   Cielo LIO e Stone Connect 2.0, que destravam muitos PDVs de uma vez.
2. Abrahão é o único par completo — vale o contato, ciente de que passa pela Goomer.
3. O modo manual (sem PDV) deixa de ser degradação e vira **o produto principal**,
   porque é o único que funciona em qualquer casa hoje.

**Seatable**
4. Decidir o preço do Essencial contra o teto real de R$ 415 do Getin.
5. Repor o **agente de voz** no centro da comunicação — único diferencial que nenhum
   concorrente brasileiro anuncia.
6. Entrar no Reserve with Google.
7. Migração (import de CSV, que já existe) é feature de venda, não integração: contra
   Tagme e Getin não há API, então é sempre rip-and-replace.
