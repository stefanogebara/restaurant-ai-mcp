-- Modo PORTEIRO — parar de vender pra máquina, e parar de contar robô como lead.
--
-- Auditoria de 2026-07-23 (14 conversas travadas, 98 em 'conversando', 0 reuniões):
--   • 44,6% das PRIMEIRAS respostas do funil são robô/atendimento automático;
--   • em 4 das 14 conversas NENHUM humano digitou uma palavra — o funil contava
--     eco de máquina como "conversando", inflando a taxa de resposta de 37,4%;
--   • pareceAutoAtendimento() já existia mas só era alcançável dentro do branch
--     'ignorar' do modelo: se ele fazia pitch, o sinal de robô nunca chegava ao
--     prompt. A detecção existia e estava desconectada da decisão.
--
-- 'porteiro' NÃO é estado silencioso: um humano que assumir a caixa continua
-- sendo respondido, e estadoAposAcao('responder') devolve o lead pra
-- 'conversando'. Mas ele fica fora de TODO seletor proativo, que já opera por
-- whitelist de estados ativos — o que também para de queimar template de resgate
-- contra secretária eletrônica (11 das 14 conversas levaram template inútil).
--
-- APLICAR ANTES do deploy do código que escreve 'porteiro'/porteiro_tentativas,
-- ou o CHECK (e a coluna faltante) rejeitam o UPDATE. Mesma lição do 20260710.

ALTER TABLE public.prospect_leads
  DROP CONSTRAINT IF EXISTS prospect_leads_state_check;

ALTER TABLE public.prospect_leads
  ADD CONSTRAINT prospect_leads_state_check
  CHECK (prospect_state IN
    ('aguardando', 'conversando', 'agendando', 'agendado', 'handoff',
     'optout', 'pausada', 'recusou', 'porteiro'));

-- Quantos pedidos de decisor já foram feitos nesta thread. Ao atingir
-- PORTEIRO_MAX (2) sem nenhum humano aparecer, o lead é parqueado.
ALTER TABLE public.prospect_leads
  ADD COLUMN IF NOT EXISTS porteiro_tentativas INT NOT NULL DEFAULT 0;

-- Um estado novo que ninguém conta vira lead invisível — o mesmo "denominador
-- contaminado" com outro rótulo. O funil por variante passa a expor 'porteiro'
-- ao lado de 'optout'.
CREATE OR REPLACE FUNCTION public.prospect_variant_funnel()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  with base as (
    select l.id, l.intro_variant, l.reuniao_at, l.prospect_state,
      exists (select 1 from public.prospect_messages m
               where m.lead_id = l.id and m.direcao = 'out'
                 and m.status in ('delivered', 'read')) as delivered,
      exists (select 1 from public.prospect_messages m
               where m.lead_id = l.id and m.direcao = 'out' and m.status = 'read') as read_any,
      exists (select 1 from public.prospect_messages m
               where m.lead_id = l.id and m.direcao = 'in') as replied,
      (select avg(o.quality_score) from public.prospect_outcomes o
        where o.lead_id = l.id and o.quality_score is not null) as quality
    from public.prospect_leads l
    where l.intro_variant is not null
  )
  select coalesce(jsonb_agg(row_.j order by row_.variant), '[]'::jsonb) from (
    select intro_variant as variant, jsonb_build_object(
      'variant', intro_variant,
      'sent', count(*),
      'delivered', count(*) filter (where delivered),
      'read', count(*) filter (where read_any),
      'replied', count(*) filter (where replied),
      'booked', count(*) filter (where reuniao_at is not null),
      'optout', count(*) filter (where prospect_state = 'optout'),
      'porteiro', count(*) filter (where prospect_state = 'porteiro'),
      'avg_quality', round(avg(quality)::numeric, 2)
    ) as j
    from base group by intro_variant
  ) row_;
$$;
revoke execute on function public.prospect_variant_funnel() from public, anon;
grant execute on function public.prospect_variant_funnel() to service_role;
