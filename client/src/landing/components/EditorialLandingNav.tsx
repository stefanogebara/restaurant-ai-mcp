import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../../components/common/ThiingsIcon';

export default function EditorialLandingNav() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const currentLang = i18n.language?.startsWith('pt') ? 'PT' : i18n.language?.startsWith('es') ? 'ES' : 'EN';
  const close = useCallback(() => setOpen(false), []);

  const cycleLanguage = () => {
    const next = currentLang === 'EN' ? 'pt-BR' : currentLang === 'PT' ? 'es' : 'en';
    void i18n.changeLanguage(next);
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !toggleRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [close, open]);

  return (
    <nav aria-label={t('landing.editorial.navAria', 'Main navigation')} className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-[1380px] items-center justify-between rounded-[26px] border border-glass-border-dark bg-glass-modal px-4 py-2.5 shadow-glass-nav backdrop-blur-glass-nav sm:px-5">
      <Link to="/" aria-label={t('landing.editorial.homeAria', 'Seatable home')} className="flex min-h-[44px] items-center gap-2 text-deep-charcoal">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-deep-charcoal text-white"><ThiingsIcon name="dining" pxSize={14} /></span>
        <span className="text-[19px] tracking-[-0.04em]">seatable</span>
      </Link>

      <div className="hidden items-center gap-8 md:flex">
        <button type="button" onClick={() => scrollTo('experience')} className="min-h-[44px] text-sm text-stone-gray transition-colors hover:text-deep-charcoal">{t('landing.editorial.navExperience', 'Experience')}</button>
        <button type="button" onClick={() => scrollTo('system')} className="min-h-[44px] text-sm text-stone-gray transition-colors hover:text-deep-charcoal">{t('landing.editorial.navSystem', 'System')}</button>
        <Link to="/precos" className="flex min-h-[44px] items-center text-sm text-stone-gray transition-colors hover:text-deep-charcoal">{t('landing.nav.pricing', 'Pricing')}</Link>
        <Link to="/login" className="flex min-h-[44px] items-center text-sm text-stone-gray transition-colors hover:text-deep-charcoal">{t('landing.nav.signIn', 'Sign in')}</Link>
        <button type="button" onClick={cycleLanguage} className="flex min-h-[44px] items-center gap-1.5 text-sm text-stone-gray transition-colors hover:text-deep-charcoal" aria-label={t('common.toggleLanguage', 'Toggle language')}>
          <ThiingsIcon name="globe" pxSize={15} />{currentLang}
        </button>
      </div>

      <Link to="/demo/setup" className="hidden min-h-[44px] items-center rounded-full bg-deep-charcoal px-6 text-sm text-white transition-colors hover:bg-burgundy md:flex">{t('landing.editorial.navCta', 'See your restaurant')}</Link>

      <button ref={toggleRef} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? t('common.closeMenu', 'Close menu') : t('common.openMenu', 'Open menu')} className="grid min-h-[44px] min-w-[44px] place-items-center text-deep-charcoal md:hidden">
        <ThiingsIcon name={open ? 'close' : 'menu'} pxSize={22} />
      </button>

      <div ref={menuRef} className={`absolute left-0 right-0 top-[calc(100%+8px)] rounded-[24px] border border-glass-border-dark bg-glass-modal p-3 shadow-glass-modal backdrop-blur-glass-modal transition duration-200 md:hidden ${open ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0'}`}>
        <button type="button" onClick={() => scrollTo('experience')} className="block min-h-[44px] w-full rounded-xl px-3 text-left text-sm text-stone-gray hover:bg-soft-gray">{t('landing.editorial.navExperience', 'Experience')}</button>
        <button type="button" onClick={() => scrollTo('system')} className="block min-h-[44px] w-full rounded-xl px-3 text-left text-sm text-stone-gray hover:bg-soft-gray">{t('landing.editorial.navSystem', 'System')}</button>
        <Link to="/precos" onClick={close} className="flex min-h-[44px] items-center rounded-xl px-3 text-sm text-stone-gray hover:bg-soft-gray">{t('landing.nav.pricing', 'Pricing')}</Link>
        <Link to="/login" onClick={close} className="flex min-h-[44px] items-center rounded-xl px-3 text-sm text-stone-gray hover:bg-soft-gray">{t('landing.nav.signIn', 'Sign in')}</Link>
        <button type="button" onClick={cycleLanguage} className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-3 text-sm text-stone-gray hover:bg-soft-gray"><ThiingsIcon name="globe" pxSize={15} />{currentLang}</button>
        <Link to="/demo/setup" onClick={close} className="mt-2 flex min-h-[48px] items-center justify-center rounded-full bg-deep-charcoal px-5 text-sm text-white">{t('landing.editorial.navCta', 'See your restaurant')}</Link>
      </div>
    </nav>
  );
}
