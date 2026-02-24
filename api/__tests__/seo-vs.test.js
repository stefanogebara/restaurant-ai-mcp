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

  it('returns valid HTML for opentable', async () => {
    const res = makeRes();
    await handler({ method: 'GET', query: { competitor: 'opentable' } }, res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
    const html = res.send.mock.calls[0][0];
    expect(html).toMatch(/^<!DOCTYPE html>/);
    expect(html).toContain('OpenTable');
    expect(html).toContain('Seatable');
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
