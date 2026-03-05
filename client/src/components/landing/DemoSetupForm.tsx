import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

interface DemoFormData {
  restaurant_name: string;
  cuisine_type: string;
  city: string;
  country: string;
  open_time: string;
  close_time: string;
  max_party_size: number;
  cancellation_policy: string;
  custom_policy: string;
  contact_name: string;
  contact_email: string;
}

interface DemoSetupFormProps {
  form: DemoFormData;
  isSubmitting: boolean;
  submitError: string | null;
  onUpdate: (field: keyof DemoFormData, value: string | number) => void;
  onSubmit: (e: React.FormEvent) => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[1.6px] text-muted-stone mb-4">
      {children}
    </p>
  );
}

function FieldLabel({ htmlFor, required, children }: { htmlFor: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-[13px] font-medium text-stone-gray mb-1.5">
      {children}
      {required && <span className="text-burgundy ml-0.5">*</span>}
    </label>
  );
}

const inputBase = 'w-full px-4 py-3 border border-border-gray rounded-xl text-sm text-deep-charcoal placeholder-muted-stone bg-white focus:outline-none focus:ring-[3px] focus:ring-burgundy/20 focus:border-burgundy transition-all';
const textareaBase = 'w-full px-4 py-3 border border-border-gray rounded-xl text-sm text-deep-charcoal placeholder-muted-stone bg-white focus:outline-none focus:ring-[3px] focus:ring-burgundy/20 focus:border-burgundy transition-all resize-none';

export default function DemoSetupForm({ form, isSubmitting, submitError, onUpdate, onSubmit }: DemoSetupFormProps) {
  const { t } = useTranslation();

  return (
    <form onSubmit={onSubmit} className="bg-white border border-border-gray rounded-[2rem] p-8 sm:p-10 shadow-xl space-y-8">
      {/* Group 1 — Your Restaurant */}
      <div>
        <SectionLabel>{t('landing.demoSetup.form.sectionRestaurant')}</SectionLabel>
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="restaurant_name" required>{t('landing.demoSetup.form.restaurantName')}</FieldLabel>
            <input id="restaurant_name" type="text" required value={form.restaurant_name} onChange={(e) => onUpdate('restaurant_name', e.target.value)} placeholder={t('landing.demoSetup.form.restaurantNamePlaceholder')} className={inputBase} />
          </div>
          <div>
            <FieldLabel htmlFor="cuisine_type" required>{t('landing.demoSetup.form.cuisineType')}</FieldLabel>
            <input id="cuisine_type" type="text" required value={form.cuisine_type} onChange={(e) => onUpdate('cuisine_type', e.target.value)} placeholder={t('landing.demoSetup.form.cuisineTypePlaceholder')} className={inputBase} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel htmlFor="city" required>{t('landing.demoSetup.form.city')}</FieldLabel>
              <input id="city" type="text" required value={form.city} onChange={(e) => onUpdate('city', e.target.value)} placeholder={t('landing.demoSetup.form.cityPlaceholder')} className={inputBase} />
            </div>
            <div>
              <FieldLabel htmlFor="country">{t('landing.demoSetup.form.country')}</FieldLabel>
              <input id="country" type="text" value={form.country} onChange={(e) => onUpdate('country', e.target.value)} placeholder={t('landing.demoSetup.form.countryPlaceholder')} className={inputBase} />
            </div>
          </div>
        </div>
      </div>

      <div className="h-px bg-border-gray" />

      {/* Group 2 — Hours & Capacity */}
      <div>
        <SectionLabel>{t('landing.demoSetup.form.sectionHours')}</SectionLabel>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel htmlFor="open_time">{t('landing.demoSetup.form.opensAt')}</FieldLabel>
              <input id="open_time" type="time" value={form.open_time} onChange={(e) => onUpdate('open_time', e.target.value)} className={inputBase} />
            </div>
            <div>
              <FieldLabel htmlFor="close_time">{t('landing.demoSetup.form.closesAt')}</FieldLabel>
              <input id="close_time" type="time" value={form.close_time} onChange={(e) => onUpdate('close_time', e.target.value)} className={inputBase} />
            </div>
          </div>
          <div className="max-w-[180px]">
            <FieldLabel htmlFor="max_party_size">{t('landing.demoSetup.form.maxPartySize')}</FieldLabel>
            <input id="max_party_size" type="number" min={1} max={100} value={form.max_party_size} onChange={(e) => onUpdate('max_party_size', Number(e.target.value))} className={inputBase} />
          </div>
        </div>
      </div>

      <div className="h-px bg-border-gray" />

      {/* Group 3 — Policies */}
      <div>
        <SectionLabel>{t('landing.demoSetup.form.sectionPolicies')} <span className="normal-case tracking-normal font-normal text-muted-stone/70">({t('landing.demoSetup.form.optional')})</span></SectionLabel>
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="cancellation_policy">{t('landing.demoSetup.form.cancellationPolicy')}</FieldLabel>
            <textarea id="cancellation_policy" rows={3} value={form.cancellation_policy} onChange={(e) => onUpdate('cancellation_policy', e.target.value)} placeholder={t('landing.demoSetup.form.cancellationPolicyPlaceholder')} className={textareaBase} />
          </div>
          <div>
            <FieldLabel htmlFor="custom_policy">{t('landing.demoSetup.form.houseRules')}</FieldLabel>
            <textarea id="custom_policy" rows={3} value={form.custom_policy} onChange={(e) => onUpdate('custom_policy', e.target.value)} placeholder={t('landing.demoSetup.form.houseRulesPlaceholder')} className={textareaBase} />
          </div>
        </div>
      </div>

      <div className="h-px bg-border-gray" />

      {/* Group 4 — About You */}
      <div>
        <SectionLabel>{t('landing.demoSetup.form.sectionAboutYou')}</SectionLabel>
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="contact_name" required>{t('landing.demoSetup.form.yourName')}</FieldLabel>
            <input id="contact_name" type="text" required value={form.contact_name} onChange={(e) => onUpdate('contact_name', e.target.value)} placeholder={t('landing.demoSetup.form.yourNamePlaceholder')} className={inputBase} />
          </div>
          <div>
            <FieldLabel htmlFor="contact_email" required>{t('landing.demoSetup.form.workEmail')}</FieldLabel>
            <input id="contact_email" type="email" required value={form.contact_email} onChange={(e) => onUpdate('contact_email', e.target.value)} placeholder={t('landing.demoSetup.form.workEmailPlaceholder')} className={inputBase} />
          </div>
        </div>
      </div>

      {submitError && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-red-600/10 border border-red-600/20 rounded-xl text-red-600 text-sm">
          {submitError}
        </motion.div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className={`w-full flex items-center justify-center gap-3 px-8 py-4 bg-burgundy hover:bg-burgundy-dark text-white text-[16px] font-semibold rounded-full transition-all duration-200 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
      >
        {isSubmitting ? (
          <>
            <div aria-hidden="true" className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
            <span>{t('landing.demoSetup.form.creating')}</span>
          </>
        ) : (
          <span>{t('landing.demoSetup.form.createButton')}</span>
        )}
      </button>

      <p className="text-center text-xs text-muted-stone font-light">{t('landing.demoSetup.form.noCreditCard')}</p>
    </form>
  );
}
