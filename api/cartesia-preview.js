/**
 * Cartesia TTS Preview API - Vercel Serverless Function
 * POST /api/cartesia-preview
 * Generates audio preview for a specific Cartesia voice
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
    if (!process.env.CARTESIA_API_KEY) {
      console.error('[Cartesia] CARTESIA_API_KEY not configured');
      return res.status(500).json({
        success: false,
        error: 'Cartesia API key not configured'
      });
    }

    const previewText = text || "Welcome to our restaurant! I'd be happy to help you make a reservation.";

    console.log(`[Cartesia] Generating preview for voice ${voice_id}`);

    // Generate TTS preview using Cartesia
    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CARTESIA_API_KEY}`,
        'Cartesia-Version': '2024-06-10',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model_id: 'sonic-english',
        transcript: previewText,
        voice: {
          mode: 'id',
          id: voice_id
        },
        output_format: {
          container: 'mp3',
          encoding: 'mp3',
          sample_rate: 22050
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Cartesia] TTS API error:', response.status, errorText);
      return res.status(response.status).json({
        success: false,
        error: `Cartesia TTS error: ${response.status} ${errorText}`
      });
    }

    // Return audio as base64
    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    console.log(`[Cartesia] Generated ${audioBase64.length} bytes of audio (base64)`);

    return res.status(200).json({
      success: true,
      data: {
        audio: `data:audio/mp3;base64,${audioBase64}`,
        voice_id: voice_id,
        text: previewText
      }
    });

  } catch (error) {
    console.error('[Cartesia] Error generating preview:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate preview'
    });
  }
};
