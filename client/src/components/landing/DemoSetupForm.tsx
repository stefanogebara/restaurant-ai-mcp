import { motion } from 'framer-motion';

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
  return (
    <form onSubmit={onSubmit} className="bg-white border border-border-gray rounded-[2rem] p-8 sm:p-10 shadow-xl space-y-8">
      {/* Group 1 — Your Restaurant */}
      <div>
        <SectionLabel>Your Restaurant</SectionLabel>
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="restaurant_name" required>Restaurant name</FieldLabel>
            <input id="restaurant_name" type="text" required value={form.restaurant_name} onChange={(e) => onUpdate('restaurant_name', e.target.value)} placeholder="Bella Roma" className={inputBase} />
          </div>
          <div>
            <FieldLabel htmlFor="cuisine_type" required>Cuisine type</FieldLabel>
            <input id="cuisine_type" type="text" required value={form.cuisine_type} onChange={(e) => onUpdate('cuisine_type', e.target.value)} placeholder="Italian · Mediterranean · Farm-to-table" className={inputBase} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel htmlFor="city" required>City</FieldLabel>
              <input id="city" type="text" required value={form.city} onChange={(e) => onUpdate('city', e.target.value)} placeholder="Madrid" className={inputBase} />
            </div>
            <div>
              <FieldLabel htmlFor="country">Country</FieldLabel>
              <input id="country" type="text" value={form.country} onChange={(e) => onUpdate('country', e.target.value)} placeholder="Spain" className={inputBase} />
            </div>
          </div>
        </div>
      </div>

      <div className="h-px bg-border-gray" />

      {/* Group 2 — Hours & Capacity */}
      <div>
        <SectionLabel>Hours &amp; Capacity</SectionLabel>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel htmlFor="open_time">Opens at</FieldLabel>
              <input id="open_time" type="time" value={form.open_time} onChange={(e) => onUpdate('open_time', e.target.value)} className={inputBase} />
            </div>
            <div>
              <FieldLabel htmlFor="close_time">Closes at</FieldLabel>
              <input id="close_time" type="time" value={form.close_time} onChange={(e) => onUpdate('close_time', e.target.value)} className={inputBase} />
            </div>
          </div>
          <div className="max-w-[180px]">
            <FieldLabel htmlFor="max_party_size">Max party size</FieldLabel>
            <input id="max_party_size" type="number" min={1} max={100} value={form.max_party_size} onChange={(e) => onUpdate('max_party_size', Number(e.target.value))} className={inputBase} />
          </div>
        </div>
      </div>

      <div className="h-px bg-border-gray" />

      {/* Group 3 — Policies */}
      <div>
        <SectionLabel>Policies <span className="normal-case tracking-normal font-normal text-muted-stone/70">(optional)</span></SectionLabel>
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="cancellation_policy">Cancellation policy</FieldLabel>
            <textarea id="cancellation_policy" rows={3} value={form.cancellation_policy} onChange={(e) => onUpdate('cancellation_policy', e.target.value)} placeholder="Free cancellation up to 24h before" className={textareaBase} />
          </div>
          <div>
            <FieldLabel htmlFor="custom_policy">House rules</FieldLabel>
            <textarea id="custom_policy" rows={3} value={form.custom_policy} onChange={(e) => onUpdate('custom_policy', e.target.value)} placeholder="No outside cake, no pets on terrace..." className={textareaBase} />
          </div>
        </div>
      </div>

      <div className="h-px bg-border-gray" />

      {/* Group 4 — About You */}
      <div>
        <SectionLabel>About You</SectionLabel>
        <div className="space-y-4">
          <div>
            <FieldLabel htmlFor="contact_name" required>Your name</FieldLabel>
            <input id="contact_name" type="text" required value={form.contact_name} onChange={(e) => onUpdate('contact_name', e.target.value)} placeholder="Sofia" className={inputBase} />
          </div>
          <div>
            <FieldLabel htmlFor="contact_email" required>Work email</FieldLabel>
            <input id="contact_email" type="email" required value={form.contact_email} onChange={(e) => onUpdate('contact_email', e.target.value)} placeholder="sofia@bellaroma.com" className={inputBase} />
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
            <span>Creating your demo…</span>
          </>
        ) : (
          <span>Create my demo →</span>
        )}
      </button>

      <p className="text-center text-xs text-muted-stone font-light">No credit card required. Your demo is ready in seconds.</p>
    </form>
  );
}
