/**
 * Trava os dois vazamentos de teto medidos na leva de 04/ago 10:57.
 *
 * Casos reais daquele lote: Chama Supermercados, Natural da Terra e Centro
 * Cultural da Juventude receberam intro de reserva de mesa; Le Jazz, Capim
 * Santo, Buzina e JazzB apareceram duas vezes cada.
 */

const { qualificar, foraDoIcp } = require('../_lib/prospecting/lead-qualifica');

const lead = (name, tel, place) => ({ name, whatsapp_phone: tel, google_place_id: place });

describe('foraDoIcp — quem não faz reserva de mesa', () => {
  it.each([
    'Chama Supermercados - Água Rasa',
    'Centro Cultural da Juventude - Ruth Cardoso',
    'Drogaria São Paulo',
    'Farmácia Pague Menos',
    'Atacadão Autosserviço',
    'Mercado Municipal de Pinheiros',
    'Posto Ipiranga Rebouças',
    'Academia Smart Fit',
  ])('descarta %p', (nome) => {
    expect(foraDoIcp(nome)).toBe(true);
  });

  // O erro caro é o falso POSITIVO: barrar restaurante bom. Bar, padaria e
  // café recebem reserva e são ICP — nenhum deles pode cair no filtro.
  it.each([
    'Olívio Bar e Gastronomia',
    'Le Jazz Brasserie',
    'Padaria Bella Paulista',
    'Café Girondino',
    'Boteco Casarão',
    'Mania de Churrasco | Prime Steak & Burger',
    'Restaurante Capim Santo São Paulo',
    'Mercadinho do Chef',          // 'mercado ' exige espaço: não pega isto
    'Restaurante Mercado São Jorge', // nem isto
    'Bar da Escola',                 // 'escola' aqui é nome próprio de bar
  ])('mantém %p', (nome) => {
    expect(foraDoIcp(nome)).toBe(false);
  });
});

describe('qualificar — dedup e ordem', () => {
  it('colapsa leads que dividem o mesmo telefone', () => {
    const { candidatos, descartados } = qualificar([
      lead('Le Jazz Brasserie', '+5511999990000', 'p1'),
      lead('Le Jazz Brasserie Itaim', '5511999990000', 'p2'), // mesmo tel, formato diferente
    ]);
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0].name).toBe('Le Jazz Brasserie');
    expect(descartados.dup_telefone).toBe(1);
  });

  it('colapsa o MESMO lugar gravado duas vezes, mesmo com telefone diferente', () => {
    const { candidatos, descartados } = qualificar([
      lead('Buzina Burgers', '+5511999990001', 'place-buzina'),
      lead('Buzina Burgers', '+5511888880002', 'place-buzina'),
    ]);
    expect(candidatos).toHaveLength(1);
    expect(descartados.dup_place).toBe(1);
  });

  it('preserva a ordem de prioridade da fila', () => {
    const { candidatos } = qualificar([
      lead('Primeiro', '+5511900000001', 'a'),
      lead('Segundo', '+5511900000002', 'b'),
      lead('Terceiro', '+5511900000003', 'c'),
    ]);
    expect(candidatos.map((c) => c.name)).toEqual(['Primeiro', 'Segundo', 'Terceiro']);
  });

  it('lead sem telefone e sem place não derruba nem colapsa com outro igual', () => {
    const { candidatos } = qualificar([
      lead('Sem Contato A', null, null),
      lead('Sem Contato B', null, null),
    ]);
    expect(candidatos).toHaveLength(2);
  });

  it('conta os três motivos de descarte separadamente', () => {
    const { candidatos, descartados } = qualificar([
      lead('Restaurante Bom', '+5511900000010', 'x1'),
      lead('Chama Supermercados', '+5511900000011', 'x2'),
      lead('Restaurante Bom 2', '+5511900000010', 'x3'), // tel repetido
      lead('Restaurante Bom 3', '+5511900000012', 'x1'), // place repetido
    ]);
    expect(candidatos).toHaveLength(1);
    expect(descartados).toEqual({ fora_icp: 1, dup_telefone: 1, dup_place: 1 });
  });

  it('entrada vazia ou nula não explode', () => {
    expect(qualificar([]).candidatos).toEqual([]);
    expect(qualificar(null).candidatos).toEqual([]);
    expect(qualificar([null, undefined]).candidatos).toEqual([]);
  });
});
