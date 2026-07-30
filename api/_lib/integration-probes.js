'use strict';

/**
 * Sondas de integração — a resposta pra "o WhatsApp está funcionando AGORA?".
 *
 * Por que existe: o Seatable tem 119 variáveis em produção e 19 delas estão
 * marcadas como "Sensitive" na Vercel, o que significa que NINGUÉM consegue
 * lê-las de fora — nem `vercel env pull`, que devolve o literal
 * `[SENSITIVE]` no lugar do valor. O token da Meta é uma delas. Ou seja: a
 * única forma de saber se ele ainda vale é perguntar de DENTRO da função,
 * onde o valor real existe.
 *
 * Isso já mordeu: o token da Meta expirou em 09/mai/2026 e só foi notado
 * ~3 semanas depois, num audit. Nesse meio-tempo toda chamada à Meta dava
 * 401 em silêncio — a página de WhatsApp, o envio de mensagem, tudo. O cron
 * monitor-meta-token-expiry cobre esse caso específico; aqui a pergunta é
 * mais ampla e sob demanda: TODAS as dependências externas, agora.
 *
 * Três regras que moldam o módulo:
 *
 * 1. NUNCA ecoar segredo. Mensagem de erro de fornecedor às vezes devolve a
 *    chave enviada ("Invalid API key sk-proj-abc..."). Tudo passa por
 *    `redigir()` antes de virar JSON.
 * 2. "Não configurado" ≠ "quebrado". Twilio ausente é uma escolha (usamos
 *    Meta), não uma falha — pintar de vermelho treina o fundador a ignorar
 *    o vermelho.
 * 3. Toda sonda tem prazo próprio. Um fornecedor pendurado não pode consumir
 *    o maxDuration da função inteira e derrubar o diagnóstico junto.
 *
 * As sondas são GET baratos e sem efeito colateral — nada aqui envia
 * mensagem, cobra cartão ou escreve no banco.
 */

const NIVEIS = {
  OK: 'ok',
  ATENCAO: 'atencao',
  FALHA: 'falha',
  NAO_CONFIGURADO: 'nao_configurado',
};

/** Token da Meta com menos que isto pra expirar já é aviso, não surpresa. */
const DIAS_AVISO_EXPIRACAO = 14;
/** Prazo por sonda. Curto de propósito: é diagnóstico, não trabalho. */
const PRAZO_MS = 8000;

/**
 * Tira do texto qualquer coisa com cara de segredo antes de virar resposta.
 *
 * Fornecedor devolve a chave na mensagem de erro com frequência maior do que
 * se imagina. Como este endpoint existe pra ser colado em chat e ticket, uma
 * mensagem crua é vazamento. Preferimos redigir demais a de menos: qualquer
 * sequência longa de caracteres de token vira [redigido].
 */
function redigir(texto) {
  if (texto == null) return '';
  return String(texto)
    // prefixos conhecidos (sk-, pk-, rk_, whsec_, EAA… da Meta, xoxb…)
    .replace(/\b(sk|pk|rk|ak)[-_][A-Za-z0-9_-]{8,}/gi, '[redigido]')
    .replace(/\bwhsec_[A-Za-z0-9_-]{8,}/gi, '[redigido]')
    .replace(/\bEAA[A-Za-z0-9]{20,}/g, '[redigido]')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{12,}/gi, 'Bearer [redigido]')
    // JWT (eyJ…) — o service_role do Supabase tem esse formato
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.?[A-Za-z0-9_-]*/g, '[redigido]')
    // qualquer bloco alfanumérico muito longo remanescente
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[redigido]')
    .slice(0, 300);
}

const naoConfigurado = (nome, faltando) => ({
  nome,
  nivel: NIVEIS.NAO_CONFIGURADO,
  detalhe: `variável ausente: ${faltando}`,
});

const falha = (nome, detalhe, extra = {}) => ({
  nome, nivel: NIVEIS.FALHA, detalhe: redigir(detalhe), ...extra,
});

const ok = (nome, detalhe, extra = {}) => ({
  nome, nivel: NIVEIS.OK, detalhe: redigir(detalhe), ...extra,
});

const atencao = (nome, detalhe, extra = {}) => ({
  nome, nivel: NIVEIS.ATENCAO, detalhe: redigir(detalhe), ...extra,
});

/** fetch com prazo — sem isto, um fornecedor lento derruba o diagnóstico todo. */
async function buscar(url, opcoes = {}, prazoMs = PRAZO_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), prazoMs);
  try {
    const r = await fetch(url, { ...opcoes, signal: ctrl.signal });
    const corpo = await r.json().catch(() => ({}));
    return { status: r.status, corpo };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Erro virado veredito. `AbortError` vira "prazo esgotado" em vez do texto
 * cru do Node, que não diz nada pra quem lê o diagnóstico.
 */
function erroParaFalha(nome, err) {
  if (err && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return falha(nome, `não respondeu em ${PRAZO_MS / 1000}s`);
  }
  return falha(nome, (err && err.message) || 'erro desconhecido');
}

/**
 * Token da Meta: vale? expira quando?
 *
 * `debug_token` inspecionando o próprio token é permitido quando o app do
 * token e o app inspecionado são o mesmo — que é sempre o caso aqui.
 * `expires_at === 0` significa token de System User, que não expira: é o
 * estado desejado, e vale dizer isso explicitamente no detalhe.
 */
async function sondarTokenMeta(env, agoraMs) {
  const nome = 'meta_token';
  const token = env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return naoConfigurado(nome, 'WHATSAPP_ACCESS_TOKEN');

  try {
    const { corpo } = await buscar(
      `https://graph.facebook.com/v21.0/debug_token?input_token=${encodeURIComponent(token)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (corpo.error) return falha(nome, corpo.error.message);

    const d = corpo.data || {};
    if (d.is_valid !== true) return falha(nome, 'token recusado pela Meta (is_valid=false)');

    // WABA ID a que este token dá acesso. Vem do próprio debug_token
    // (granular_scopes.target_ids) — é a única via barata: no nó do número o
    // campo não existe, e caçar no painel da Meta exige um humano logado.
    // Sem este id o provisionamento de números recusa com "não está
    // habilitado"; `waba_id_configurado` diz se a env já bate.
    const escopoWaba = (d.granular_scopes || [])
      .find((g) => g.scope === 'whatsapp_business_management');
    const wabas = escopoWaba?.target_ids || [];
    const infoWaba = wabas.length
      ? { waba_ids: wabas, waba_id_configurado: wabas.includes(env.WHATSAPP_WABA_ID) }
      : {};

    if (d.expires_at === 0) return ok(nome, 'válido, não expira (System User)', infoWaba);

    const diasRestantes = Math.floor((d.expires_at * 1000 - agoraMs) / 86400000);
    const detalhe = `válido, expira em ${diasRestantes} dia(s)`;
    return diasRestantes <= DIAS_AVISO_EXPIRACAO
      ? atencao(nome, `${detalhe} — renovar antes que toda chamada à Meta comece a dar 401`, { dias_restantes: diasRestantes })
      : ok(nome, detalhe, { dias_restantes: diasRestantes });
  } catch (err) {
    return erroParaFalha(nome, err);
  }
}

/**
 * Saúde do número: qualidade e tier de envio.
 *
 * A Meta rebaixa a qualidade quando cliente bloqueia ou denuncia; qualidade
 * RED antecede a suspensão do número. Isso não aparece em lugar nenhum do
 * produto hoje — o restaurante só descobriria quando parasse de entregar.
 */
async function sondarNumeroWhatsApp(env, nome, idVar) {
  const id = env[idVar];
  const token = env.WHATSAPP_ACCESS_TOKEN;
  if (!id) return naoConfigurado(nome, idVar);
  if (!token) return naoConfigurado(nome, 'WHATSAPP_ACCESS_TOKEN');

  try {
    // NÃO adicionar `whatsapp_business_account` aqui: não é campo do nó de
    // número na Graph v21 e a chamada inteira falha com (#100), derrubando a
    // sonda de qualidade junto (verificado em produção, 28/jul). O WABA ID vem
    // do debug_token, em sondarTokenMeta.
    const campos = 'display_phone_number,verified_name,quality_rating,code_verification_status,messaging_limit_tier';
    const { corpo } = await buscar(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(id)}?fields=${campos}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (corpo.error) return falha(nome, corpo.error.message);

    const qualidade = String(corpo.quality_rating || 'UNKNOWN').toUpperCase();
    const extra = {
      numero: corpo.display_phone_number,
      nome_verificado: corpo.verified_name,
      qualidade,
      tier: corpo.messaging_limit_tier,
    };
    const resumo = `${corpo.display_phone_number || '?'} — qualidade ${qualidade}`;

    if (qualidade === 'RED') {
      return falha(nome, `${resumo}: a Meta está prestes a limitar/suspender este número`, extra);
    }
    if (qualidade === 'YELLOW') {
      return atencao(nome, `${resumo}: clientes bloquearam/denunciaram — a próxima parada é RED`, extra);
    }
    return ok(nome, resumo, extra);
  } catch (err) {
    return erroParaFalha(nome, err);
  }
}

/** Sonda genérica de "a chave ainda vale?" — um GET barato e sem efeito. */
function sondaSimples({ nome, chaveVar, url, cabecalhos, sucesso }) {
  return async (env) => {
    const chave = env[chaveVar];
    if (!chave) return naoConfigurado(nome, chaveVar);
    try {
      const { status, corpo } = await buscar(url(env), { headers: cabecalhos(chave, env) });
      if (status === 401 || status === 403) return falha(nome, `chave recusada (HTTP ${status})`);
      if (status >= 500) return atencao(nome, `fornecedor instável (HTTP ${status})`);
      if (status >= 400) {
        const msg = (corpo && corpo.error && (corpo.error.message || corpo.error.type)) || `HTTP ${status}`;
        return falha(nome, msg);
      }
      return ok(nome, sucesso ? sucesso(corpo) : 'chave válida');
    } catch (err) {
      return erroParaFalha(nome, err);
    }
  };
}

/**
 * OpenRouter é o provedor PRIMÁRIO do agente (ai-client.js:213) — a Anthropic
 * só entra como reserva. Sondar só a Anthropic dava um diagnóstico invertido:
 * na primeira execução em produção ela deu 401 e o veredito ficou "vermelho"
 * quando o agente estava atendendo cliente normalmente pelo OpenRouter.
 */
const sondarOpenRouter = sondaSimples({
  nome: 'ia_primaria_openrouter',
  chaveVar: 'OPENROUTER_API_KEY',
  url: () => 'https://openrouter.ai/api/v1/key',
  cabecalhos: (k) => ({ Authorization: `Bearer ${k}` }),
  sucesso: (c) => {
    const d = (c && c.data) || {};
    const resta = d.limit_remaining;
    return Number.isFinite(resta)
      ? `chave válida — crédito restante ${resta}`
      : 'chave válida (o cérebro do agente responde)';
  },
});

/**
 * Reserva. Falha aqui NÃO derruba o atendimento — mas derruba o
 * upsell-generator, que chama o SDK da Anthropic direto, sem passar pelo
 * ai-client e portanto sem o fallback.
 */
async function sondarAnthropic(env) {
  const base = await sondaSimples({
    nome: 'ia_reserva_anthropic',
    chaveVar: 'ANTHROPIC_API_KEY',
    url: () => 'https://api.anthropic.com/v1/models?limit=1',
    cabecalhos: (k) => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }),
    sucesso: () => 'chave válida (reserva do agente + upsell)',
  })(env);

  if (base.nivel !== NIVEIS.FALHA) return base;
  return atencao(
    base.nome,
    `${base.detalhe} — o agente segue no OpenRouter, mas o upsell (SDK direto) está quebrado`,
  );
}

const sondarOpenAI = sondaSimples({
  nome: 'openai',
  chaveVar: 'OPENAI_API_KEY',
  url: () => 'https://api.openai.com/v1/models',
  cabecalhos: (k) => ({ Authorization: `Bearer ${k}` }),
  sucesso: () => 'chave válida (embeddings da memória do Manager AI)',
});

const sondarElevenLabs = sondaSimples({
  nome: 'elevenlabs',
  chaveVar: 'ELEVENLABS_API_KEY',
  url: () => 'https://api.elevenlabs.io/v1/user/subscription',
  cabecalhos: (k) => ({ 'xi-api-key': k }),
  sucesso: (c) => {
    const usados = c && c.character_count;
    const limite = c && c.character_limit;
    if (Number.isFinite(usados) && Number.isFinite(limite) && limite > 0) {
      return `${Math.round((usados / limite) * 100)}% da cota de voz usada`;
    }
    return 'chave válida';
  },
});

const sondarStripe = sondaSimples({
  nome: 'stripe',
  chaveVar: 'STRIPE_SECRET_KEY',
  url: () => 'https://api.stripe.com/v1/balance',
  cabecalhos: (k) => ({ Authorization: `Bearer ${k}` }),
  sucesso: () => 'chave válida (cobrança de assinatura operante)',
});

/**
 * Resend distingue chave de ENVIO de chave de acesso total. A nossa é de
 * envio — que é o correto, menor privilégio — então `GET /domains` responde
 * 401 com "restricted to only send emails". Isso é a chave FUNCIONANDO e sendo
 * bem restrita, não uma chave morta: o 401 vem da permissão, não da
 * autenticação. A primeira versão desta sonda gritou "resend quebrado" por
 * causa disso.
 */
async function sondarResend(env) {
  const nome = 'resend';
  const chave = env.RESEND_API_KEY;
  if (!chave) return naoConfigurado(nome, 'RESEND_API_KEY');
  try {
    const { status, corpo } = await buscar('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${chave}` },
    });
    const msg = String((corpo && (corpo.message || (corpo.error && corpo.error.message))) || '');

    if (status === 401 && /restricted to only send/i.test(msg)) {
      return ok(nome, 'chave válida, restrita a envio (menor privilégio — correto)');
    }
    if (status === 401 || status === 403) return falha(nome, `chave recusada (HTTP ${status})`);
    if (status >= 500) return atencao(nome, `fornecedor instável (HTTP ${status})`);
    if (status >= 400) return falha(nome, msg || `HTTP ${status}`);
    return ok(nome, 'chave válida (e-mails transacionais saem)');
  } catch (err) {
    return erroParaFalha(nome, err);
  }
}

/**
 * Banco: um SELECT trivial com LIMIT 1. Se isto falha, nada no produto
 * funciona — é a sonda que importa mais e a que menos costuma falhar.
 */
async function sondarSupabase(env, deps = {}) {
  const nome = 'supabase';
  const cliente = deps.supabaseAdmin;
  if (!env.SUPABASE_URL) return naoConfigurado(nome, 'SUPABASE_URL');
  if (!cliente) return falha(nome, 'cliente admin não inicializado (SERVICE_ROLE_KEY ausente?)');
  try {
    const { error } = await cliente.from('reservations').select('id').limit(1);
    if (error) return falha(nome, error.message);
    return ok(nome, 'banco responde');
  } catch (err) {
    return erroParaFalha(nome, err);
  }
}

/**
 * Supabase AUTH — separado do banco de propósito.
 *
 * `sondarSupabase` acima pergunta ao PostgREST se a tabela responde. O Auth
 * (GoTrue) é outro serviço, com outra disponibilidade: pode estar fora com o
 * banco de pé. E é dele que depende o portão de entrada —
 * `verifyJWT → checkSessionLiveness → supabase.auth.getUser()`.
 *
 * Quando o Auth cai, a postura fail-closed rejeita TODA sessão: ninguém entra
 * no painel, e a sonda do banco continua verde jurando que está tudo bem.
 * Este é o buraco que esta sonda fecha.
 */
async function sondarSupabaseAuth(env) {
  const nome = 'supabase_auth';
  const url = env.SUPABASE_URL;
  const chave = env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) return naoConfigurado(nome, 'SUPABASE_URL');
  if (!chave) return naoConfigurado(nome, 'SUPABASE_ANON_KEY');

  try {
    const { status, corpo } = await buscar(`${url.replace(/\/$/, '')}/auth/v1/health`, {
      headers: { apikey: chave },
    });
    if (status >= 400) {
      return falha(nome, `respondeu ${status} — o portão de login está fora: ninguém consegue entrar no painel`);
    }
    const versao = corpo?.version || corpo?.name || 'ok';
    return ok(nome, `login responde (${versao})`);
  } catch (err) {
    const base = erroParaFalha(nome, err);
    return falha(nome, `${base.detalhe} — com o Auth inacessível, TODA sessão é rejeitada e ninguém entra no painel`);
  }
}

/**
 * Veredito do conjunto.
 *
 * `nao_configurado` NÃO conta como falha de propósito (regra 2 do topo):
 * Twilio ausente é escolha de arquitetura, não defeito. Mas ele aparece na
 * lista, porque "não configurado" quando deveria estar é justamente o que a
 * pessoa quer enxergar.
 */
function resumir(sondas) {
  const conta = (n) => sondas.filter((s) => s.nivel === n).length;
  const falhas = conta(NIVEIS.FALHA);
  const atencoes = conta(NIVEIS.ATENCAO);

  const geral = falhas > 0 ? NIVEIS.FALHA : (atencoes > 0 ? NIVEIS.ATENCAO : NIVEIS.OK);
  const quebradas = sondas.filter((s) => s.nivel === NIVEIS.FALHA).map((s) => s.nome);

  return {
    geral,
    total: sondas.length,
    ok: conta(NIVEIS.OK),
    atencao: atencoes,
    falha: falhas,
    nao_configurado: conta(NIVEIS.NAO_CONFIGURADO),
    quebradas,
  };
}

/**
 * Roda tudo em paralelo. Uma sonda que estoura nunca derruba as outras —
 * um diagnóstico parcial vale muito mais que um 500.
 */
/** WABA que hospeda os templates de prospecção. */
function wabaProspeccao(env) {
  return env.PROSPECTING_WABA_ID || '25687973367501862';
}

/**
 * Templates da WABA como a Meta os vê. Cada sonda chama por conta própria em
 * vez de compartilhar um resultado: o módulo trata prazo por sonda como
 * invariante (regra 3), e uma consulta pendurada não pode derrubar a outra.
 */
async function buscarTemplatesMeta(env, token) {
  const { corpo } = await buscar(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(wabaProspeccao(env))}/message_templates`
      + `?fields=name,status,language&limit=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (corpo.error) return { erro: corpo.error.message, lista: [] };
  return { erro: null, lista: corpo.data || [] };
}

/**
 * A escada de follow-up (touches 2, 3 e 4) aguenta rodar?
 *
 * Por que é uma sonda separada da intro: a intro é manual e tem fallback de
 * env; a escada roda SOZINHA no cron prospect-flush a cada 15 min, e falha de
 * um jeito que não aparece.
 *
 * Dois modos de falha, e o primeiro é o pior (sequencer.js:266-275):
 *
 *  1. SEM template ativo pro touch → `pickTemplate` devolve null e o código
 *     zera o `next_touch_at` do lead. A sequência daquele lead para PARA SEMPRE
 *     — não é envio que falha e volta depois, é o lead saindo da escada em
 *     silêncio, com um logger.warn que ninguém lê. Só re-registrar um template
 *     e remarcar o lead traz de volta.
 *  2. Template ativo mas NÃO aprovado na Meta → `pickTemplate` só olha a flag
 *     `active` do registro, nunca a Meta. O envio sai e é recusado.
 *
 * Enquanto o dry-run esteve ligado nada disso acontecia (o dispatch retorna
 * antes, sequencer.js:248). Com ele desligado, os dois estão vivos.
 */
async function sondarTemplatesSequencia(env, deps = {}) {
  const nome = 'prospeccao_templates_sequencia';
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const dryRun = String(env.PROSPECTING_DRY_RUN || '') === 'true';

  if (!token) return naoConfigurado(nome, 'WHATSAPP_ACCESS_TOKEN');

  // Rótulos batem com as constantes do sequencer (TOUCH2/TOUCH3 + REENGAGE_TOUCH).
  const ESCADA = [
    { touch: 2, papel: 'bump (D+3)' },
    { touch: 3, papel: 'breakup (D+8)' },
    { touch: 4, papel: 'resgate' },
  ];

  let registro;
  try {
    const { listTemplates } = deps.store || require('./prospecting/prospect-store');
    registro = await Promise.all(ESCADA.map(async (e) => ({
      ...e,
      ativos: (await listTemplates(e.touch)).filter((t) => t.active),
    })));
  } catch (err) {
    return falha(nome, `não consegui ler o registro de templates: ${(err && err.message) || err}`);
  }

  const { erro, lista } = await buscarTemplatesMeta(env, token);
  if (erro) return falha(nome, `Meta recusou a consulta: ${erro}`);

  const aprovado = (n) => lista.some(
    (t) => t.name === n && String(t.status).toUpperCase() === 'APPROVED',
  );

  const detalhes = [];
  const semTemplate = [];
  const naoAprovados = [];

  for (const e of registro) {
    if (e.ativos.length === 0) {
      semTemplate.push(`${e.touch} (${e.papel})`);
      detalhes.push({ touch: e.touch, papel: e.papel, estado: 'sem template ativo' });
      continue;
    }
    // Qualquer ativo não aprovado é problema: pickTemplate sorteia entre TODOS
    // os ativos, então basta um ruim pra parte dos envios daquele touch falhar.
    const ruins = e.ativos.map((t) => t.meta_template_name).filter((n) => !aprovado(n));
    if (ruins.length > 0) naoAprovados.push(`${e.touch}:${ruins.join('/')}`);
    detalhes.push({
      touch: e.touch,
      papel: e.papel,
      ativos: e.ativos.map((t) => t.meta_template_name),
      nao_aprovados: ruins,
      estado: ruins.length === 0 ? 'ok' : 'ativo mas não aprovado',
    });
  }

  const extra = { dry_run: dryRun, escada: detalhes };
  const problema = semTemplate.length > 0 || naoAprovados.length > 0;
  if (!problema) {
    return ok(nome, `touches 2/3/4 com template ativo e aprovado${dryRun ? ' — dry-run ligado' : ''}`, extra);
  }

  const partes = [];
  if (semTemplate.length) {
    partes.push(`SEM template ativo no touch ${semTemplate.join(', ')}`
      + ' — a sequência desses leads é ENCERRADA em silêncio (next_touch_at zerado)');
  }
  if (naoAprovados.length) {
    partes.push(`ativo mas não aprovado na Meta em ${naoAprovados.join(', ')} — envio recusado`);
  }
  const detalhe = partes.join('; ');
  // Mesma regra da sonda de intro: sem dry-run é incidente em curso; com
  // dry-run o dispatch retorna antes de tocar no lead, então é só aviso.
  return dryRun ? atencao(nome, `${detalhe} — hoje inócuo (dry-run ligado)`, extra)
    : falha(nome, detalhe, extra);
}

/**
 * Qual template de intro sairia AGORA, e ele está aprovado na Meta?
 *
 * Por que existe: `PROSPECTING_INTRO_TEMPLATE` está marcada Sensitive na
 * Vercel, então o nome não é legível nem por `vercel env pull` nem pelo painel
 * — só de dentro da função. E o nome sozinho não basta: o que importa é qual
 * template o `pickTemplate` escolheria e se a Meta o aprovou.
 *
 * A escolha tem dois caminhos e é fácil confundi-los (sequencer.js:63-77):
 *   - registro tem variante ATIVA  → sorteia entre as ativas;
 *   - registro sem nenhuma ativa   → cai no env, rotulando como 'A'.
 * Desativar a última variante não desliga o envio: arma o fallback. Foi
 * exatamente essa confusão que motivou esta sonda (30/jul).
 *
 * Nome de template não é segredo (é público na Meta), então pode aparecer no
 * detalhe — diferente do token, que nunca sai daqui.
 */
async function sondarTemplateIntro(env, deps = {}) {
  const nome = 'prospeccao_template_intro';
  const token = env.WHATSAPP_ACCESS_TOKEN;
  const dryRun = String(env.PROSPECTING_DRY_RUN || '') === 'true';

  // Guarda ANTES de qualquer I/O. Sem token não dá pra responder a pergunta que
  // importa (o template está aprovado?), então ler o banco seria trabalho jogado
  // fora — e num ambiente sem configuração nenhuma viraria vermelho falso, que é
  // exatamente o que a regra 2 do módulo proíbe.
  if (!token) return naoConfigurado(nome, 'WHATSAPP_ACCESS_TOKEN');

  let ativas = [];
  try {
    const { listTemplates } = deps.store || require('./prospecting/prospect-store');
    ativas = (await listTemplates(1)).filter((t) => t.active);
  } catch (err) {
    return falha(nome, `não consegui ler o registro de templates: ${(err && err.message) || err}`);
  }

  const doEnv = env.PROSPECTING_INTRO_TEMPLATE || null;
  const escolhido = ativas.length > 0 ? ativas[0].meta_template_name : doEnv;
  const origem = ativas.length > 0 ? 'registro' : 'env (fallback)';

  const extra = {
    origem,
    variantes_ativas: ativas.map((t) => `${t.variant_label}:${t.meta_template_name}`),
    template_do_env: doEnv,
    escolhido,
    dry_run: dryRun,
  };

  if (!escolhido) {
    return atencao(nome, 'nenhuma variante ativa e PROSPECTING_INTRO_TEMPLATE vazia — intro não sai', extra);
  }

  // Status real na Meta do template que seria escolhido. Sem isto a sonda
  // responderia "vai usar o X" sem dizer que o X seria recusado no envio.
  try {
    const { erro, lista } = await buscarTemplatesMeta(env, token);
    if (erro) return falha(nome, `Meta recusou a consulta: ${erro}`, extra);

    const naMeta = lista.filter((t) => t.name === escolhido);
    extra.status_na_meta = naMeta.map((t) => `${t.language}:${t.status}`);

    const aprovado = naMeta.some((t) => String(t.status).toUpperCase() === 'APPROVED');
    if (!aprovado) {
      const detalhe = naMeta.length === 0
        ? `"${escolhido}" (via ${origem}) NÃO EXISTE na Meta — todo envio de intro falha`
        : `"${escolhido}" (via ${origem}) existe mas não está aprovado: ${extra.status_na_meta.join(', ')}`;
      // Atenção e não falha quando o dry-run está ligado: nada sai, então é
      // aviso de configuração, não incidente em curso.
      return dryRun ? atencao(nome, `${detalhe} — hoje inócuo (dry-run ligado)`, extra)
        : falha(nome, detalhe, extra);
    }
    return ok(nome, `"${escolhido}" aprovado na Meta (via ${origem})`
      + (dryRun ? ' — mas dry-run ligado, nada sai' : ''), extra);
  } catch (err) {
    return erroParaFalha(nome, err);
  }
}

async function sondarIntegracoes({ env = process.env, agoraMs = Date.now(), deps = {} } = {}) {
  const tarefas = [
    () => sondarTokenMeta(env, agoraMs),
    () => sondarNumeroWhatsApp(env, 'whatsapp_reservas', 'WHATSAPP_PHONE_NUMBER_ID'),
    () => sondarNumeroWhatsApp(env, 'whatsapp_prospeccao', 'PROSPECTING_PHONE_NUMBER_ID'),
    () => sondarTemplateIntro(env, deps),
    () => sondarTemplatesSequencia(env, deps),
    () => sondarOpenRouter(env),
    () => sondarAnthropic(env),
    () => sondarOpenAI(env),
    () => sondarElevenLabs(env),
    () => sondarStripe(env),
    () => sondarResend(env),
    () => sondarSupabase(env, deps),
    () => sondarSupabaseAuth(env),
  ];

  const sondas = await Promise.all(tarefas.map((t, i) => t().catch((err) => falha(
    `sonda_${i}`, `a própria sonda quebrou: ${(err && err.message) || err}`,
  ))));

  return { verificado_em: new Date(agoraMs).toISOString(), resumo: resumir(sondas), sondas };
}

module.exports = {
  NIVEIS,
  DIAS_AVISO_EXPIRACAO,
  redigir,
  resumir,
  sondarTokenMeta,
  sondarNumeroWhatsApp,
  sondarTemplateIntro,
  sondarTemplatesSequencia,
  sondarSupabase,
  sondarSupabaseAuth,
  sondarResend,
  sondarAnthropic,
  sondarOpenRouter,
  sondarIntegracoes,
};
