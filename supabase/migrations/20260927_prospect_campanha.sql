-- Campanha: uma lista de leads escolhida à mão (o piloto do Racha — bares de
-- SP escolhidos por pesquisa, não pela descoberta do Google), com os
-- templates DELA. null = o fluxo normal de sempre.
--
-- selectIntroCandidates: sem campanha, só leads SEM campanha (o cron nunca
-- manda a intro genérica pra uma lista à parte); com campanha, só os dela e
-- sem o piso de avaliações/nota. pickTemplate: a intro da campanha NÃO tem
-- reserva — sem template dela aprovado e ativo, a campanha não manda nada.
-- O único (toque, variante) continua: a campanha usa uma letra própria ('P').
alter table public.prospect_leads add column if not exists campanha text;
alter table public.prospect_templates add column if not exists campanha text;
create index if not exists prospect_leads_campanha_idx
  on public.prospect_leads (campanha) where campanha is not null;
