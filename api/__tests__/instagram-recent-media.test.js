/**
 * Tests for resolveDisplayUrl in api/instagram/recent-media.js — pins the
 * per-media-type URL resolution so a future change (e.g. Graph API drops
 * media_url from the parent of CAROUSEL_ALBUM, again) gets caught.
 *
 * The live smoke against @seatable.ai surfaced this exact gap: when
 * fetchRecentMedia didn't request media_url, every media item resolved
 * to null, the .filter dropped them all, and the picker returned [].
 */

const { __test__ } = require('../instagram/recent-media');
const { resolveDisplayUrl } = __test__;

describe('resolveDisplayUrl', () => {
  test('IMAGE → media_url verbatim', () => {
    expect(resolveDisplayUrl({
      media_type: 'IMAGE',
      media_url: 'https://scontent.cdninstagram.com/img.jpg',
    })).toBe('https://scontent.cdninstagram.com/img.jpg');
  });

  test('IMAGE without media_url returns null', () => {
    expect(resolveDisplayUrl({ media_type: 'IMAGE' })).toBeNull();
  });

  test('VIDEO → thumbnail_url, NOT media_url (which is the .mp4)', () => {
    // The IG single-image publish path cannot ingest a video URL, so we
    // prefer the still frame even though media_url is set.
    expect(resolveDisplayUrl({
      media_type: 'VIDEO',
      media_url: 'https://scontent.cdninstagram.com/video.mp4',
      thumbnail_url: 'https://scontent.cdninstagram.com/thumb.jpg',
    })).toBe('https://scontent.cdninstagram.com/thumb.jpg');
  });

  test('VIDEO without thumbnail_url returns null (cannot use raw video)', () => {
    expect(resolveDisplayUrl({
      media_type: 'VIDEO',
      media_url: 'https://scontent.cdninstagram.com/video.mp4',
    })).toBeNull();
  });

  test('CAROUSEL_ALBUM → first child.media_url (Graph format: children.data[])', () => {
    expect(resolveDisplayUrl({
      media_type: 'CAROUSEL_ALBUM',
      // media_url unset on parent — that's the bug we're guarding against
      children: {
        data: [
          { id: 'c1', media_type: 'IMAGE', media_url: 'https://cdn.example.com/1.jpg' },
          { id: 'c2', media_type: 'IMAGE', media_url: 'https://cdn.example.com/2.jpg' },
        ],
      },
    })).toBe('https://cdn.example.com/1.jpg');
  });

  test('CAROUSEL_ALBUM → child shape can also be a flat array', () => {
    // Some Graph clients flatten the wrapper. Accept both.
    expect(resolveDisplayUrl({
      media_type: 'CAROUSEL_ALBUM',
      children: [
        { id: 'c1', media_type: 'IMAGE', media_url: 'https://cdn.example.com/A.jpg' },
      ],
    })).toBe('https://cdn.example.com/A.jpg');
  });

  test('CAROUSEL_ALBUM with VIDEO first child → child.thumbnail_url', () => {
    expect(resolveDisplayUrl({
      media_type: 'CAROUSEL_ALBUM',
      children: {
        data: [
          {
            id: 'c1',
            media_type: 'VIDEO',
            media_url: 'https://scontent.cdninstagram.com/video.mp4',
            thumbnail_url: 'https://scontent.cdninstagram.com/thumb.jpg',
          },
          { id: 'c2', media_type: 'IMAGE', media_url: 'https://cdn.example.com/2.jpg' },
        ],
      },
    })).toBe('https://scontent.cdninstagram.com/thumb.jpg');
  });

  test('CAROUSEL_ALBUM with no children returns null', () => {
    expect(resolveDisplayUrl({
      media_type: 'CAROUSEL_ALBUM',
      children: { data: [] },
    })).toBeNull();
    expect(resolveDisplayUrl({ media_type: 'CAROUSEL_ALBUM' })).toBeNull();
  });

  test('CAROUSEL_ALBUM with VIDEO child but no thumbnail returns null', () => {
    expect(resolveDisplayUrl({
      media_type: 'CAROUSEL_ALBUM',
      children: { data: [{ id: 'c1', media_type: 'VIDEO' }] },
    })).toBeNull();
  });

  test('unknown media_type falls back to media_url then thumbnail_url', () => {
    expect(resolveDisplayUrl({
      media_type: 'REELS',
      media_url: 'https://cdn.example.com/r.mp4',
      thumbnail_url: 'https://cdn.example.com/r.jpg',
    })).toBe('https://cdn.example.com/r.mp4');
    expect(resolveDisplayUrl({
      media_type: 'REELS',
      thumbnail_url: 'https://cdn.example.com/r.jpg',
    })).toBe('https://cdn.example.com/r.jpg');
  });

  test('null/undefined/non-object → null', () => {
    expect(resolveDisplayUrl(null)).toBeNull();
    expect(resolveDisplayUrl(undefined)).toBeNull();
    expect(resolveDisplayUrl(42)).toBeNull();
    expect(resolveDisplayUrl('string')).toBeNull();
  });
});
