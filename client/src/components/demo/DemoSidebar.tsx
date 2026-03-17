import { useState } from 'react';
import { Link } from 'react-router-dom';
import ThiingsIcon from '../common/ThiingsIcon';
import type { IconName } from '../common/ThiingsIcon';

interface DemoNavItem {
  label: string;
  icon: IconName;
  active?: boolean;
  locked?: boolean;
}

const navSections: { label: string; items: DemoNavItem[] }[] = [
  {
    label: 'Main',
    items: [
      { label: 'Dashboard', icon: 'layout-grid', active: true },
      { label: 'Tables', icon: 'dining', locked: true },
    ],
  },
  {
    label: 'AI',
    items: [
      { label: 'Manager AI', icon: 'bot', locked: true },
      { label: 'Voice Agent', icon: 'microphone', locked: true },
      { label: 'WhatsApp', icon: 'phone', locked: true },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Analytics', icon: 'bar-chart', locked: true },
      { label: 'Reports', icon: 'clipboard-list', locked: true },
    ],
  },
];

interface DemoSidebarProps {
  lang: string;
}

export default function DemoSidebar({ lang }: DemoSidebarProps) {
  const [toast, setToast] = useState<string | null>(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleLockedClick = (label: string) => {
    setToast(label);
    setTimeout(() => setToast(null), 2500);
  };

  const signupText = lang === 'pt-BR' ? 'Cadastre-se para acessar' : 'Sign up to access';
  const signupCTA = lang === 'pt-BR' ? 'Criar conta gratis' : 'Start free';

  const sidebar = (
    <aside
      className={`
        fixed top-0 left-0 h-full w-[220px] bg-deep-charcoal z-40
        transition-transform duration-300 ease-in-out
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}
    >
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="py-6 px-5 flex items-center justify-between">
          <h1 className="font-serif text-[22px] font-semibold text-white tracking-tight">
            seatable<span className="text-burgundy">.</span>
          </h1>
          <button
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden p-1.5 hover:bg-white/5 rounded-lg text-stone-gray"
            aria-label="Close menu"
          >
            <ThiingsIcon name="close" pxSize={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav aria-label="Demo navigation" className="flex-1 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label} className="mb-5">
              <div className="px-5 mb-2 text-[11px] font-semibold tracking-widest uppercase text-stone-gray/70">
                {section.label}
              </div>

              <div className="space-y-0.5">
                {section.items.map((item) => {
                  if (item.active) {
                    return (
                      <div
                        key={item.label}
                        className="flex items-center gap-3 px-5 py-2.5 text-white bg-burgundy/10 border-l-2 border-l-burgundy font-medium"
                      >
                        <ThiingsIcon name={item.icon} pxSize={16} className="text-burgundy" />
                        <span className="text-sm">{item.label}</span>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => handleLockedClick(item.label)}
                      className="w-full flex items-center gap-3 px-5 py-2.5 text-muted-stone/50 hover:text-muted-stone/70 hover:bg-white/[0.02] border-l-2 border-l-transparent transition-all duration-150"
                    >
                      <ThiingsIcon name={item.icon} pxSize={16} />
                      <span className="text-sm flex-1 text-left">{item.label}</span>
                      <ThiingsIcon name="lock" pxSize={11} className="opacity-60" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Upgrade CTA */}
        <div className="p-4 border-t border-charcoal-dark">
          <Link
            to="/login"
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <ThiingsIcon name="sparkles" pxSize={14} />
            {signupCTA}
          </Link>
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
        aria-label={isMobileOpen ? 'Close navigation' : 'Open navigation'}
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
