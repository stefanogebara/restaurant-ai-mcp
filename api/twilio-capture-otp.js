/**
 * Temporary endpoint to capture Meta WhatsApp verification OTP via voice call.
 * Returns TwiML that records the call and plays it back.
 * DELETE THIS FILE after verification is complete.
 */

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/xml');

  const recordingStatus = req.body?.RecordingStatus || req.query?.RecordingStatus;
  const recordingUrl = req.body?.RecordingUrl || req.query?.RecordingUrl;

  // If this is a recording status callback, log the URL
  if (recordingStatus === 'completed' && recordingUrl) {
    console.log('=== OTP RECORDING COMPLETE ===');
    console.log('Recording URL:', recordingUrl);
    console.log('==============================');
    return res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }

  // Main call: answer, pause briefly, then record
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Amy">Recording verification call now.</Say>
  <Record maxLength="30" playBeep="false" recordingStatusCallback="https://seatable.one/api/twilio-capture-otp" />
  <Say voice="Polly.Amy">Recording complete. Thank you.</Say>
</Response>`;

  res.status(200).send(twiml);
};
