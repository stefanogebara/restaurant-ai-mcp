const { renderPage, slugify, titleCase, escapeHtml } = require('../_lib/seo-html');

describe('seo-html', () => {
  describe('slugify', () => {
    it('lowercases and replaces spaces with hyphens', () => {
      expect(slugify('New York')).toBe('new-york');
    });
    it('strips diacritics', () => {
      expect(slugify('São Paulo')).toBe('sao-paulo');
    });
    it('collapses multiple hyphens', () => {
      expect(slugify('farm  to  table')).toBe('farm-to-table');
    });
  });

  describe('titleCase', () => {
    it('capitalizes first letter of each word', () => {
      expect(titleCase('mediterranean')).toBe('Mediterranean');
      expect(titleCase('new york')).toBe('New York');
    });
  });

  describe('escapeHtml', () => {
    it('escapes ampersands, angle brackets, and quotes', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });
  });

  describe('renderPage', () => {
    it('returns a string starting with <!DOCTYPE html>', () => {
      const html = renderPage({ title: 'Test', meta: 'desc', body: '<p>hi</p>' });
      expect(html).toMatch(/^<!DOCTYPE html>/);
    });
    it('includes the title in a <title> tag', () => {
      const html = renderPage({ title: 'My Title', meta: 'desc', body: '' });
      expect(html).toContain('<title>My Title</title>');
    });
    it('includes the meta description', () => {
      const html = renderPage({ title: 'T', meta: 'My description', body: '' });
      expect(html).toContain('content="My description"');
    });
    it('includes the body content', () => {
      const html = renderPage({ title: 'T', meta: 'M', body: '<h1>Hello</h1>' });
      expect(html).toContain('<h1>Hello</h1>');
    });
    it('includes canonical link when provided', () => {
      const html = renderPage({
        title: 'T', meta: 'M', body: '',
        canonical: '/restaurants/madrid/mediterranean'
      });
      expect(html).toContain('rel="canonical"');
      expect(html).toContain('/restaurants/madrid/mediterranean');
    });
    it('omits canonical link when not provided', () => {
      const html = renderPage({ title: 'T', meta: 'M', body: '' });
      expect(html).not.toContain('rel="canonical"');
    });
  });
});
