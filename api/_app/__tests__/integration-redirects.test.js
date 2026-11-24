const { integrationReturnUrl } = require('../_lib/integration-redirects');

describe('integration OAuth return URLs', () => {
  test('takes Square and Stripe back to the POS/payments pane', () => {
    expect(integrationReturnUrl('https://seatable.one', 'pos', 'pos_connected', '1'))
      .toBe('https://seatable.one/host-dashboard/integrations?pos_connected=1#integrations:pos');
    expect(integrationReturnUrl('https://seatable.one', 'pos', 'stripe_connect', 'refresh'))
      .toBe('https://seatable.one/host-dashboard/integrations?stripe_connect=refresh#integrations:pos');
  });

  test('takes Instagram back to its pane and encodes provider errors', () => {
    expect(integrationReturnUrl('https://seatable.one', 'instagram', 'instagram_connect', 'error with spaces'))
      .toBe('https://seatable.one/host-dashboard/integrations?instagram_connect=error+with+spaces#integrations:instagram');
  });

  test('refuses unknown panes', () => {
    expect(() => integrationReturnUrl('https://seatable.one', 'whatsapp', 'status', 'ok'))
      .toThrow('Unknown integration tab');
  });
});
