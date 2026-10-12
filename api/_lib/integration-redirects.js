const TABS = new Set(['pos', 'instagram']);

function integrationReturnUrl(clientUrl, tab, parameter, value) {
  if (!TABS.has(tab)) throw new Error('Unknown integration tab');
  const url = new URL('/host-dashboard/integrations', clientUrl);
  url.searchParams.set(parameter, value);
  url.hash = `integrations:${tab}`;
  return url.toString();
}

module.exports = { integrationReturnUrl };
