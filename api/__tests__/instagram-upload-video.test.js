/**
 * Tests for the video magic-byte sniffer in upload-video.js.
 * sniffVideoType inspects bytes 4-7 (the 'ftyp' box header) and the
 * brand at bytes 8-11 to differentiate mp4 vs mov. Pinning these
 * stops a future refactor from accidentally accepting random binaries
 * that happen to start with 4 zero bytes.
 */

const { __test__ } = require('../instagram/upload-video');
const { sniffVideoType, ALLOWED_CONTENT_TYPES } = __test__;

// Build a minimal video header: 4 size bytes, then "ftyp", then a 4-char brand
function header(brand) {
  const buf = Buffer.alloc(16);
  buf.writeUInt32BE(16, 0);              // box size
  buf.write('ftyp', 4, 'ascii');
  buf.write(brand, 8, 'ascii');
  return buf;
}

describe('sniffVideoType', () => {
  test('isom brand → mp4', () => {
    expect(sniffVideoType(header('isom'))).toBe('mp4');
  });

  test('mp42 brand → mp4', () => {
    expect(sniffVideoType(header('mp42'))).toBe('mp4');
  });

  test('mp41 brand → mp4', () => {
    expect(sniffVideoType(header('mp41'))).toBe('mp4');
  });

  test('avc1 brand → mp4', () => {
    expect(sniffVideoType(header('avc1'))).toBe('mp4');
  });

  test('iso2 brand → mp4', () => {
    expect(sniffVideoType(header('iso2'))).toBe('mp4');
  });

  test('qt   brand → mov', () => {
    expect(sniffVideoType(header('qt  '))).toBe('mov');
  });

  test('unknown ftyp brand → defaults to mp4 (most common dialect)', () => {
    expect(sniffVideoType(header('xyz1'))).toBe('mp4');
  });

  test('missing ftyp header → null (rejected)', () => {
    const noFtyp = Buffer.alloc(16);
    expect(sniffVideoType(noFtyp)).toBeNull();
  });

  test('HTML disguised as video → null', () => {
    const html = Buffer.from('<!DOCTYPE html><script>alert(1)</script>');
    expect(sniffVideoType(html)).toBeNull();
  });

  test('PNG header bytes do NOT match video sniffer (cross-format guard)', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffVideoType(png)).toBeNull();
  });

  test('buffer shorter than 16 bytes → null', () => {
    expect(sniffVideoType(Buffer.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]))).toBeNull();
  });

  test('null / undefined → null', () => {
    expect(sniffVideoType(null)).toBeNull();
    expect(sniffVideoType(undefined)).toBeNull();
  });
});

describe('ALLOWED_CONTENT_TYPES', () => {
  test('accepts video/mp4 and video/quicktime', () => {
    expect(ALLOWED_CONTENT_TYPES['video/mp4']).toBe('mp4');
    expect(ALLOWED_CONTENT_TYPES['video/quicktime']).toBe('mov');
  });

  test('does NOT include legacy formats like video/x-msvideo', () => {
    expect(ALLOWED_CONTENT_TYPES['video/x-msvideo']).toBeUndefined();
    expect(ALLOWED_CONTENT_TYPES['video/webm']).toBeUndefined();
  });
});
