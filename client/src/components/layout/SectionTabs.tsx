import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePermission } from '../../hooks/usePermission';
import { groupForPath } from './navGroups';

/**
 * The row of tabs at the top of a menu group (Salão, Recepcionista, Clientes,
 * Ajustes). It is how the pages that left the menu stay one click away.
 * On the canvas, separated by a hairline: navigation, not a card.
 */
export default function SectionTabs() {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { can } = usePermission();
  const group = groupForPath(pathname);
  const tabs = (group?.tabs ?? []).filter((tab) => !tab.permission || can(tab.permission));
  if (tabs.length < 2) return null;

  return (
    <nav aria-label={t(group!.labelKey, group!.label)}
      className="px-4 sm:px-6 lg:px-10 pt-6 lg:pt-8">
      <div className="max-w-[1240px] flex gap-6 overflow-x-auto border-b hairline">
        {tabs.map((tab) => {
          const active = pathname === tab.path || pathname.startsWith(`${tab.path}/`);
          return (
            <Link key={tab.path} to={tab.path} aria-current={active ? 'page' : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 pb-3 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/40 ${
                active ? 'border-deep-charcoal text-deep-charcoal font-medium' : 'border-transparent text-muted-stone hover:text-deep-charcoal'
              }`}>
              {t(tab.labelKey, tab.label)}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
