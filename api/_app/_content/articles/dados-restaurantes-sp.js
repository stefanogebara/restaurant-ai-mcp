/**
 * Artigo-âncora com DADO PROPRIETÁRIO: o mapeamento de restaurantes de SP
 * feito pela nossa prospecção (prospect_leads). Números conferidos direto na
 * base em 2026-07-12 — se a base mudar muito, atualizar aqui e no updatedAt:
 *   total 4.678 · sem site 42% (1.964) · com telefone 99,9% (4.676)
 *   nota média 4,50 · 4,5+ = 63% das avaliadas (2.931/4.645)
 *   100+ avaliações = 75% (3.486) · top bairros: Pinheiros 96, Ipiranga 73,
 *   Bela Vista 66, Campo Belo 63, Liberdade 62.
 */

module.exports = {
  slug: 'restaurantes-sao-paulo-o-que-os-dados-mostram',
  title: 'Mapeamos 4.678 restaurantes em São Paulo. O que os dados mostram',
  metaDescription:
    'Mapeamos 4.678 restaurantes de São Paulo: 99,9% têm telefone, 42% não têm site, nota média 4,50. O que os dados dizem sobre onde nasce (e morre) a reserva.',
  publishedAt: '2026-07-12',
  updatedAt: '2026-07-12',
  tags: ['dados', 'sao-paulo'],
  excerpt:
    'Números do nosso mapeamento de 4.678 restaurantes paulistanos: quase todos atendem por telefone, 42% não têm site — e a concorrência tem nota 4,5. O que isso significa pra sua casa.',
  bodyHtml: `
<p>Nos últimos meses, mapeamos <strong>4.678 restaurantes de São Paulo</strong> a partir de dados públicos do Google Places — nome, canais de contato, avaliações, localização. O objetivo era operacional (é assim que a nossa IA conhece as casas da cidade), mas o retrato que emergiu diz muito sobre como o paulistano reserva mesa — e onde essa reserva morre.</p>

<h2>O telefone é (de longe) a porta de entrada</h2>
<p><strong>99,9% das casas mapeadas têm telefone público no Google</strong> (4.676 de 4.678). Nenhum outro canal chega perto dessa cobertura: <strong>42% não têm sequer um site cadastrado</strong>. Ou seja: para quase metade dos restaurantes da cidade, a reserva só existe se alguém atender uma ligação ou responder uma mensagem — na mão.</p>
<p>É uma constatação incômoda: o canal mais universal do setor é exatamente o que fica sem resposta no momento de maior demanda, o rush. A casa investe em cozinha, em salão, em equipe — e a porta de entrada da receita fica pendurada em quem tiver a mão livre quando o telefone tocar.</p>

<h2>A régua de qualidade está alta</h2>
<p>A nota média das casas avaliadas é <strong>4,50</strong> — e <strong>63% têm nota 4,5 ou mais</strong>. Três em cada quatro (75%) acumulam mais de 100 avaliações. Em outras palavras: em São Paulo, comida boa e serviço bom são o piso, não o diferencial. Com a qualidade nivelada por cima, a disputa se decide nas margens — e atendimento que não responde é a margem mais barata de perder.</p>

<h2>Onde estão as casas</h2>
<p>No nosso mapeamento, os bairros com mais restaurantes são <strong>Pinheiros</strong> (96 casas na amostra), <strong>Ipiranga</strong> (73), <strong>Bela Vista</strong> (66), <strong>Campo Belo</strong> (63) e <strong>Liberdade</strong> (62) — com Itaim Bibi e Vila Mariana logo atrás. A nota média por bairro varia pouco (de 4,47 a 4,56 entre os grandes), o que reforça o ponto anterior: não há bolsão de mediocridade pra se esconder. A concorrência do lado é boa em todo lugar.</p>

<h2>O que isso significa pra quem é dono</h2>
<ul>
  <li><strong>O seu telefone vale mais do que parece.</strong> Ele é o canal universal — e cada ligação perdida é uma reserva que o vizinho de nota 4,5 atende.</li>
  <li><strong>Não ter site já não é exceção</strong> (42% não têm) — mas significa depender 100% de canais conversacionais. Se eles não respondem, não existe plano B.</li>
  <li><strong>Avaliação alta não segura cliente na fila.</strong> Com todo mundo bem avaliado, quem responde primeiro leva.</li>
</ul>

<h2>Metodologia, em uma linha</h2>
<p>Dados públicos do Google Places, coletados pela Seatable na região de São Paulo; os percentuais de nota consideram apenas casas com avaliação (4.645 de 4.678). Amostra por bairro extraída do endereço público. Números conferidos na data de publicação.</p>

<p>A Seatable existe exatamente pra fechar essa lacuna: uma atendente de IA que atende o telefone com voz natural e responde o WhatsApp em segundos, 24 horas. <a href="/sistema-de-reservas/sao-paulo/japones">Veja como funciona para a sua cozinha</a> ou <a href="/demo/setup">monte a demo com os dados da sua casa</a>.</p>
`,
};
