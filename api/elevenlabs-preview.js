/**
 * ElevenLabs TTS Preview API - Vercel Serverless Function
 * POST /api/elevenlabs-preview
 * Generates audio preview for a specific ElevenLabs voice
 */

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: 'Method not allowed. Use POST.'
    });
  }

  try {
    const { voice_id, text } = req.body;

    // Validate input
    if (!voice_id) {
      return res.status(400).json({
        success: false,
        error: 'voice_id is required'
      });
    }

    // Validate API key
    if (!process.env.ELEVENLABS_API_KEY) {
      console.error('[ElevenLabs] ELEVENLABS_API_KEY not configured');
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs API key not configured'
      });
    }

    const previewText = text || "Welcome to our restaurant! I'd be happy to help you make a reservation.";

    console.log(`[ElevenLabs] Generating preview for voice ${voice_id}`);

    // Generate TTS preview using ElevenLabs
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text: previewText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ElevenLabs] TTS API error:', response.status, errorText);
      return res.status(response.status).json({
        success: false,
        error: `ElevenLabs TTS error: ${response.status} ${errorText}`
      });
    }

    // Return audio as base64
    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    console.log(`[ElevenLabs] Generated ${audioBase64.length} bytes of audio (base64)`);

    return res.status(200).json({
      success: true,
      data: {
        audio: `data:audio/mpeg;base64,${audioBase64}`,
        voice_id: voice_id,
        text: previewText
      }
    });

  } catch (error) {
    console.error('[ElevenLabs] Error generating preview:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate preview'
    });
  }
};
