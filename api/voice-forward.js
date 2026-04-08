'use strict';

/**
 * Voice forwarding + recording endpoint.
 * Records the incoming call (captures WhatsApp verification codes)
 * and emails the recording to the configured address.
 */
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="pt-BR">Gravando mensagem.</Say>
  <Record maxLength="30" transcribe="true" />
  <Say language="pt-BR">Obrigado.</Say>
</Response>`);
};
