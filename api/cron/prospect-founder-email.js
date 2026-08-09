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
  selectFounderEmailQueue, isOptedOut, recordEvent,
} = require('../_lib/prospecting/prospect-store');
const { isFounderNumber } = require('../_lib/prospecting/prospect-agent');
const { buildProposalEmail, eventoDeEnvio } = require('../_lib/prospecting/founder-email');
const { sendProspectProposalEmail } = require('../_lib/email');

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

    if (fila.length === 0) {
      await logCronRun('prospect-founder-email', { candidatos: candidatos.length, enviados: 0, empty: true });
      return res.status(200).json({ success: true, candidatos: candidatos.length, enviados: 0 });
    }

    const resultados = [];
    for (const lead of fila) {
      let email;
      try {
        email = buildProposalEmail(lead, {
          founderName: FOUNDER_NAME,
          founderEmail: FOUNDER_EMAIL,
          founderPhone: FOUNDER_PHONE,
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
    await logCronRun('prospect-founder-email', {
      candidatos: candidatos.length, enviados, dry: dry || undefined,
    });
    logger.info(`founder email: ${enviados}/${fila.length} enviados${dry ? ' (dry-run)' : ''}`);
    return res.status(200).json({
      success: true, dry: !!dry, candidatos: candidatos.length, enviados, resultados,
    });
  } catch (err) {
    logger.error('founder email fatal:', err.message);
    await logCronRun('prospect-founder-email', { enviados: 0, error: err.message });
    return res.status(500).json({ success: false, error: 'Founder email failed' });
  }
};
