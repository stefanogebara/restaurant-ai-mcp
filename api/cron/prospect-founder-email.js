'use strict';

/**
 * Cron: prospect-founder-email — a proposta sai sozinha para o e-mail que o
 * porteiro entregou.
 *
 * POR QUE EXISTE. Quando alguém diz "fala com o compras@...", o endereço era
 * capturado em `prospect_email` e morria ali: nenhum leitor, nenhum envio, e o
 * lead fora do digest. O caso Bario Bar (07/08/2026) ficou dois dias esperando
 * uma proposta que a Olímpia prometeu e não tinha como mandar.
 *
 * O fundador optou por autonomia TOTAL de envio (08/08/2026). O que torna isso
 * defensável não é confiança no modelo, é o caminho ser determinístico e falhar
 * fechado em cada etapa:
 *
 *  - conteúdo de template fixo, revisado, sem LLM (`founder-email.js`);
 *  - claim-linter dentro do próprio build (estoura antes de sair);
 *  - idempotência por marcador no histórico, e se a checagem de duplicata
 *    falhar a fila volta VAZIA em vez de arriscar reenvio;
 *  - opt-out filtrado explicitamente (LGPD), como no digest;
 *  - teto por execução, pra um bug não varrer a base antes de alguém ver;
 *  - kill switch em `cron_config` e `?dry=1` pra inspecionar sem enviar.
 *
 * Schedule (vercel.json): a cada hora no horário comercial. Auth: CRON_SECRET.
 */

const { createSecureLogger } = require('../_lib/secure-logger');
const { bearerEquals } = require('../_lib/secure-compare');
const { isCronEnabled } = require('../_lib/cron-config');
const { logCronRun } = require('../_lib/cron-tracker');
const {
  selectFounderEmailQueue, selectFounderFollowupCandidates, selectFounderWhatsappQueue,
  loadHistory, isOptedOut, recordEvent, storeMessage,
} = require('../_lib/prospecting/prospect-store');
const { sendWhatsAppMessage, sendTemplateMessage } = require('../_lib/whatsapp-sender');
const wa = require('../_lib/prospecting/founder-whatsapp');
const { isDryRun } = require('../_lib/prospecting/prospect-dry-run');
const { isFounderNumber } = require('../_lib/prospecting/prospect-agent');
const {
  buildProposalEmail, eventoDeEnvio,
  buildFollowupEmail, followupDevido, eventoDeFollowup,
} = require('../_lib/prospecting/founder-email');
const { sendProspectProposalEmail } = require('../_lib/email');
const { deckUrlFor } = require('../_lib/prospecting/deck-token');

const logger = createSecureLogger('CronFounderEmail');

const FOUNDER_EMAIL = process.env.PROSPECTING_FOUNDER_EMAIL || 'stefanogebara@gmail.com';
// Telefone da assinatura. Cai no PROSPECTING_FOUNDER_WHATSAPP, que já existe e
// já tem o número do fundador como default (prospect-agent.js), em vez de exigir
// uma env nova em produção: uma fonte de verdade só, e nada quebra se ninguém
// configurar nada. Sem isso a assinatura saía sem WhatsApp e o prospect ficava
// só com e-mail para responder.
const FOUNDER_PHONE = process.env.PROSPECTING_FOUNDER_PHONE
  || process.env.PROSPECTING_FOUNDER_WHATSAPP
  || '+55 11 99900-2121';
const FOUNDER_NAME = process.env.PROSPECTING_FOUNDER_NAME || 'Stefano';
// Teto por execução. Envio autônomo sem teto é como um bug vira incidente de
// marca: 200 propostas erradas saem antes de alguém abrir o painel.
const MAX_POR_RODADA = Number(process.env.PROSPECTING_EMAIL_MAX_POR_RODADA) || 10;

/**
 * 2ª fase: cobra o silêncio de quem recebeu a proposta e não respondeu.
 *
 * O risco central aqui não é técnico, é social: a resposta da proposta vai pro
 * replyTo (caixa do fundador), que o sistema NÃO enxerga. Então "silêncio" no
 * banco pode significar "já respondeu e o sistema não viu". Três defesas:
 * espera longa (4 dias, dá tempo do fundador agir), qualquer inbound cancela, e
 * o texto do e-mail assume explicitamente que pode estar enganado.
 *
 * Um follow-up por lead, para sempre. Insistir duas vezes é perseguir.
 */
async function faseFollowup({ dry, nowMs, restante }) {
  if (restante <= 0) return { enviados: 0, resultados: [], motivo: 'teto_da_rodada_gasto' };

  const candidatos = await selectFounderFollowupCandidates({ limit: restante * 3 });
  const resultados = [];
  let enviados = 0;

  for (const lead of candidatos) {
    if (enviados >= restante) break;
    if (isFounderNumber(lead.whatsapp_phone)) continue;
    if (lead.whatsapp_phone && (await isOptedOut(lead.whatsapp_phone))) continue;

    const historico = await loadHistory(lead.id, 100);
    const { devido, motivo } = followupDevido({ historico, nowMs });
    if (!devido) {
      resultados.push({ lead: lead.id, nome: lead.name, enviado: false, motivo });
      continue;
    }

    let email;
    try {
      email = buildFollowupEmail(lead, {
        founderName: FOUNDER_NAME, founderEmail: FOUNDER_EMAIL, founderPhone: FOUNDER_PHONE,
        // Com a apresentação disponível ela vira o MOTIVO de escrever de novo.
        // Sem segredo configurado volta null e o follow-up cai no link do demo.
        deckUrl: deckUrlFor(lead.id),
      });
    } catch (err) {
      logger.error('follow-up bloqueado pelo linter', { lead: lead.id, error: err.message });
      await recordEvent(lead.id, `🚫 follow-up NÃO enviado: ${err.message.split('\n')[0]}`);
      resultados.push({ lead: lead.id, enviado: false, motivo: 'claim_blocked' });
      continue;
    }

    if (dry) {
      resultados.push({
        lead: lead.id, nome: lead.name, para: lead.prospect_email,
        enviado: false, dry: true, assunto: email.subject,
      });
      continue;
    }

    try {
      await sendProspectProposalEmail({
        to: lead.prospect_email,
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo: FOUNDER_EMAIL,
      });
      await recordEvent(lead.id, eventoDeFollowup(lead.prospect_email));
      enviados += 1;
      resultados.push({ lead: lead.id, nome: lead.name, enviado: true });
    } catch (err) {
      logger.error('envio do follow-up falhou', { lead: lead.id, error: err.message });
      await recordEvent(lead.id, `⚠️ falha ao enviar follow-up: ${err.message}`);
      resultados.push({ lead: lead.id, enviado: false, motivo: 'send_failed' });
    }
  }

  return { enviados, resultados };
}

/**
 * 3ª fase: o toque do fundador por WhatsApp, para quem NÃO deixou e-mail.
 *
 * A fila já exclui quem tem endereço (selectFounderWhatsappQueue), então nenhum
 * lead recebe proposta por e-mail E intro por WhatsApp — o contato duplicado que
 * quase pegou o Dinho's em 09/08.
 *
 * Dentro da janela de 24h vai texto livre; fora, só template aprovado. Nunca
 * texto livre fora da janela: é o que a Meta bloqueia e o que derruba a
 * qualidade do número, que é o ativo que mantém a Olímpia funcionando.
 */
async function faseWhatsapp({ dry, nowMs, restante }) {
  if (restante <= 0) return { enviados: 0, resultados: [], motivo: 'teto_da_rodada_gasto' };

  // O guard de dry-run do motor da Olímpia vale AQUI TAMBÉM. Chamar o sender
  // direto criaria uma terceira cópia da regra "isto manda de verdade?", que é
  // a doença que prospect-dry-run.js foi escrito para curar: quem desarmasse o
  // disparo da agente continuaria com o WhatsApp do fundador saindo. O e-mail
  // não passa por aqui de propósito — ele não usa o número da Olímpia e não
  // gasta a reputação que este guard protege.
  const dryEfetivo = dry || isDryRun();

  const candidatos = await selectFounderWhatsappQueue({ limit: restante * 3 });
  const resultados = [];
  let enviados = 0;

  for (const lead of candidatos) {
    if (enviados >= restante) break;
    if (isFounderNumber(lead.whatsapp_phone)) continue;
    if (await isOptedOut(lead.whatsapp_phone)) continue;

    const historico = await loadHistory(lead.id, 100);
    const intro = wa.introDevida({ lead, historico, nowMs });
    const follow = intro.devido ? { devido: false } : wa.followupDevido({ historico, nowMs });

    if (!intro.devido && !follow.devido) {
      resultados.push({ lead: lead.id, nome: lead.name, enviado: false, motivo: intro.motivo });
      continue;
    }

    const ehIntro = intro.devido;
    const janelaAberta = wa.janelaAbertaEm(historico, nowMs);
    const params = wa.parametrosTemplate(lead);
    if (!params) {
      resultados.push({ lead: lead.id, enviado: false, motivo: 'lead_sem_nome' });
      continue;
    }

    let corpoRegistrado;
    let via;
    try {
      if (janelaAberta && ehIntro) {
        // Texto livre só existe para a intro: um follow-up dentro da janela
        // seria uma segunda mensagem livre em conversa que o lead não retomou.
        corpoRegistrado = wa.textoLivreDoFundador(lead, { founderName: FOUNDER_NAME });
        via = 'livre';
      } else {
        corpoRegistrado = `[template:${ehIntro ? wa.TEMPLATE_INTRO : wa.TEMPLATE_FOLLOWUP}] ${params.join(' | ')}`;
        via = 'template';
      }
    } catch (err) {
      logger.error('mensagem do fundador bloqueada pelo linter', { lead: lead.id, error: err.message });
      await recordEvent(lead.id, `🚫 WhatsApp do fundador NÃO enviado: ${err.message.split('\n')[0]}`);
      resultados.push({ lead: lead.id, enviado: false, motivo: 'claim_blocked' });
      continue;
    }

    if (dryEfetivo) {
      resultados.push({
        lead: lead.id, nome: lead.name, enviado: false, dry: true, motivoDry: dry ? 'query' : 'PROSPECTING_DRY_RUN',
        tipo: ehIntro ? 'intro' : 'followup', via, previa: corpoRegistrado.slice(0, 160),
      });
      continue;
    }

    try {
      const r = via === 'livre'
        ? await sendWhatsAppMessage(lead.whatsapp_phone, corpoRegistrado)
        : await sendTemplateMessage(
          lead.whatsapp_phone,
          ehIntro ? wa.TEMPLATE_INTRO : wa.TEMPLATE_FOLLOWUP,
          wa.TEMPLATE_LANG,
          params
        );
      // O sender devolve { success } em vez de estourar: tratar como sucesso
      // sem checar seria o "envio silenciosamente falso" de sempre.
      if (!r || r.success === false) throw new Error((r && r.error) || 'envio recusado');

      // Grava como OUT no histórico, não só como evento: sem isso o monitor de
      // resposta não enxerga que houve um toque, e o follow-up não teria âncora.
      await storeMessage({
        leadId: lead.id, direcao: 'out', tipo: via === 'livre' ? 'texto' : 'template',
        corpo: corpoRegistrado, raw: { fundador: true, via },
      });
      await recordEvent(lead.id, ehIntro ? wa.eventoDeIntro(via) : wa.eventoDeFollowup(via));
      enviados += 1;
      resultados.push({ lead: lead.id, nome: lead.name, enviado: true, tipo: ehIntro ? 'intro' : 'followup', via });
    } catch (err) {
      logger.error('WhatsApp do fundador falhou', { lead: lead.id, error: err.message });
      await recordEvent(lead.id, `⚠️ falha no WhatsApp do fundador: ${err.message}`);
      resultados.push({ lead: lead.id, enviado: false, motivo: 'send_failed' });
    }
  }

  return { enviados, resultados };
}

module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ success: false, error: 'Cron not configured' });
  if (!bearerEquals(req.headers.authorization, secret)) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  // Dry-run: monta tudo e devolve o preview SEM enviar e SEM marcar o lead.
  // É como este cron sobe pela primeira vez.
  const dry = req.query && (req.query.dry === '1' || req.query.dry === 'true');

  // O kill switch é checado DEPOIS do dry-run, de propósito. O cron sobe
  // desarmado e o dry-run é justamente o que se inspeciona antes de armar; se o
  // interruptor barrasse a prévia, o caminho de rollout que ele existe para
  // proteger seria impossível de percorrer. Dry-run não envia nada e não grava
  // nada, então não há o que o interruptor precise conter.
  if (!dry && !(await isCronEnabled('prospect-founder-email'))) {
    return res.status(200).json({ success: true, skipped: 'disabled_by_ops' });
  }

  try {
    const candidatos = await selectFounderEmailQueue({ limit: MAX_POR_RODADA * 3 });

    // O lead de teste do próprio fundador nunca recebe proposta.
    const semFundador = candidatos.filter((l) => !isFounderNumber(l.whatsapp_phone));

    // Opt-out é verificado por telefone; quem não tem telefone não tem como ter
    // pedido saída por lá, então passa.
    const optChecks = await Promise.all(
      semFundador.map((l) => (l.whatsapp_phone ? isOptedOut(l.whatsapp_phone) : Promise.resolve(false)))
    );
    const fila = semFundador.filter((_, i) => !optChecks[i]).slice(0, MAX_POR_RODADA);

    // Fila de propostas vazia NÃO encerra a rodada: o estado normal do dia a
    // dia é justamente "nenhuma proposta nova, mas follow-up vencendo". Um
    // return aqui fazia a 2ª fase praticamente nunca rodar.
    const resultados = [];
    for (const lead of fila) {
      let email;
      try {
        email = buildProposalEmail(lead, {
          founderName: FOUNDER_NAME,
          founderEmail: FOUNDER_EMAIL,
          founderPhone: FOUNDER_PHONE,
          // Sem segredo configurado deckUrlFor devolve null, e o e-mail sai sem
          // a linha da apresentação em vez de sair com um link quebrado.
          deckUrl: deckUrlFor(lead.id),
        });
      } catch (err) {
        // CLAIM_BLOCKED chega aqui. Não envia, escala para o fundador olhar.
        logger.error('proposta bloqueada pelo linter', { lead: lead.id, error: err.message });
        await recordEvent(lead.id, `🚫 proposta NÃO enviada: ${err.message.split('\n')[0]}`);
        resultados.push({ lead: lead.id, enviado: false, motivo: 'claim_blocked' });
        continue;
      }

      if (dry) {
        resultados.push({
          lead: lead.id, nome: lead.name, para: lead.prospect_email,
          enviado: false, dry: true, assunto: email.subject, previa: email.text.slice(0, 240),
        });
        continue;
      }

      try {
        await sendProspectProposalEmail({
          to: lead.prospect_email,
          subject: email.subject,
          html: email.html,
          text: email.text,
          replyTo: FOUNDER_EMAIL,
        });
        // Marca DEPOIS do envio confirmado. Marcar antes perderia o lead em
        // silêncio se o Resend recusasse.
        await recordEvent(lead.id, eventoDeEnvio(lead.prospect_email));
        resultados.push({ lead: lead.id, nome: lead.name, enviado: true });
      } catch (err) {
        logger.error('envio da proposta falhou', { lead: lead.id, error: err.message });
        await recordEvent(lead.id, `⚠️ falha ao enviar proposta por e-mail: ${err.message}`);
        resultados.push({ lead: lead.id, enviado: false, motivo: 'send_failed' });
      }
    }

    const enviados = resultados.filter((r) => r.enviado).length;

    // --- 2ª fase: follow-up de quem recebeu proposta e não respondeu --------
    // Mesma rodada, mesmo teto e mesmo kill switch de propósito: é a mesma
    // preocupação, e um cron a mais só aumentaria invocação na Vercel.
    //
    // Isolada em try/catch próprio: quando a 1ª fase chega aqui ela JÁ mandou
    // e-mail de verdade, e deixar a 2ª fase derrubar a resposta apagaria o
    // relatório desses envios e o logCronRun junto. Follow-up é o trabalho
    // menos urgente da rodada; ele degrada para zero, não leva o resto embora.
    let followups = { enviados: 0, resultados: [] };
    try {
      followups = await faseFollowup({ dry, nowMs: Date.now(), restante: MAX_POR_RODADA - enviados });
    } catch (err) {
      logger.error('fase de follow-up falhou (propostas desta rodada seguem válidas)', { error: err.message });
      followups = { enviados: 0, resultados: [], erro: err.message };
    }

    // --- 3ª fase: WhatsApp, para quem não deixou e-mail -------------------
    // Isolada pelo mesmo motivo da 2ª: quando ela roda, as fases anteriores já
    // mandaram coisa de verdade, e uma falha aqui não pode apagar o relatório.
    let whatsapp = { enviados: 0, resultados: [] };
    try {
      whatsapp = await faseWhatsapp({
        dry, nowMs: Date.now(), restante: MAX_POR_RODADA - enviados - followups.enviados,
      });
    } catch (err) {
      logger.error('fase de WhatsApp falhou (envios anteriores desta rodada seguem válidos)', { error: err.message });
      whatsapp = { enviados: 0, resultados: [], erro: err.message };
    }

    await logCronRun('prospect-founder-email', {
      candidatos: candidatos.length,
      enviados,
      followups: followups.enviados,
      whatsapp: whatsapp.enviados,
      dry: dry || undefined,
    });
    logger.info(
      `founder outreach: ${enviados} propostas, ${followups.enviados} follow-ups, `
      + `${whatsapp.enviados} WhatsApp${dry ? ' (dry-run)' : ''}`
    );
    return res.status(200).json({
      success: true, dry: !!dry, candidatos: candidatos.length, enviados, resultados, followups, whatsapp,
    });
  } catch (err) {
    logger.error('founder email fatal:', err.message);
    await logCronRun('prospect-founder-email', { enviados: 0, error: err.message });
    return res.status(500).json({ success: false, error: 'Founder email failed' });
  }
};
