import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { trackPresetDemoClicked } from '../../lib/analytics';

const presets = [
  { id: 'italian', flag: '\u{1F1EE}\u{1F1F9}', name: 'Trattoria da Marco', cuisineKey: 'landing.tryDemo.cuisineItalian', brief: 'landing.tryDemo.briefItalian', accent: 'bg-amber-50 text-amber-700' },
  { id: 'japanese', flag: '\u{1F1EF}\u{1F1F5}', name: 'Sakura Izakaya', cuisineKey: 'landing.tryDemo.cuisineJapanese', brief: 'landing.tryDemo.briefJapanese', accent: 'bg-rose-50 text-rose-700' },
  { id: 'brazilian', flag: '\u{1F1E7}\u{1F1F7}', name: 'Cantina da Praça', cuisineKey: 'landing.tryDemo.cuisineBrazilian', brief: 'landing.tryDemo.briefBrazilian', accent: 'bg-lime-50 text-lime-700' },
] as const;

export default function PresetDemoSection() {
  const { t } = useTranslation();

  return (
    <section id="try-demo" data-section="preset-demo" className="py-24 px-6 sm:px-16 bg-warm-white">
      <div className="max-w-5xl mx-auto text-center">
        <p className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-3">
          {t('landing.tryDemo.label', 'Try it right now')}
        </p>
        <h2 className="font-serif text-4xl sm:text-[48px] leading-tight font-medium text-deep-charcoal mb-3">
          {t('landing.tryDemo.heading', 'Pick a restaurant. Explore the dashboard.')}
        </h2>
        <p className="text-lg text-warm-stone font-light mb-14">
          {t('landing.tryDemo.subtitle', 'No signup, no email. Just click and see how it works.')}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {presets.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ delay: i * 0.15, duration: 0.45 }}
            >
              <Link
                to={`/demo?preset=${p.id}`}
                onClick={() => trackPresetDemoClicked({ restaurant: p.id })}
                aria-label={t('landing.tryDemo.cardAria', { name: p.name, defaultValue: `Explore ${p.name} demo` })}
                className="group relative flex flex-col items-center gap-3 p-8 bg-white rounded-2xl border border-border-gray
                  hover:border-burgundy hover:-translate-y-1
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy focus-visible:ring-offset-2
                  transition-all duration-200"
              >
                <span className="text-4xl">{p.flag}</span>
                <h3 className="font-serif text-lg font-semibold text-deep-charcoal">{p.name}</h3>
                <span className={`text-xs font-medium px-3 py-0.5 rounded-full ${p.accent}`}>{t(p.cuisineKey)}</span>
                <span className="text-sm text-muted-stone">{t(p.brief)}</span>
                <span className="absolute bottom-4 right-4 text-muted-stone opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">&rarr;</span>
              </Link>
            </motion.div>
          ))}
        </div>

        <p className="mt-12 text-sm text-warm-stone">
          {t('landing.tryDemo.cta', 'Want YOUR restaurant?')}{' '}
          <Link to="/demo/setup" className="text-burgundy underline underline-offset-2 hover:text-burgundy-dark transition-colors">
            {t('landing.tryDemo.ctaLink', 'Set it up here \u2192')}
          </Link>
        </p>
      </div>
    </section>
  );
}
