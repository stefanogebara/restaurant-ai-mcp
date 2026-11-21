import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SectionTabs from '../SectionTabs';
import { NAV_GROUPS } from '../navGroups';

const permission = vi.hoisted(() => ({ owner: true }));
vi.mock('../../../hooks/usePermission', () => ({ usePermission: () => ({ can: () => permission.owner }) }));

function tabsAt(path: string) {
  render(<MemoryRouter initialEntries={[path]}><SectionTabs /></MemoryRouter>);
  const nav = screen.queryByRole('navigation');
  return nav ? within(nav).getAllByRole('link') : [];
}

// The pages that left the menu must stay one click away from their group.
describe('section tabs', () => {
  it.each([
    ['/host-dashboard/floor-plan', ['/host-dashboard/floor-plan', '/host-dashboard/service']],
    ['/host-dashboard/calls', ['/host-dashboard/voice-settings', '/host-dashboard/whatsapp', '/host-dashboard/calls']],
    ['/host-dashboard/insights', ['/host-dashboard/customers', '/host-dashboard/insights']],
    ['/settings/language', ['/host-dashboard/settings', '/host-dashboard/integrations', '/host-dashboard/team', '/settings/language', '/subscription/manage']],
  ])('on %s offers the whole group', (path, hrefs) => {
    const links = tabsAt(path);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(hrefs);
    expect(links.find((a) => a.getAttribute('aria-current') === 'page')).toHaveAttribute('href', path);
  });

  it('hides Team and Plan from staff', () => {
    permission.owner = false;
    const hrefs = tabsAt('/host-dashboard/settings').map((a) => a.getAttribute('href'));
    permission.owner = true;
    expect(hrefs).toEqual(['/host-dashboard/settings', '/host-dashboard/integrations', '/settings/language']);
  });

  it('shows no tabs on Today or the Manager AI', () => {
    expect(tabsAt('/host-dashboard/simple')).toHaveLength(0);
  });

  it('every former menu destination still belongs to a group', () => {
    const reachable = new Set(NAV_GROUPS.flatMap((g) => [g.path, ...g.tabs.map((t) => t.path)]));
    for (const path of ['/host-dashboard/simple', '/host-dashboard/floor-plan', '/host-dashboard/service',
      '/host-dashboard/voice-settings', '/host-dashboard/whatsapp', '/host-dashboard/insights',
      '/host-dashboard/customers', '/host-dashboard/settings', '/settings/language',
      '/host-dashboard/integrations', '/host-dashboard/team', '/subscription/manage']) {
      expect(reachable.has(path), path).toBe(true);
    }
  });
});
