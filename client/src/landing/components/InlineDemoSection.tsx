import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { trackPresetDemoClicked, trackDemoFunnel } from '../../lib/analytics';

const PRESETS = [
  { id: 'brazilian', label: 'Cantina da Praça' },
  { id: 'italian',  label: 'Trattoria da Marco' },
  { id: 'japanese', label: 'Sakura Izakaya'  },
] as const;

// If the iframe hasn't fired onLoad within this window, assume the embedded
// demo can't render here (ad-blocker, CSP, network issue, slow build) and
// surface a graceful fallback instead of spinning forever.
const IFRAME_LOAD_TIMEOUT_MS = 12000;

export default function InlineDemoSection() {
  const { t } = useTranslation();
  const [activePreset, setActivePreset] = useState<string>('brazilian');
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [iframeFailed, setIframeFailed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isInteracting, setIsInteracting] = useState(false);
  const sectionRef = useRef<HTMLDivElement>(null);
  const hasTracked = useRef(false);
  const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lazy-load: only start the iframe when the section enters viewport
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setIsVisible(true); observer.disconnect(); } },
      { rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Start a fallback timer whenever a new preset begins loading. If onLoad
  // doesn't fire in time, give up and show the error state.
  useEffect(() => {
    if (!isVisible || iframeLoaded || iframeFailed) return;
    loadTimeoutRef.current = setTimeout(() => {
      setIframeFailed(true);
    }, IFRAME_LOAD_TIMEOUT_MS);
    return () => {
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
        loadTimeoutRef.current = null;
      }
    };
  }, [isVisible, iframeLoaded, iframeFailed, activePreset]);

  const handleIframeLoad = () => {
    setIframeLoaded(true);
    setIframeFailed(false);
    if (loadTimeoutRef.current) {
      clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  };

  const handlePresetSwitch = (id: string) => {
    if (id === activePreset) return;
    setActivePreset(id);
    setIframeLoaded(false);
    setIframeFailed(false);
    setIsInteracting(false);
    if (!hasTracked.current) {
      hasTracked.current = true;
      trackDemoFunnel({ step: 'demo_started', preset: id });
    }
    trackPresetDemoClicked({ restaurant: id });
  };

  return (
    <section ref={sectionRef} className="py-24 px-6 sm:px-16 border-t border-glass-border-dark" id="try-demo" data-section="inline-demo">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-3">
            {t('landing.inlineDemo.label', 'Live demo')}
          </p>
          <h2 className="font-serif text-4xl sm:text-[48px] leading-tight font-medium text-deep-charcoal mb-3">
            {t('landing.inlineDemo.heading', 'Your AI-powered dashboard')}
          </h2>
          <p className="text-lg text-warm-stone font-light max-w-xl mx-auto">
            {t('landing.inlineDemo.subtitle', 'Click around — it\'s fully interactive. No signup needed.')}
          </p>
        </div>

        {/* Preset tabs */}
        <div className="flex justify-center gap-2 mb-6 flex-wrap">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => handlePresetSwitch(p.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                activePreset === p.id
                  ? 'bg-deep-charcoal text-white border-deep-charcoal'
                  : 'bg-white text-warm-stone border-glass-border-dark hover:border-burgundy/40 hover:text-deep-charcoal'
              }`}
            >
              {/* Sem bandeirinha emoji (regra R9) — o nome basta na aba. */}
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        {/* Browser chrome frame */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="glass-panel overflow-hidden"
        >
          {/* Browser top bar */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[#F5F5F4] border-b border-glass-border-dark">
            {/* Traffic lights */}
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
              <div className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
              <div className="w-3 h-3 rounded-full bg-[#28C840]" />
            </div>
            {/* URL bar */}
            <div className="flex-1 max-w-[320px] mx-auto">
              <div className="flex items-center gap-2 bg-white border border-glass-border-dark rounded-md px-3 py-1.5 text-xs text-warm-stone">
                <svg className="w-3 h-3 text-[#28C840] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <span className="truncate">seatable.one/demo?preset={activePreset}</span>
              </div>
            </div>
          </div>

          {/* iframe */}
          <div className="relative" style={{ height: '600px' }}>
            {/* Skeleton while loading */}
            {!iframeLoaded && !iframeFailed && (
              <div className="absolute inset-0 bg-soft-gray flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-burgundy border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-warm-stone">{t('landing.inlineDemo.loading', 'Loading demo...')}</p>
                </div>
              </div>
            )}
            {/* Fallback when the iframe couldn't load in time (CSP, blocker, network) */}
            {iframeFailed && (
              <div className="absolute inset-0 bg-soft-gray flex items-center justify-center px-6">
                <div className="flex flex-col items-center gap-3 text-center max-w-md">
                  <p className="text-base font-medium text-deep-charcoal">
                    {t('landing.inlineDemo.loadError', "We couldn't load the demo here.")}
                  </p>
                  <p className="text-sm text-warm-stone">
                    {t('landing.inlineDemo.loadErrorHint', 'Try opening it fullscreen instead.')}
                  </p>
                  <Link
                    to={`/demo?preset=${activePreset}`}
                    className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark text-white text-sm font-semibold rounded-full transition-colors"
                  >
                    {t('landing.inlineDemo.fullscreen', 'Open fullscreen')}
                  </Link>
                </div>
              </div>
            )}
            {isVisible && !iframeFailed && (
              <iframe
                key={activePreset}
                src={`/demo?preset=${activePreset}&embed=true`}
                title={`Demo — ${PRESETS.find(p => p.id === activePreset)?.label}`}
                className="w-full h-full border-0"
                style={{ pointerEvents: isInteracting ? 'auto' : 'none' }}
                onLoad={handleIframeLoad}
                loading="lazy"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            )}
            {/* Click-to-interact overlay — prevents iframe from hijacking page scroll */}
            {!isInteracting && iframeLoaded && (
              <div
                className="absolute inset-0 cursor-pointer flex items-end justify-center pb-6"
                onClick={() => setIsInteracting(true)}
                aria-label={t('landing.inlineDemo.clickToInteract', 'Click to interact with demo')}
              >
                <div className="bg-deep-charcoal/80 backdrop-blur-sm text-white text-xs font-medium px-4 py-2 rounded-full flex items-center gap-2">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" />
                  </svg>
                  {t('landing.inlineDemo.clickToInteract', 'Click to interact')}
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* CTA below browser */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
          <Link
            to="/demo/setup"
            onClick={() => trackDemoFunnel({ step: 'signup_started' })}
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white text-[15px] font-semibold rounded-full transition-colors"
          >
            {t('landing.inlineDemo.cta', 'Create your restaurant')} &rarr;
          </Link>
          <Link
            to={`/demo?preset=${activePreset}`}
            className="text-sm text-warm-stone hover:text-deep-charcoal underline underline-offset-2 transition-colors"
          >
            {t('landing.inlineDemo.fullscreen', 'Open fullscreen')}
          </Link>
        </div>
      </div>
    </section>
  );
}
