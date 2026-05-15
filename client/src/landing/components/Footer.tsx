import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';

const FAQ_COUNT = 9;

function FAQItem({ questionKey, answerKey }: { questionKey: string; answerKey: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();

  return (
    <div className="border-b border-border-gray last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full py-4 text-left text-sm font-medium text-deep-charcoal hover:text-burgundy transition-colors"
        aria-expanded={open}
      >
        {t(questionKey)}
        <ChevronDown
          className={`w-4 h-4 text-muted-stone flex-shrink-0 ml-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${open ? 'max-h-60 pb-4' : 'max-h-0'}`}
      >
        <p className="text-sm text-warm-stone leading-relaxed">{t(answerKey)}</p>
      </div>
    </div>
  );
}

export default function Footer() {
  const { t } = useTranslation();
  const currentYear = new Date().getFullYear();

  const faqKeys = Array.from({ length: FAQ_COUNT }, (_, i) => ({
    q: `landing.faq.q${i + 1}`,
    a: `landing.faq.a${i + 1}`,
  }));

  return (
    <footer className="border-t border-border-gray">
      {/* FAQ Accordion */}
      <div className="max-w-3xl mx-auto px-6 sm:px-16 py-16">
        <h3 className="font-serif text-2xl font-medium text-deep-charcoal text-center mb-8">
          {t('landing.footer.faq', 'Frequently Asked Questions')}
        </h3>
        <div className="border-t border-border-gray">
          {faqKeys.map((faq) => (
            <FAQItem key={faq.q} questionKey={faq.q} answerKey={faq.a} />
          ))}
        </div>
      </div>

      {/* Contact & company info — H25: previously empty footer hurt trust.
          Brazilian customers expect a CNPJ + contact email visible to take
          a SaaS purchase seriously. */}
      <div className="border-t border-border-gray">
        <div className="max-w-3xl mx-auto px-6 sm:px-16 py-12 grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div>
            <h4 className="text-xs font-semibold tracking-wider uppercase text-deep-charcoal mb-3">
              {t('landing.footer.contact', 'Contact')}
            </h4>
            <a
              href="mailto:hello@seatable.one"
              className="block text-[13px] text-warm-stone hover:text-burgundy transition-colors"
            >
              hello@seatable.one
            </a>
            <p className="text-[13px] text-warm-stone mt-1">
              {t('landing.footer.responseTime', 'Reply within 24h')}
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold tracking-wider uppercase text-deep-charcoal mb-3">
              {t('landing.footer.product', 'Product')}
            </h4>
            <Link to="/live-demo" className="block text-[13px] text-warm-stone hover:text-burgundy transition-colors">
              {t('landing.nav.demo', 'Demo')}
            </Link>
            <Link to="/demo/setup" className="block text-[13px] text-warm-stone hover:text-burgundy transition-colors mt-1">
              {t('landing.nav.tryFree', 'Try free demo')}
            </Link>
            <Link to="/login" className="block text-[13px] text-warm-stone hover:text-burgundy transition-colors mt-1">
              {t('landing.nav.signIn', 'Sign in')}
            </Link>
          </div>
          <div>
            <h4 className="text-xs font-semibold tracking-wider uppercase text-deep-charcoal mb-3">
              {t('landing.footer.legal', 'Legal')}
            </h4>
            <Link to="/privacy" className="block text-[13px] text-warm-stone hover:text-burgundy transition-colors">
              {t('landing.footer.privacy')}
            </Link>
            <Link to="/terms" className="block text-[13px] text-warm-stone hover:text-burgundy transition-colors mt-1">
              {t('landing.footer.terms')}
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 sm:px-16 py-8 border-t border-border-gray">
        <div className="font-serif text-xl font-semibold text-deep-charcoal">
          seatable<span className="text-burgundy">.</span>
        </div>
        <p className="text-[12px] text-muted-stone text-center sm:text-right">
          &copy; {currentYear} Seatable. {t('landing.footer.tagline', 'AI-powered restaurant management.')}
        </p>
      </div>
    </footer>
  );
}
