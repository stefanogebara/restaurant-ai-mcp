/**
 * Tests for the image-format sniffer in api/instagram/upload-image.js.
 * sniffImageType inspects the magic bytes so a client can't bypass our
 * content_type check by uploading e.g. an HTML file with content_type:
 * 'image/png'.
 */

const { __test__ } = require('../instagram/upload-image');
const { sniffImageType, ALLOWED_CONTENT_TYPES } = __test__;

const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG_MAGIC  = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const WEBP_MAGIC = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x10, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);

describe('sniffImageType', () => {
  test('JPEG magic bytes → jpg', () => {
    expect(sniffImageType(JPEG_MAGIC)).toBe('jpg');
  });

  test('PNG magic bytes → png', () => {
    expect(sniffImageType(PNG_MAGIC)).toBe('png');
  });

  test('WebP magic bytes (RIFF...WEBP) → webp', () => {
    expect(sniffImageType(WEBP_MAGIC)).toBe('webp');
  });

  test('JPEG inside a longer buffer still matches at offset 0', () => {
    const padded = Buffer.concat([JPEG_MAGIC, Buffer.from('rest of file data here')]);
    expect(sniffImageType(padded)).toBe('jpg');
  });

  test('HTML disguised as image — rejected', () => {
    const html = Buffer.from('<!DOCTYPE html><script>alert(1)</script>');
    expect(sniffImageType(html)).toBeNull();
  });

  test('JS disguised as image — rejected', () => {
    const js = Buffer.from('const x = require("fs"); x.unlinkSync("/etc/passwd");');
    expect(sniffImageType(js)).toBeNull();
  });

  test('empty buffer returns null', () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });

  test('buffer shorter than 12 bytes returns null', () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });

  test('null/undefined returns null', () => {
    expect(sniffImageType(null)).toBeNull();
    expect(sniffImageType(undefined)).toBeNull();
  });

  test('RIFF without WEBP at offset 8 is rejected (could be WAV/AVI)', () => {
    const riffWav = Buffer.concat([
      Buffer.from([0x52, 0x49, 0x46, 0x46]),                  // RIFF
      Buffer.from([0x00, 0x00, 0x00, 0x00]),                  // size
      Buffer.from([0x57, 0x41, 0x56, 0x45]),                  // WAVE (not WEBP)
    ]);
    expect(sniffImageType(riffWav)).toBeNull();
  });
});

describe('ALLOWED_CONTENT_TYPES contract', () => {
  test('every sniffer output extension has a matching content_type entry', () => {
    const sniffOutputs = ['jpg', 'png', 'webp'];
    const exts = new Set(Object.values(ALLOWED_CONTENT_TYPES));
    for (const ext of sniffOutputs) {
      expect(exts.has(ext)).toBe(true);
    }
  });

  test('content_type keys cover the formats sniffImageType detects', () => {
    expect(ALLOWED_CONTENT_TYPES['image/jpeg']).toBe('jpg');
    expect(ALLOWED_CONTENT_TYPES['image/png']).toBe('png');
    expect(ALLOWED_CONTENT_TYPES['image/webp']).toBe('webp');
  });
});
