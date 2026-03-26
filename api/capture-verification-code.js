/**
 * Temporary endpoint to capture WhatsApp verification code via voice call.
 * Records the call so we can listen to the verification code.
 * Delete this file after verification is complete.
 */
const { createSecureLogger } = require('./_lib/secure-logger');
const logger = createSecureLogger('CaptureVerificationCode');

module.exports = async (req, res) => {
  logger.info('Verification call received:', {
    from: req.body?.From || req.query?.From,
    to: req.body?.To || req.query?.To,
  });

  // TwiML: answer and record the call (the verification bot will speak the code)
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="pt-BR">Gravando codigo de verificacao.</Say>
  <Record maxLength="30" transcribe="true" transcribeCallback="/api/capture-verification-code" />
  <Say language="pt-BR">Gravacao finalizada.</Say>
</Response>`;

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send(twiml);
};
