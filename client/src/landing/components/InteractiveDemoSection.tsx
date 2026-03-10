import { motion } from 'framer-motion';
import { ExternalLink, Phone, MessageSquare, ArrowRight, LayoutDashboard, Clock, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DEMO_RESTAURANT } from '../data/demoData';

export default function InteractiveDemoSection() {
  const { t } = useTranslation();

  const scrollToContact = () => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="demo" className="py-24 px-6 bg-soft-gray border-t border-border-gray">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-4">{t('landing.demo.label')}</div>
          <h2 className="font-serif text-4xl sm:text-[48px] font-medium tracking-tight text-deep-charcoal mb-3">
            {t('landing.demo.heading')}
          </h2>
          <p className="text-lg text-stone-gray max-w-2xl mx-auto font-light">
            {t('landing.demo.subtitle')}
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-10 items-start">
          {/* Left Column - Dashboard Preview */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="bg-white p-3 rounded-2xl border border-border-gray shadow-lg relative"
          >
            <div className="rounded-[1.5rem] overflow-hidden border border-border-gray">
              {/* Mini Browser Chrome */}
              <div className="flex items-center gap-2 px-3 py-2 bg-soft-gray border-b border-border-gray">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-border-gray" />
                  <div className="w-2 h-2 rounded-full bg-border-gray" />
                  <div className="w-2 h-2 rounded-full bg-border-gray" />
                </div>
                <div className="flex-1 mx-2">
                  <div className="bg-white rounded px-3 py-1 text-[10px] text-muted-stone text-center border border-border-gray">
                    app.seatable.one/host-dashboard
                  </div>
                </div>
              </div>

              {/* Dashboard Content */}
              <div className="flex bg-warm-white">
                {/* Tiny Sidebar */}
                <div className="hidden sm:flex flex-col w-36 bg-white border-r border-border-gray p-3 gap-1.5">
                  <div className="flex items-center gap-1.5 px-2 py-1.5 bg-burgundy text-white rounded text-[10px] font-medium">
                    <LayoutDashboard className="w-3 h-3" />
                    {t('landing.demo.sidebarOverview')}
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 text-muted-stone text-[10px]">
                    <Users className="w-3 h-3" />
                    {t('landing.demo.sidebarCustomers')}
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 text-muted-stone text-[10px]">
                    <Clock className="w-3 h-3" />
                    {t('landing.demo.sidebarAnalytics')}
                  </div>
                </div>

                {/* Main Area */}
                <div className="flex-1 p-3 md:p-4">
                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-white rounded-xl p-2 text-center border border-border-gray">
                      <div className="text-sm font-bold text-deep-charcoal">8/12</div>
                      <div className="text-[9px] text-muted-stone uppercase">{t('landing.demo.infoTables')}</div>
                    </div>
                    <div className="bg-white rounded-xl p-2 text-center border border-border-gray">
                      <div className="text-sm font-bold text-burgundy">67%</div>
                      <div className="text-[9px] text-muted-stone uppercase">{t('landing.demo.infoOccupancy')}</div>
                    </div>
                    <div className="bg-white rounded-xl p-2 text-center border border-border-gray">
                      <div className="text-sm font-bold text-deep-charcoal">24</div>
                      <div className="text-[9px] text-muted-stone uppercase">{t('analytics.today')}</div>
                    </div>
                  </div>

                  {/* Table Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {[
                      'available', 'occupied', 'occupied', 'available',
                      'reserved', 'occupied', 'cleaning', 'occupied',
                    ].map((status, i) => {
                      const colors: Record<string, string> = {
                        available: 'bg-emerald-500/10 border-emerald-500/20',
                        occupied: 'bg-red-600/10 border-red-600/20',
                        reserved: 'bg-violet-500/10 border-violet-500/20',
                        cleaning: 'bg-amber-600/10 border-amber-600/20',
                      };
                      const dots: Record<string, string> = {
                        available: 'bg-emerald-400',
                        occupied: 'bg-red-400',
                        reserved: 'bg-violet-400',
                        cleaning: 'bg-amber-400',
                      };
                      return (
                        <div key={i} className={`${colors[status]} border rounded p-1.5 text-center`}>
                          <div className="text-[10px] font-bold text-stone-gray">T{i + 1}</div>
                          <div className={`w-1 h-1 rounded-full ${dots[status]} mx-auto mt-0.5`} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Open Dashboard CTA overlay */}
            <a
              href="/live-demo"
              className="absolute inset-0 rounded-2xl flex items-end justify-center pb-6 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300"
            >
              <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-deep-charcoal text-sm font-semibold rounded-xl shadow-lg">
                {t('landing.demo.tryLiveDemo')}
                <ExternalLink aria-hidden="true" className="w-3.5 h-3.5" />
              </span>
            </a>

            {/* Live Indicator */}
            <div className="absolute top-6 right-6 flex items-center gap-2 px-3 py-2 bg-white/90 rounded-full shadow-md">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs text-deep-charcoal font-bold tracking-wider">{t('landing.demo.liveBadge')}</span>
            </div>
          </motion.div>

          {/* Right Column - Demo Actions */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            {/* Try the AI Chat */}
            <div className="bg-white p-6 rounded-2xl border border-border-gray shadow-lg hover:shadow-xl transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-burgundy flex items-center justify-center flex-shrink-0">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-xl text-deep-charcoal mb-2">{t('landing.demo.chatTitle')}</h3>
                  <p className="text-stone-gray mb-4 font-light text-sm">
                    {t('landing.demo.chatDesc')}
                  </p>
                  <a
                    href="/live-demo"
                    className="px-5 py-3 bg-burgundy text-white text-sm font-semibold hover:bg-burgundy-dark transition-all duration-300 rounded-xl inline-flex items-center gap-2 shadow-md shadow-burgundy/20"
                  >
                    {t('landing.demo.chatCta')}
                    <ArrowRight aria-hidden="true" className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            {/* Voice Reservations */}
            <div className="bg-white p-6 rounded-2xl border border-border-gray shadow-md hover:shadow-lg transition-shadow">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-deep-charcoal flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-xl text-deep-charcoal mb-2">{t('landing.demo.voiceTitle')}</h3>
                  <p className="text-stone-gray mb-4 font-light text-sm">
                    {t('landing.demo.voiceDesc')}
                  </p>
                  <a
                    href="/live-demo"
                    className="px-5 py-3 border border-deep-charcoal text-deep-charcoal text-sm font-semibold hover:bg-deep-charcoal hover:text-white transition-all duration-300 rounded-xl inline-flex items-center gap-2"
                  >
                    {t('landing.demo.voiceCta')}
                    <ExternalLink aria-hidden="true" className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            {/* Demo Restaurant Info */}
            <div className="bg-warm-white p-6 rounded-2xl border border-border-gray">
              <h4 className="font-serif text-lg text-deep-charcoal mb-4">{t('landing.demo.infoTitle')}</h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-stone-gray text-sm font-light">{t('landing.demo.infoName')}</span>
                  <span className="text-deep-charcoal font-medium">{DEMO_RESTAURANT.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-stone-gray text-sm font-light">{t('landing.demo.infoTables')}</span>
                  <span className="text-deep-charcoal font-medium">{DEMO_RESTAURANT.tables}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-stone-gray text-sm font-light">{t('landing.demo.infoCapacity')}</span>
                  <span className="text-deep-charcoal font-medium">{DEMO_RESTAURANT.capacity} {t('landing.demo.infoSeats')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-stone-gray text-sm font-light">{t('landing.demo.infoOccupancy')}</span>
                  <span className="text-burgundy font-bold">{DEMO_RESTAURANT.occupancy}%</span>
                </div>
              </div>
            </div>

            {/* CTA */}
            <div className="text-center pt-2">
              <p className="text-stone-gray mb-4 font-light text-sm">
                {t('landing.demo.ctaText')}
              </p>
              <button
                type="button"
                onClick={scrollToContact}
                className="bg-burgundy text-white px-8 py-4 text-[15px] font-semibold hover:bg-burgundy-dark transition-all duration-300 rounded-2xl  inline-flex items-center gap-2"
              >
                {t('landing.demo.ctaButton')}
                <ArrowRight aria-hidden="true" className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
