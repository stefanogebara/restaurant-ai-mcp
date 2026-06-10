/**
 * Audio Converter for Twilio <-> OpenAI Realtime API
 *
 * Converts between:
 *   Twilio:  mu-law 8kHz 8-bit mono (base64)
 *   OpenAI:  PCM 16-bit signed LE 24kHz mono (base64)
 *
 * Pure JavaScript - no native dependencies.
 */

const { createSecureLogger } = require('../_lib/secure-logger');

const logger = createSecureLogger('audio-converter');

// ---------- Mu-law lookup tables (pre-computed for speed) ----------

/**
 * Pre-computed mu-law decode table.
 * Maps each 256 possible mu-law byte values to 16-bit PCM samples.
 * Built once at module load for O(1) decoding.
 */
const MULAW_DECODE_TABLE = new Int16Array(256);

/**
 * Build the mu-law decode table using ITU-T G.711 algorithm.
 * Steps per byte:
 *   1. Flip all bits
 *   2. Extract sign (bit 7), exponent (bits 6-4), mantissa (bits 3-0)
 *   3. sample = (2 * mantissa + 33) * 2^exponent - 33
 *   4. Apply sign
 */
(function buildDecodeTable() {
  for (let i = 0; i < 256; i++) {
    const flipped = ~i & 0xFF;
    const sign = flipped & 0x80;
    const exponent = (flipped >> 4) & 0x07;
    const mantissa = flipped & 0x0F;

    let magnitude = ((2 * mantissa + 33) << exponent) - 33;

    MULAW_DECODE_TABLE[i] = sign ? -magnitude : magnitude;
  }
})();

/**
 * Decode a mu-law encoded byte to a 16-bit PCM sample.
 * Uses pre-computed lookup table for O(1) performance.
 *
 * @param {number} mulawByte - Mu-law encoded byte (0-255)
 * @returns {number} 16-bit PCM sample (-32768 to 32767)
 */
function mulawDecode(mulawByte) {
  return MULAW_DECODE_TABLE[mulawByte & 0xFF];
}

// Mu-law encoding constants
const MULAW_BIAS = 0x21; // 33
const MULAW_CLIP = 8159; // Max value before clipping

/**
 * Pre-computed mu-law encode table.
 * Maps each 16384 possible 14-bit absolute values (after bias/clamp)
 * to their mu-law byte (without sign). Built once at module load.
 *
 * For real-time encoding, we use a direct computation approach that
 * scans for the exponent by shifting. This avoids the large lookup table
 * while remaining fast enough for voice (sub-ms per 20ms chunk).
 */

/**
 * Encode a 16-bit PCM sample to a mu-law byte.
 * Uses the standard ITU-T G.711 mu-law compression algorithm.
 *
 * Algorithm:
 *   1. Determine sign, take absolute value
 *   2. Add bias (33), clamp to 8159
 *   3. Find exponent by scanning from bit 6 upward
 *   4. Extract 4-bit mantissa from below the exponent position
 *   5. Combine sign + exponent + mantissa, flip all bits
 *
 * @param {number} pcmSample - 16-bit signed PCM sample (-32768 to 32767)
 * @returns {number} Mu-law encoded byte (0-255)
 */
function mulawEncode(pcmSample) {
  // Determine sign and get absolute value
  let sign = 0;
  let sample = pcmSample;

  if (sample < 0) {
    sign = 0x80;
    sample = -sample;
  }

  // Add bias and clamp
  sample += MULAW_BIAS;
  if (sample > MULAW_CLIP) {
    sample = MULAW_CLIP;
  }

  // Find exponent: scan for highest set bit starting from bit 5
  // The biased sample is at least 33 (bit 5 set), minimum segment is 0
  // Segments: 0=[33,63], 1=[64,127], ..., 7=[4096,8159]
  let exponent = 0;
  let shifted = sample >> 5;
  while (shifted > 1) {
    shifted >>= 1;
    exponent++;
  }
  if (exponent > 7) {
    exponent = 7;
  }

  // Extract 4-bit mantissa from just below the exponent's leading bit
  const mantissa = (sample >> (exponent + 1)) & 0x0F;

  // Combine and flip all bits
  return (~(sign | (exponent << 4) | mantissa)) & 0xFF;
}

/**
 * Resample PCM audio buffer from one sample rate to another.
 * Uses linear interpolation for low-latency voice processing.
 *
 * @param {Buffer} inputBuffer - PCM 16-bit LE audio data
 * @param {number} fromRate - Source sample rate (e.g., 8000)
 * @param {number} toRate - Target sample rate (e.g., 24000)
 * @returns {Buffer} Resampled PCM 16-bit LE audio data
 */
function resample(inputBuffer, fromRate, toRate) {
  if (fromRate === toRate) {
    return inputBuffer;
  }

  const bytesPerSample = 2; // 16-bit = 2 bytes
  const inputSamples = Math.floor(inputBuffer.length / bytesPerSample);

  if (inputSamples === 0) {
    return Buffer.alloc(0);
  }

  const ratio = fromRate / toRate;
  const outputSamples = Math.ceil(inputSamples / ratio);
  const outputBuffer = Buffer.alloc(outputSamples * bytesPerSample);

  for (let i = 0; i < outputSamples; i++) {
    const srcPos = i * ratio;
    const srcIndex = Math.floor(srcPos);
    const fraction = srcPos - srcIndex;

    // Read current sample
    const sample0 = inputBuffer.readInt16LE(srcIndex * bytesPerSample);

    if (fraction === 0 || srcIndex + 1 >= inputSamples) {
      // Exact position or last sample - no interpolation needed
      outputBuffer.writeInt16LE(sample0, i * bytesPerSample);
    } else {
      // Linear interpolation between two adjacent samples
      const sample1 = inputBuffer.readInt16LE((srcIndex + 1) * bytesPerSample);
      const interpolated = Math.round(sample0 + fraction * (sample1 - sample0));

      // Clamp to 16-bit range
      const clamped = Math.max(-32768, Math.min(32767, interpolated));
      outputBuffer.writeInt16LE(clamped, i * bytesPerSample);
    }
  }

  return outputBuffer;
}

/**
 * Convert Twilio mu-law 8kHz base64 audio to PCM 24kHz base64 for OpenAI.
 *
 * Pipeline: base64 decode -> mu-law to PCM 16-bit -> resample 8kHz to 24kHz -> base64 encode
 *
 * @param {string} twilioPayload - Base64 encoded mu-law audio from Twilio
 * @returns {string} Base64 encoded PCM 16-bit 24kHz audio for OpenAI
 */
function twilioToOpenAI(twilioPayload) {
  if (!twilioPayload) {
    return '';
  }

  // Step 1: Decode base64 to raw mu-law bytes
  const mulawBytes = Buffer.from(twilioPayload, 'base64');

  if (mulawBytes.length === 0) {
    return '';
  }

  // Step 2: Decode mu-law to PCM 16-bit
  const pcmBuffer = Buffer.alloc(mulawBytes.length * 2); // 1 byte mulaw -> 2 bytes PCM

  for (let i = 0; i < mulawBytes.length; i++) {
    pcmBuffer.writeInt16LE(MULAW_DECODE_TABLE[mulawBytes[i]], i * 2);
  }

  // Step 3: Resample from 8kHz to 24kHz
  const resampled = resample(pcmBuffer, 8000, 24000);

  // Step 4: Encode to base64
  return resampled.toString('base64');
}

/**
 * Convert OpenAI PCM 24kHz base64 audio to Twilio mu-law 8kHz base64.
 *
 * Pipeline: base64 decode -> resample 24kHz to 8kHz -> PCM to mu-law -> base64 encode
 *
 * @param {string} openaiPayload - Base64 encoded PCM 16-bit 24kHz audio from OpenAI
 * @returns {string} Base64 encoded mu-law 8kHz audio for Twilio
 */
function openAIToTwilio(openaiPayload) {
  if (!openaiPayload) {
    return '';
  }

  // Step 1: Decode base64 to raw PCM bytes
  const pcmBytes = Buffer.from(openaiPayload, 'base64');

  if (pcmBytes.length === 0) {
    return '';
  }

  // Handle odd-length buffers by truncating to even boundary
  const usableLength = pcmBytes.length & ~1; // Round down to even
  const pcmBuffer = usableLength < pcmBytes.length
    ? pcmBytes.subarray(0, usableLength)
    : pcmBytes;

  if (pcmBuffer.length === 0) {
    return '';
  }

  // Step 2: Resample from 24kHz to 8kHz
  const resampled = resample(pcmBuffer, 24000, 8000);

  // Step 3: Encode PCM to mu-law
  const sampleCount = Math.floor(resampled.length / 2);
  const mulawBuffer = Buffer.alloc(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    const pcmSample = resampled.readInt16LE(i * 2);
    mulawBuffer[i] = mulawEncode(pcmSample);
  }

  // Step 4: Encode to base64
  return mulawBuffer.toString('base64');
}

module.exports = {
  mulawDecode,
  mulawEncode,
  resample,
  twilioToOpenAI,
  openAIToTwilio,
};
