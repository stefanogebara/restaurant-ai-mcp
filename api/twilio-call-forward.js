/**
 * Temporary: forwards incoming calls to the owner phone for WhatsApp verification.
 * Safe to delete after verification is complete.
 */
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="pt-BR">Verificação do WhatsApp. O código será lido agora.</Say>
  <Dial callerId="+551150289356">+5511999002121</Dial>
</Response>`);
};
