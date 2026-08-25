import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface LoginBrandPanelProps {
  /** Convert vindo do demo: troca os três bullets genéricos pelo restaurante
   *  que a pessoa acabou de ver a IA atender. Vender features para quem
   *  ACABOU de experimentá-las era o desperdício do momento de maior
   *  intenção do funil (auditoria 24/ago). */
  demo?: {
    restaurantName: string;
    city: string | null;
    daysLeft: number | null;
  };
}

export default function LoginBrandPanel({ demo }: LoginBrandPanelProps = {}) {
  const { t } = useTranslation();
  return (
    <div className="hidden lg:flex lg:flex-[0_0_480px] bg-deep-charcoal relative overflow-hidden">
      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-0 left-0 w-full h-full" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
      </div>

      {/* Decorative accent */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-burgundy/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-64 h-64 bg-burgundy/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

      <div className="relative z-10 flex flex-col justify-between p-12 w-full">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Link to="/" className="inline-block">
            <span className="font-serif text-3xl tracking-tight text-white">
              seatable<span className="text-burgundy">.</span>
            </span>
          </Link>
        </motion.div>

        {/* Main message */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-8"
        >
          {demo ? (
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-muted-stone mb-4">
                {t('login.demoPanelEyebrow')}
              </p>
              <p className="font-serif text-4xl xl:text-[36px] leading-[1.2] tracking-tight text-white text-balance">
                {demo.restaurantName}
              </p>
              {demo.city && (
                <p className="text-[15px] text-warm-stone font-light mt-2">{demo.city}</p>
              )}

              <div className="mt-8 pt-6 border-t border-white/10 space-y-3">
                <div className="flex items-center gap-2.5">
                  <span className="relative flex h-2 w-2 flex-shrink-0" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                  <p className="text-sm text-soft-gray">{t('login.demoPanelOnDuty')}</p>
                </div>
                <p className="text-[13px] text-warm-stone font-light leading-relaxed">
                  {t('login.demoPanelKeeps')}
                </p>
                {typeof demo.daysLeft === 'number' && demo.daysLeft > 0 && (
                  <p className="text-[13px] text-muted-stone font-light tabular-nums">
                    {t('login.demoPanelDaysLeft', { count: demo.daysLeft })}
                  </p>
                )}
              </div>
            </div>
          ) : (
          <>
          <p className="font-serif text-4xl xl:text-[36px] font-normal italic leading-[1.35] tracking-tight text-soft-gray mb-10">
            &ldquo;{t('login.brandTagline')}&rdquo;
          </p>

          {/* Feature highlights */}
          <div className="space-y-5">
            {[
              { title: t('login.brandFeature1Title'), desc: t('login.brandFeature1Desc') },
              { title: t('login.brandFeature2Title'), desc: t('login.brandFeature2Desc') },
              { title: t('login.brandFeature3Title'), desc: t('login.brandFeature3Desc') },
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.15 }}
                className="flex items-start gap-3.5"
              >
                <div className="w-2 h-2 rounded-full bg-burgundy flex-shrink-0 mt-1.5" />
                <div>
                  <h4 className="text-sm font-semibold text-soft-gray mb-1">{feature.title}</h4>
                  <p className="text-[13px] text-warm-stone font-light leading-relaxed">{feature.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
          </>
          )}
        </motion.div>

        {/* Bottom stats */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="flex gap-8"
        >
          <div>
            <div className="text-2xl font-serif font-bold text-white">2.3s</div>
            <div className="text-xs text-muted-stone uppercase tracking-wider">{t('login.statResponse')}</div>
          </div>
          <div className="w-px bg-white/10" />
          <div>
            <div className="text-2xl font-serif font-bold text-burgundy">6+</div>
            <div className="text-xs text-muted-stone uppercase tracking-wider">{t('login.statLanguages')}</div>
          </div>
          <div className="w-px bg-white/10" />
          <div>
            <div className="text-2xl font-serif font-bold text-white">24/7</div>
            <div className="text-xs text-muted-stone uppercase tracking-wider">{t('login.statBooking')}</div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
