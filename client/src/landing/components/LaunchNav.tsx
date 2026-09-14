import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ThiingsIcon from '../../components/common/ThiingsIcon';

export default function LaunchNav() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const currentLang = i18n.language?.startsWith('pt') ? 'PT' : i18n.language?.startsWith('es') ? 'ES' : 'EN';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 36);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !toggleRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [close, open]);

  const cycleLanguage = () => {
    const next = currentLang === 'EN' ? 'pt-BR' : currentLang === 'PT' ? 'es' : 'en';
    void i18n.changeLanguage(next);
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    close();
  };

  const shellClass = scrolled
    ? 'border-black/10 bg-[#FAFAF9]/90 text-[#0B0B0C] shadow-[0_8px_30px_rgba(11,11,12,0.08)]'
    : 'border-white/20 bg-black/[0.15] text-white shadow-[0_8px_30px_rgba(0,0,0,0.12)]';

  return (
    <nav aria-label={t('landing.launch.navAria', 'Main navigation')} className={'fixed inset-x-3 top-3 z-50 mx-auto flex h-14 max-w-[1200px] items-center justify-between rounded-full border px-3 backdrop-blur-xl transition-colors duration-300 sm:px-4 ' + shellClass}>
      <Link to="/" aria-label={t('landing.launch.homeAria', 'Seatable home')} className="flex min-h-11 items-center gap-2.5 px-1">
        <span className={'h-2.5 w-2.5 rounded-full ' + (scrolled ? 'bg-burgundy' : 'bg-white')} />
        <span className="text-[19px] font-semibold tracking-[-0.045em]">seatable</span>
      </Link>

      <div className="hidden h-full items-center gap-7 md:flex">
        <button type="button" onClick={() => scrollTo('experience')} className="h-full text-[13px] font-medium opacity-75 transition-opacity hover:opacity-100">{t('landing.launch.navProduct', 'Product')}</button>
        <button type="button" onClick={() => scrollTo('story')} className="h-full text-[13px] font-medium opacity-75 transition-opacity hover:opacity-100">{t('landing.launch.navHow', 'How it works')}</button>
        <Link to="/precos" className="flex h-full items-center text-[13px] font-medium opacity-75 transition-opacity hover:opacity-100">{t('landing.nav.pricing', 'Pricing')}</Link>
        <Link to="/login" className="flex h-full items-center text-[13px] font-medium opacity-75 transition-opacity hover:opacity-100">{t('landing.nav.signIn', 'Sign in')}</Link>
        <button type="button" onClick={cycleLanguage} className="flex h-full items-center gap-1.5 text-[13px] font-medium opacity-75 transition-opacity hover:opacity-100" aria-label={t('common.toggleLanguage', 'Toggle language')}>
          <ThiingsIcon name="globe" pxSize={14} />{currentLang}
        </button>
      </div>

      <Link to="/demo/setup" className="hidden min-h-11 items-center rounded-full bg-burgundy px-5 text-[13px] font-semibold text-white transition-[transform,background-color] duration-200 hover:-translate-y-px hover:bg-burgundy-dark md:flex">
        {t('landing.launch.navCta', 'See your restaurant')}
      </Link>

      <button ref={toggleRef} type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={open ? t('common.closeMenu', 'Close menu') : t('common.openMenu', 'Open menu')} className="grid min-h-11 min-w-11 place-items-center md:hidden">
        <ThiingsIcon name={open ? 'close' : 'menu'} pxSize={21} />
      </button>

      <div ref={menuRef} className={'absolute left-0 right-0 top-[calc(100%+8px)] rounded-[24px] border border-black/10 bg-[#FAFAF9]/[0.96] p-3 text-[#0B0B0C] shadow-[0_20px_60px_rgba(11,11,12,0.16)] backdrop-blur-xl transition duration-200 md:hidden ' + (open ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0')}>
        <button type="button" onClick={() => scrollTo('experience')} className="block min-h-11 w-full rounded-xl px-3 text-left text-sm hover:bg-black/5">{t('landing.launch.navProduct', 'Product')}</button>
        <button type="button" onClick={() => scrollTo('story')} className="block min-h-11 w-full rounded-xl px-3 text-left text-sm hover:bg-black/5">{t('landing.launch.navHow', 'How it works')}</button>
        <Link to="/precos" onClick={close} className="flex min-h-11 items-center rounded-xl px-3 text-sm hover:bg-black/5">{t('landing.nav.pricing', 'Pricing')}</Link>
        <Link to="/login" onClick={close} className="flex min-h-11 items-center rounded-xl px-3 text-sm hover:bg-black/5">{t('landing.nav.signIn', 'Sign in')}</Link>
        <button type="button" onClick={cycleLanguage} className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-sm hover:bg-black/5"><ThiingsIcon name="globe" pxSize={14} />{currentLang}</button>
        <Link to="/demo/setup" onClick={close} className="mt-2 flex min-h-12 items-center justify-center rounded-full bg-burgundy px-5 text-sm font-semibold text-white">{t('landing.launch.navCta', 'See your restaurant')}</Link>
      </div>
    </nav>
  );
}
