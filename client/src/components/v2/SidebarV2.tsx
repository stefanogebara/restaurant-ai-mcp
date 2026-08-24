/**
 * SidebarV2 — shared dark sidebar matching the Claude Design v2 mockups.
 *
 * Used by SofiaV2 and any future v2 routes. Keeps
 * the design system in one place: same nav order, same active burgundy
 * highlight, same manager footer card.
 */

import { Link, useLocation } from 'react-router-dom';

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

// Marketing was a placeholder pointing at /insights (duplicate of Clientes).
// Removed until there's an actual Marketing page — having a nav item that
// silently routes to the wrong place is worse than not having it at all.
const NAV: NavItem[] = [
  { label: 'Visão geral',    href: '/host-dashboard/v2',           icon: '⌂' },
  { label: 'Reservas',       href: '/host-dashboard/simple',       icon: '📅' },
  { label: 'Clientes',       href: '/host-dashboard/insights',     icon: '👥' },
  { label: 'Mesas',          href: '/host-dashboard/floor-plan',   icon: '▦'  },
  { label: 'WhatsApp',       href: '/host-dashboard/sofia/v2',     icon: '💬' },
  { label: 'Análises',       href: '/analytics',                   icon: '📊' },
  { label: 'Configurações',  href: '/host-dashboard/settings/v2',  icon: '⚙'  },
];

export default function SidebarV2({ managerName }: { managerName: string }) {
  const { pathname } = useLocation();
  return (
    <aside
      className="w-[240px] shrink-0 bg-[#1C1917] text-white flex flex-col"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <Link to="/host-dashboard/v2" className="flex items-center gap-2 text-white no-underline">
          <span className="w-7 h-7 rounded-md bg-[#9F1239] flex items-center justify-center font-bold text-sm">S</span>
          <span className="text-[15px] font-medium tracking-tight">Seatable</span>
        </Link>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(item => {
          // Treat the current path as a match when it starts with the item's
          // href (so /host-dashboard/settings/v2/* still highlights Configurações).
          const active = pathname === item.href ||
            (item.href !== '/host-dashboard/v2' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-colors ${
                active
                  ? 'bg-[#9F1239] text-white font-medium'
                  : 'text-white/70 hover:text-white hover:bg-white/[0.06]'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <span className="w-4 inline-block text-center opacity-80">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="m-3 p-3 rounded-lg bg-white/[0.06] border border-white/[0.04]">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#D97706] to-[#9F1239] flex items-center justify-center text-sm font-semibold">
            {managerName?.[0]?.toUpperCase() || 'M'}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-medium truncate">{managerName || 'Gerente'}</div>
            <div className="text-[11px] text-white/50">Gerente · online</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/** Resolves a friendly first-name display for the greeting/avatar.
 *
 * Picks the first alphabetic-only segment of the local part, so emails with
 * hyphens or digits ("v2-audit-1779442200794@...") still produce a clean
 * name ("Audit") instead of dumping the full prefix into the greeting.
 *   stefano@example.com         → "Stefano"
 *   mariana.rocha@example.com   → "Mariana"
 *   v2-audit-17794@example.com  → "Audit"
 *   12345@example.com           → "Gerente" (no alpha segment)
 */
export function getManagerName(email: string | null | undefined): string {
  const local = (email?.split('@')[0] || '').toLowerCase();
  // Split on any non-Portuguese-letter char, then take the first usable segment.
  const segments = local.split(/[^a-záéíóúçãõâêîôûü]+/i).filter(s => s.length >= 2);
  const first = segments[0];
  if (!first) return 'Gerente';
  return first.charAt(0).toUpperCase() + first.slice(1);
}
