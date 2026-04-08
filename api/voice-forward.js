'use strict';

/**
 * Simple voice forwarding endpoint.
 * Returns TwiML that dials the specified number.
 * Used temporarily for WhatsApp verification calls.
 */
module.exports = (req, res) => {
  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="+551150289356">+5511999002121</Dial>
</Response>`);
};
