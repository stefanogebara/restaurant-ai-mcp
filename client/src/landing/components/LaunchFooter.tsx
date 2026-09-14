import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const FAQ_COUNT = 9;

export default function LaunchFooter() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#FAFAF9] text-[#0B0B0C]">
      <section aria-labelledby="landing-faq-title" className="mx-auto max-w-[840px] px-5 py-20 sm:px-10 sm:py-28">
        <h2 id="landing-faq-title" className="text-center text-[clamp(2.2rem,4vw,3.6rem)] font-semibold leading-tight tracking-[-0.045em]">{t('landing.footer.faq', 'Frequently Asked Questions')}</h2>
        <div className="mt-10 border-t border-black/[0.12]">
          {Array.from({ length: FAQ_COUNT }, (_, index) => (
            <details key={index} className="group border-b border-black/[0.12]">
              <summary className="flex min-h-[64px] cursor-pointer list-none items-center justify-between gap-5 py-4 text-[16px] font-medium marker:hidden">
                <span>{t('landing.faq.q' + (index + 1))}</span>
                <span className="text-2xl font-light leading-none text-[#706A65] transition-transform duration-200 group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="max-w-[700px] pb-6 pr-10 text-[15px] leading-[1.6] text-[#706A65]">{t('landing.faq.a' + (index + 1))}</p>
            </details>
          ))}
        </div>
      </section>

      <div className="border-t border-black/[0.12]">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-14 sm:grid-cols-[1.4fr_1fr_1fr] sm:px-10 lg:px-16">
          <div>
            <Link to="/" className="text-xl font-semibold tracking-[-0.045em]">seatable</Link>
            <p className="mt-4 max-w-[300px] text-sm leading-relaxed text-[#706A65]">{t('landing.footer.tagline', 'AI-powered restaurant management.')}</p>
            <a href="mailto:hello@seatable.one" className="mt-5 inline-block text-sm font-medium underline decoration-black/25 underline-offset-4 transition-colors hover:text-burgundy">hello@seatable.one</a>
          </div>
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#706A65]">{t('landing.footer.product', 'Product')}</h3>
            <nav aria-label={t('landing.footer.product', 'Product')} className="mt-4 space-y-3 text-sm">
              <Link to="/demo/setup" className="block hover:text-burgundy">{t('landing.nav.tryFree', 'Try free demo')}</Link>
              <Link to="/precos" className="block hover:text-burgundy">{t('landing.nav.pricing', 'Pricing')}</Link>
              <Link to="/login" className="block hover:text-burgundy">{t('landing.nav.signIn', 'Sign in')}</Link>
            </nav>
          </div>
          <div>
            <h3 className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[#706A65]">{t('landing.footer.legal', 'Legal')}</h3>
            <nav aria-label={t('landing.footer.legal', 'Legal')} className="mt-4 space-y-3 text-sm">
              <Link to="/privacy" className="block hover:text-burgundy">{t('landing.footer.privacy')}</Link>
              <Link to="/terms" className="block hover:text-burgundy">{t('landing.footer.terms')}</Link>
            </nav>
          </div>
        </div>
      </div>

      <div className="border-t border-black/[0.12] px-5 py-7 text-center text-[11px] leading-relaxed text-[#706A65] sm:px-10">
        <p>© {currentYear} Seatable.</p>
        <p className="mt-1">Seatable — 65.087.663 Stefano Chap Chap Gebara · CNPJ 65.087.663/0001-30 · São Paulo, SP</p>
      </div>
    </footer>
  );
}
