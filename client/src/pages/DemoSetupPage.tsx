/**
 * DemoSetupPage
 * Conversion-optimised form that lets prospects create a personalised demo
 * of Seatable for their restaurant. Submits to POST /api/demo?action=create
 * and hard-redirects to the returned demo_url on success.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
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

const INITIAL_FORM: DemoFormData = {
  restaurant_name: '',
  cuisine_type: '',
  city: '',
  country: '',
  open_time: '12:00',
  close_time: '23:00',
  max_party_size: 8,
  cancellation_policy: '',
  custom_policy: '',
  contact_name: '',
  contact_email: '',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[1.6px] text-muted-stone mb-4">
      {children}
    </p>
  );
}

function FieldLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[13px] font-medium text-stone-gray mb-1.5"
    >
      {children}
      {required && <span className="text-burgundy ml-0.5">*</span>}
    </label>
  );
}

const inputBase =
  'w-full px-4 py-3 border border-border-gray rounded-lg text-sm text-deep-charcoal placeholder-stone-300 bg-white focus:outline-none focus:ring-[3px] focus:ring-burgundy/20 focus:border-burgundy transition-all';

const textareaBase =
  'w-full px-4 py-3 border border-border-gray rounded-lg text-sm text-deep-charcoal placeholder-stone-300 bg-white focus:outline-none focus:ring-[3px] focus:ring-burgundy/20 focus:border-burgundy transition-all resize-none';

export default function DemoSetupPage() {
  const [form, setForm] = useState<DemoFormData>(INITIAL_FORM);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const update = (field: keyof DemoFormData, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/demo?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok || !data.demo_url) {
        throw new Error(data.error || 'Failed to create demo. Please try again.');
      }

      window.location.href = data.demo_url;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setSubmitError(message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-white text-deep-charcoal">
      {/* Minimal nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 sm:px-16 py-5 bg-[rgba(250,250,249,0.9)] backdrop-blur-xl border-b border-border-gray">
        <Link
          to="/"
          className="font-serif text-2xl font-semibold text-deep-charcoal tracking-tight"
        >
          seatable<span className="text-burgundy">.</span>
        </Link>
        <Link
          to="/login"
          className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors"
        >
          Already have an account? Sign in
        </Link>
      </nav>

      {/* Main content */}
      <main className="px-6 py-16 sm:py-24">
        <div className="max-w-[640px] mx-auto">
          {/* Headline */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="text-center mb-12"
          >
            {/* Badge */}
            <div className="inline-block text-xs font-semibold tracking-[1.5px] uppercase text-burgundy bg-burgundy/[6%] border border-burgundy/15 px-4 py-1.5 rounded-full mb-6">
              Free Demo
            </div>

            <h1 className="font-serif text-4xl sm:text-[44px] font-medium leading-[1.1] tracking-tight text-deep-charcoal mb-4">
              See Seatable running<br />
              <em className="text-burgundy">in your restaurant</em> in 2 minutes.
            </h1>

            <p className="text-[17px] text-warm-stone font-light leading-[1.7] max-w-[480px] mx-auto">
              Set up your personalised demo — your branding, your hours, your menu.
            </p>
          </motion.div>

          {/* Form card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <form
              onSubmit={handleSubmit}
              className="bg-white border border-border-gray rounded-[2rem] p-8 sm:p-10 shadow-xl space-y-8"
            >
              {/* Group 1 — Your Restaurant */}
              <div>
                <SectionLabel>Your Restaurant</SectionLabel>
                <div className="space-y-4">
                  <div>
                    <FieldLabel htmlFor="restaurant_name" required>
                      Restaurant name
                    </FieldLabel>
                    <input
                      id="restaurant_name"
                      type="text"
                      required
                      value={form.restaurant_name}
                      onChange={(e) => update('restaurant_name', e.target.value)}
                      placeholder="Bella Roma"
                      className={inputBase}
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="cuisine_type" required>
                      Cuisine type
                    </FieldLabel>
                    <input
                      id="cuisine_type"
                      type="text"
                      required
                      value={form.cuisine_type}
                      onChange={(e) => update('cuisine_type', e.target.value)}
                      placeholder="Italian · Mediterranean · Farm-to-table"
                      className={inputBase}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel htmlFor="city" required>
                        City
                      </FieldLabel>
                      <input
                        id="city"
                        type="text"
                        required
                        value={form.city}
                        onChange={(e) => update('city', e.target.value)}
                        placeholder="Madrid"
                        className={inputBase}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="country">
                        Country
                      </FieldLabel>
                      <input
                        id="country"
                        type="text"
                        value={form.country}
                        onChange={(e) => update('country', e.target.value)}
                        placeholder="Spain"
                        className={inputBase}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-border-gray" />

              {/* Group 2 — Hours & Capacity */}
              <div>
                <SectionLabel>Hours &amp; Capacity</SectionLabel>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <FieldLabel htmlFor="open_time">Opens at</FieldLabel>
                      <input
                        id="open_time"
                        type="time"
                        value={form.open_time}
                        onChange={(e) => update('open_time', e.target.value)}
                        className={inputBase}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="close_time">Closes at</FieldLabel>
                      <input
                        id="close_time"
                        type="time"
                        value={form.close_time}
                        onChange={(e) => update('close_time', e.target.value)}
                        className={inputBase}
                      />
                    </div>
                  </div>

                  <div className="max-w-[180px]">
                    <FieldLabel htmlFor="max_party_size">Max party size</FieldLabel>
                    <input
                      id="max_party_size"
                      type="number"
                      min={1}
                      max={100}
                      value={form.max_party_size}
                      onChange={(e) => update('max_party_size', Number(e.target.value))}
                      className={inputBase}
                    />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-border-gray" />

              {/* Group 3 — Policies */}
              <div>
                <SectionLabel>Policies <span className="normal-case tracking-normal font-normal text-muted-stone/70">(optional)</span></SectionLabel>
                <div className="space-y-4">
                  <div>
                    <FieldLabel htmlFor="cancellation_policy">
                      Cancellation policy
                    </FieldLabel>
                    <textarea
                      id="cancellation_policy"
                      rows={3}
                      value={form.cancellation_policy}
                      onChange={(e) => update('cancellation_policy', e.target.value)}
                      placeholder="Free cancellation up to 24h before"
                      className={textareaBase}
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="custom_policy">
                      House rules
                    </FieldLabel>
                    <textarea
                      id="custom_policy"
                      rows={3}
                      value={form.custom_policy}
                      onChange={(e) => update('custom_policy', e.target.value)}
                      placeholder="No outside cake, no pets on terrace..."
                      className={textareaBase}
                    />
                  </div>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-border-gray" />

              {/* Group 4 — About You */}
              <div>
                <SectionLabel>About You</SectionLabel>
                <div className="space-y-4">
                  <div>
                    <FieldLabel htmlFor="contact_name" required>
                      Your name
                    </FieldLabel>
                    <input
                      id="contact_name"
                      type="text"
                      required
                      value={form.contact_name}
                      onChange={(e) => update('contact_name', e.target.value)}
                      placeholder="Sofia"
                      className={inputBase}
                    />
                  </div>

                  <div>
                    <FieldLabel htmlFor="contact_email" required>
                      Work email
                    </FieldLabel>
                    <input
                      id="contact_email"
                      type="email"
                      required
                      value={form.contact_email}
                      onChange={(e) => update('contact_email', e.target.value)}
                      placeholder="sofia@bellaroma.com"
                      className={inputBase}
                    />
                  </div>
                </div>
              </div>

              {/* Error message */}
              {submitError && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-red-600/10 border border-red-600/20 rounded-xl text-red-600 text-sm"
                >
                  {submitError}
                </motion.div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className={`
                  w-full flex items-center justify-center gap-3 px-8 py-4
                  bg-burgundy hover:bg-burgundy-dark text-white text-[16px] font-semibold rounded-full
                  transition-all duration-200
                  ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}
                `}
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                    <span>Creating your demo…</span>
                  </>
                ) : (
                  <span>Create my demo →</span>
                )}
              </button>

              {/* Trust note */}
              <p className="text-center text-xs text-muted-stone font-light">
                No credit card required. Your demo is ready in seconds.
              </p>
            </form>
          </motion.div>

          {/* Trust indicators */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.4 }}
            className="mt-10 flex justify-center gap-10 text-center"
          >
            <div>
              <div className="text-xl font-serif font-bold text-deep-charcoal">2.3s</div>
              <div className="text-xs text-muted-stone uppercase tracking-wider">Avg Response</div>
            </div>
            <div className="w-px bg-border-gray" />
            <div>
              <div className="text-xl font-serif font-bold text-burgundy">6+</div>
              <div className="text-xs text-muted-stone uppercase tracking-wider">Languages</div>
            </div>
            <div className="w-px bg-border-gray" />
            <div>
              <div className="text-xl font-serif font-bold text-deep-charcoal">24/7</div>
              <div className="text-xs text-muted-stone uppercase tracking-wider">AI Booking</div>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
