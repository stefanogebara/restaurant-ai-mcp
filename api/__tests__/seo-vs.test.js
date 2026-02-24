const handler = require('../seo/vs');

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
}

describe('GET /api/seo/vs', () => {
  it('returns 405 for non-GET', async () => {
    const res = makeRes();
    await handler({ method: 'POST', query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('returns 400 when competitor param missing', async () => {
    const res = makeRes();
    await handler({ method: 'GET', query: {} }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 for unknown competitor', async () => {
    const res = makeRes();
    await handler({ method: 'GET', query: { competitor: 'unknown-crm' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns valid HTML for opentable with correct headers', async () => {
    const res = makeRes();
    await handler({ method: 'GET', query: { competitor: 'opentable' } }, res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=86400, s-maxage=86400');
    const html = res.send.mock.calls[0][0];
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('OpenTable');
    expect(html).toContain('Seatable');
  });

  it('renders feature comparison table with check/cross classes and string values', async () => {
    const res = makeRes();
    await handler({ method: 'GET', query: { competitor: 'opentable' } }, res);
    const html = res.send.mock.calls[0][0];
    expect(html).toContain('class="check"');
    expect(html).toContain('class="cross"');
    expect(html).toContain('5 minutes');
    expect(html).toContain('<table>');
  });

  it('returns valid HTML for resy', async () => {
    const res = makeRes();
    await handler({ method: 'GET', query: { competitor: 'resy' } }, res);
    const html = res.send.mock.calls[0][0];
    expect(html).toContain('Resy');
  });

  it('returns valid HTML for sevenrooms', async () => {
    const res = makeRes();
    await handler({ method: 'GET', query: { competitor: 'sevenrooms' } }, res);
    const html = res.send.mock.calls[0][0];
    expect(html).toContain('SevenRooms');
  });

  it('is case-insensitive for competitor param', async () => {
    const res = makeRes();
    await handler({ method: 'GET', query: { competitor: 'OpenTable' } }, res);
    expect(res.send).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(404);
  });
});
