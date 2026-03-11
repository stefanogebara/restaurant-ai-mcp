/// <reference path="../types/elevenlabs.d.ts" />
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import ElevenLabsWidget from '../components/ElevenLabsWidget';
import { useNavigate, Link } from 'react-router-dom';
import ThiingsIcon from '../components/common/ThiingsIcon';

export default function LiveAIDemo() {
  useDocumentTitle('Demo | seatable');
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    // Load ElevenLabs widget script
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
    script.async = true;
    script.type = 'text/javascript';
    document.body.appendChild(script);

    return () => {
      // Cleanup script when component unmounts
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-warm-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 sm:px-16 py-6 bg-warm-white/80 backdrop-blur-xl border-b border-border-gray">
        <Link to="/" className="font-serif text-2xl font-semibold text-deep-charcoal tracking-tight">
          seatable<span className="text-burgundy">.</span>
        </Link>
        <div className="hidden md:flex items-center gap-9">
          <Link to="/#features" className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">{t('landing.liveDemo.nav.features')}</Link>
          <Link to="/#pricing" className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">{t('landing.liveDemo.nav.pricing')}</Link>
          <Link to="/live-demo" className="text-sm font-medium text-deep-charcoal">{t('landing.liveDemo.nav.demo')}</Link>
          <Link to="/#contact" className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">{t('landing.liveDemo.nav.contact')}</Link>
        </div>
        <Link
          to="/#pricing"
          className="px-6 py-2.5 bg-deep-charcoal text-white text-sm font-semibold rounded-full hover:bg-charcoal-dark transition-colors"
        >
          {t('landing.liveDemo.nav.getStarted')}
        </Link>
      </nav>

      {/* Hero */}
      <section className="pt-24 pb-20 text-center max-w-[1200px] mx-auto px-6 sm:px-16">
        <div className="inline-block text-xs font-semibold tracking-[1.5px] uppercase text-burgundy bg-burgundy/[6%] border border-burgundy/15 px-4 py-1.5 rounded-full mb-7">
          {t('landing.liveDemo.hero.badge')}
        </div>
        <h1 className="font-serif text-4xl sm:text-[56px] font-medium leading-[1.1] tracking-tight mb-4">
          {t('landing.liveDemo.hero.title')} <em className="text-burgundy">{t('landing.liveDemo.hero.titleEm')}</em>
        </h1>
        <p className="text-[17px] text-warm-stone font-light leading-relaxed max-w-[520px] mx-auto">
          {t('landing.liveDemo.hero.subtitle')}
        </p>
      </section>

      {/* Demo Widget */}
      <section className="max-w-[720px] mx-auto px-6 sm:px-16 pb-20">
        <div className="bg-white border border-border-gray rounded-[20px] p-8 sm:p-12 text-center">
          <div className="text-xs font-semibold tracking-[1.5px] uppercase text-muted-stone mb-5">{t('landing.liveDemo.widget.label')}</div>
          <h2 className="font-serif text-[28px] font-medium mb-2">{t('landing.liveDemo.widget.name')}</h2>
          <p className="text-sm text-warm-stone font-light mb-9">{t('landing.liveDemo.widget.details')}</p>

          {/* Voice Demo */}
          {import.meta.env.VITE_ELEVENLABS_AGENT_ID ? (
            <div className="mb-6">
              <div className="bg-soft-gray rounded-2xl p-6 mb-5 text-left">
                <p className="text-[13px] text-warm-stone font-light leading-relaxed mb-3">
                  {t('landing.liveDemo.widget.instructions')}
                </p>
                <div className="flex items-center gap-2 text-[12px] text-muted-stone">
                  <span>↘</span>
                  <span>{t('landing.liveDemo.widget.instructionsHint')}</span>
                </div>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-600/[6%] rounded-full">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600" />
                </span>
                <span className="text-[13px] font-medium text-green-600">{t('landing.liveDemo.widget.agentOnline')}</span>
              </div>
              <ElevenLabsWidget agentId={import.meta.env.VITE_ELEVENLABS_AGENT_ID} useSignedUrl={false} />
            </div>
          ) : (
            <div className="mb-6 p-6 bg-soft-gray rounded-2xl text-left">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 bg-burgundy/10 rounded-lg flex items-center justify-center text-burgundy text-base">☎</div>
                <span className="text-sm font-semibold text-deep-charcoal">{t('landing.liveDemo.widget.voiceComingSoon')}</span>
              </div>
              <p className="text-[13px] text-stone-gray font-light leading-relaxed">
                {t('landing.liveDemo.widget.voiceComingSoonDesc')}
              </p>
            </div>
          )}

          {/* Booking Demo Link */}
          <div className="border-t border-border-gray pt-6 mt-2">
            <p className="text-[12px] text-muted-stone mb-3">{t('landing.liveDemo.widget.bookingFlowLabel')}</p>
            <Link
              to="/demo/setup"
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-border-gray hover:border-burgundy/40 text-sm font-medium text-deep-charcoal hover:text-burgundy rounded-xl transition-colors"
            >
              {t('landing.liveDemo.widget.tryBooking')}
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Callouts */}
      <section className="max-w-[900px] mx-auto px-6 sm:px-16 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: 'phone-call' as const, title: t('landing.liveDemo.features.natural.title'), desc: t('landing.liveDemo.features.natural.desc') },
            { icon: 'star' as const, title: t('landing.liveDemo.features.personality.title'), desc: t('landing.liveDemo.features.personality.desc') },
            { icon: 'clock' as const, title: t('landing.liveDemo.features.available.title'), desc: t('landing.liveDemo.features.available.desc') },
          ].map((item, i) => (
            <div key={i} className="bg-white border border-border-gray rounded-2xl p-8">
              <div className="w-10 h-10 rounded-xl bg-burgundy/[6%] flex items-center justify-center mb-4 text-burgundy">
                <ThiingsIcon name={item.icon} pxSize={20} />
              </div>
              <h3 className="text-base font-semibold text-deep-charcoal mb-2 tracking-tight">{item.title}</h3>
              <p className="text-[13px] text-warm-stone font-light leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 sm:px-16 pb-24">
        <div className="max-w-[700px] mx-auto bg-deep-charcoal rounded-3xl p-10 sm:p-16 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl font-medium text-white mb-3 tracking-tight">{t('landing.liveDemo.cta.title')}</h2>
          <p className="text-[15px] text-muted-stone font-light mb-8">{t('landing.liveDemo.cta.subtitle')}</p>
          <button
            onClick={() => navigate('/demo/setup')}
            className="px-8 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white text-[15px] font-semibold rounded-full transition-colors"
          >
            {t('landing.liveDemo.cta.button')}
          </button>
        </div>
      </section>
    </div>
  );
}
