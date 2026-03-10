/**
 * Temporary: records incoming WhatsApp verification calls so code can be retrieved via Twilio API.
 * Safe to delete after verification is complete.
 */
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="pt-BR">Verificação do WhatsApp. Gravando código agora.</Say>
  <Record maxLength="60" transcribe="true" />
</Response>`);
};
