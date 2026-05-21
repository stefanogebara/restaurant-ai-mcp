import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import ThiingsIcon from '../common/ThiingsIcon';
import type { IconName } from '../common/ThiingsIcon';

interface DemoNavItem {
  label: string;
  icon: IconName;
  view?: string;   // navigable view name (unlocked)
  locked?: boolean; // locked items show signup toast
}

const NAV_LABELS: Record<string, Record<string, string>> = {
  'pt-BR': {
    Main: 'Principal', AI: 'IA', Insights: 'Análises',
    Dashboard: 'Painel', Tables: 'Mesas', 'Manager AI': 'IA do Gerente',
    'Voice Agent': 'Agente de Voz', WhatsApp: 'WhatsApp',
    Analytics: 'Análises', Reports: 'Relatórios', 'Import History': 'Importar Histórico',
  },
  es: {
    Main: 'Principal', AI: 'IA', Insights: 'Análisis',
    Dashboard: 'Panel', Tables: 'Mesas', 'Manager AI': 'IA del Gerente',
    'Voice Agent': 'Agente de Voz', WhatsApp: 'WhatsApp',
    Analytics: 'Análisis', Reports: 'Informes', 'Import History': 'Importar Historial',
  },
};

// aria-labels for screen readers. Previously hardcoded English even when the
// demo was rendering in PT-BR or ES, leaving visually-impaired non-English
// users with mismatched landmark cues.
const ARIA_STRINGS: Record<string, { closeMenu: string; openMenu: string; closeNav: string; openNav: string }> = {
  en: {
    closeMenu: 'Close menu',
    openMenu: 'Open menu',
    closeNav: 'Close navigation',
    openNav: 'Open navigation',
  },
  'pt-BR': {
    closeMenu: 'Fechar menu',
    openMenu: 'Abrir menu',
    closeNav: 'Fechar navegação',
    openNav: 'Abrir navegação',
  },
  es: {
    closeMenu: 'Cerrar menú',
    openMenu: 'Abrir menú',
    closeNav: 'Cerrar navegación',
    openNav: 'Abrir navegación',
  },
};
function ariaFor(lang: string) {
  return ARIA_STRINGS[lang] ?? ARIA_STRINGS.en;
}

const navSections: { label: string; items: DemoNavItem[] }[] = [
  {
    label: 'Main',
    items: [
      { label: 'Dashboard', icon: 'layout-grid', view: 'dashboard' },
      { label: 'Tables', icon: 'dining', view: 'tables' },
    ],
  },
  {
    label: 'AI',
    items: [
      { label: 'Manager AI', icon: 'bot', view: 'manager-ai' },
      { label: 'Voice Agent', icon: 'microphone', locked: true },
      { label: 'WhatsApp', icon: 'phone', view: 'whatsapp' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Analytics', icon: 'bar-chart', view: 'analytics' },
      { label: 'Reports', icon: 'clipboard-list', locked: true },
      { label: 'Import History', icon: 'upload', locked: true },
    ],
  },
];

interface DemoSidebarProps {
  lang: string;
  activeView?: string;
  onNavigate?: (view: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function DemoSidebar({ lang, activeView = 'dashboard', onNavigate, collapsed = false, onToggleCollapse }: DemoSidebarProps) {
  const [toast, setToast] = useState<string | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // DD.2 — clear any pending toast timer on unmount AND on each new
  // click. Without this, rapid clicks stack timers (the last one wins,
  // so the toast hides early) and unmounting mid-toast triggered a
  // setState-on-unmounted warning + memory leak.
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleLockedClick = (label: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(label);
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2500);
  };

  const handleNavigate = (view: string) => {
    onNavigate?.(view);
    setIsMobileOpen(false);
  };

  const t = (key: string) => NAV_LABELS[lang]?.[key] ?? key;
  const aria = ariaFor(lang);
  const signupText = lang === 'pt-BR' ? 'Cadastre-se para acessar' : lang === 'es' ? 'Regístrate para acceder' : 'Sign up to access';
  const signupCTA = lang === 'pt-BR' ? 'Criar conta grátis' : lang === 'es' ? 'Comenzar gratis' : 'Start free';

  const sidebar = (
    <aside
      className={`
        fixed top-0 left-0 h-full bg-deep-charcoal z-40
        transition-all duration-300 ease-in-out
        ${collapsed ? 'w-[60px]' : 'w-[220px]'}
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}
    >
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className={`py-6 flex items-center justify-between ${collapsed ? 'px-3' : 'px-5'}`}>
          {!collapsed && (
            <h1 className="font-serif text-[22px] font-semibold text-white tracking-tight">
              seatable<span className="text-burgundy">.</span>
            </h1>
          )}
          {collapsed && (
            <h1 className="font-serif text-[18px] font-semibold text-white tracking-tight mx-auto">
              s<span className="text-burgundy">.</span>
            </h1>
          )}
          <button
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden p-1.5 hover:bg-white/5 rounded-lg text-stone-gray"
            aria-label={aria.closeMenu}
          >
            <ThiingsIcon name="close" pxSize={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav aria-label="Demo navigation" className="flex-1 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label} className="mb-5">
              {!collapsed && (
                <div className="px-5 mb-2 text-[11px] font-semibold tracking-widest uppercase text-stone-gray/70">
                  {t(section.label)}
                </div>
              )}

              <div className="space-y-0.5">
                {section.items.map((item) => {
                  // Navigable (unlocked) items
                  if (item.view) {
                    const isActive = item.view === activeView;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => handleNavigate(item.view!)}
                        title={collapsed ? t(item.label) : undefined}
                        className={`w-full flex items-center border-l-2 transition-all duration-150 ${
                          collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-5 py-2.5'
                        } ${
                          isActive
                            ? 'text-white bg-burgundy/10 border-l-burgundy font-medium'
                            : 'text-muted-stone/70 hover:text-white hover:bg-white/[0.04] border-l-transparent'
                        }`}
                      >
                        <ThiingsIcon name={item.icon} pxSize={16} className={isActive ? 'text-burgundy' : ''} />
                        {!collapsed && <span className="text-sm">{t(item.label)}</span>}
                      </button>
                    );
                  }

                  // Locked items
                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => handleLockedClick(t(item.label))}
                      title={collapsed ? t(item.label) : undefined}
                      className={`w-full flex items-center border-l-2 border-l-transparent text-muted-stone/50 hover:text-muted-stone/70 hover:bg-white/[0.02] transition-all duration-150 ${
                        collapsed ? 'justify-center px-0 py-3' : 'gap-3 px-5 py-2.5'
                      }`}
                    >
                      <ThiingsIcon name={item.icon} pxSize={16} />
                      {!collapsed && <span className="text-sm flex-1 text-left">{t(item.label)}</span>}
                      {!collapsed && <ThiingsIcon name="lock" pxSize={11} className="opacity-60" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Collapse toggle */}
        <div className="hidden lg:flex justify-center py-2 border-t border-charcoal-dark">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-2 hover:bg-white/5 rounded-lg text-stone-gray/60 hover:text-stone-gray transition-colors"
            aria-label={collapsed ? (lang === 'pt-BR' ? 'Expandir menu' : 'Expand sidebar') : (lang === 'pt-BR' ? 'Recolher menu' : 'Collapse sidebar')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`}>
              <polyline points="11 17 6 12 11 7" />
              <polyline points="18 17 13 12 18 7" />
            </svg>
          </button>
        </div>

        {/* Upgrade CTA */}
        <div className={`border-t border-charcoal-dark ${collapsed ? 'p-2' : 'p-4'}`}>
          {collapsed ? (
            <Link
              to="/login"
              className="flex items-center justify-center w-full p-2.5 bg-burgundy hover:bg-burgundy-dark text-white rounded-xl transition-colors"
              title={signupCTA}
            >
              <ThiingsIcon name="sparkles" pxSize={14} />
            </Link>
          ) : (
            <Link
              to="/login"
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <ThiingsIcon name="sparkles" pxSize={14} />
              {signupCTA}
            </Link>
          )}
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="lg:hidden fixed top-[60px] left-4 z-50 p-2.5 bg-deep-charcoal rounded-xl shadow-lg border border-charcoal-dark text-white focus:outline-none focus:ring-2 focus:ring-burgundy"
        aria-label={isMobileOpen ? aria.closeNav : aria.openNav}
        aria-expanded={isMobileOpen}
      >
        <ThiingsIcon name="menu" pxSize={20} />
      </button>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-30"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {sidebar}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[80] animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-3 bg-deep-charcoal text-white px-5 py-3 rounded-xl shadow-2xl border border-charcoal-dark">
            <ThiingsIcon name="lock" pxSize={14} className="text-burgundy" />
            <span className="text-sm">
              <strong>{toast}</strong> &mdash; {signupText}
            </span>
            <Link
              to="/login"
              className="ml-2 text-xs font-semibold text-burgundy hover:text-white underline underline-offset-2 transition-colors"
            >
              {signupCTA}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
