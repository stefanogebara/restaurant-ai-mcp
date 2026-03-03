import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Mail, CheckCircle, Clock } from 'lucide-react';
import { CONTACT_INFO } from '../data/demoData';

export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    restaurant: '',
    tables: '',
    message: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (fieldErrors[name]) {
      setFieldErrors({ ...fieldErrors, [name]: '' });
    }
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!formData.name.trim()) errors.name = 'Full name is required';
    if (!formData.email.trim()) errors.email = 'Email address is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Please enter a valid email address';
    if (!formData.restaurant.trim()) errors.restaurant = 'Restaurant name is required';
    if (!formData.message.trim()) errors.message = 'Please tell us about your needs';
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone || undefined,
          restaurant: formData.restaurant || undefined,
          tables: formData.tables || undefined,
          message: formData.message,
        }),
      });
      if (!res.ok) throw new Error('Failed to send message');
    } catch {
      setIsSubmitting(false);
      setSubmitError('Something went wrong. Please try again or email us directly.');
      return;
    }

    setIsSubmitting(false);
    setIsSubmitted(true);

    setTimeout(() => {
      setFormData({
        name: '',
        email: '',
        phone: '',
        restaurant: '',
        tables: '',
        message: '',
      });
      setIsSubmitted(false);
    }, 3000);
  };

  return (
    <section id="contact" className="py-24 px-6 bg-white">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-4">Contact</div>
          <h2 className="font-serif text-4xl sm:text-[48px] font-medium tracking-tight text-deep-charcoal mb-3">
            Get started today
          </h2>
          <p className="text-lg text-stone-gray max-w-2xl mx-auto font-light">
            Schedule a personalized demo and discover how seatable can transform your operations
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Left Column - Contact Info */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            <div className="bg-deep-charcoal p-8 rounded-2xl">
              <h3 className="font-serif text-2xl text-white mb-6">Contact Information</h3>

              <div className="space-y-6">
                {/* Email */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-burgundy flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-stone mb-1 font-light">Email</div>
                    <a
                      href={`mailto:${CONTACT_INFO.email}`}
                      className="text-white font-medium hover:text-burgundy transition-colors"
                    >
                      {CONTACT_INFO.email}
                    </a>
                  </div>
                </div>

                {/* Response Time */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-sm text-muted-stone mb-1 font-light">Response Time</div>
                    <div className="text-white font-medium">Within 24 hours</div>
                  </div>
                </div>
              </div>
            </div>

            {/* What to Expect */}
            <div className="bg-warm-white p-6 rounded-2xl border border-border-gray">
              <h4 className="font-serif text-lg text-deep-charcoal mb-4">What to Expect</h4>
              <div className="space-y-3">
                {[
                  'Personalized 30-minute demo call',
                  'Custom pricing based on your needs',
                  'Technical consultation with our team',
                  'Free trial to test the platform',
                ].map((item, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-burgundy/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle className="w-3 h-3 text-burgundy" />
                    </div>
                    <span className="text-stone-gray text-sm font-light">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trust Indicators */}
            <div className="bg-warm-white p-6 rounded-2xl border border-border-gray">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-serif font-bold text-burgundy">24/7</div>
                  <div className="text-xs text-stone-gray mt-1 uppercase tracking-wider">AI Uptime</div>
                </div>
                <div>
                  <div className="text-2xl font-serif font-bold text-deep-charcoal">2.3s</div>
                  <div className="text-xs text-stone-gray mt-1 uppercase tracking-wider">Response</div>
                </div>
                <div>
                  <div className="text-2xl font-serif font-bold text-deep-charcoal">6+</div>
                  <div className="text-xs text-stone-gray mt-1 uppercase tracking-wider">Languages</div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Column - Contact Form */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <form onSubmit={handleSubmit} className="bg-warm-white p-8 rounded-2xl border border-border-gray space-y-5">
              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-deep-charcoal mb-2">
                  Full Name <span className="text-burgundy">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 bg-white border rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-all ${fieldErrors.name ? 'border-red-400' : 'border-border-gray'}`}
                  placeholder="John Smith"
                />
                {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-deep-charcoal mb-2">
                  Email Address <span className="text-burgundy">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 bg-white border rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-all ${fieldErrors.email ? 'border-red-400' : 'border-border-gray'}`}
                  placeholder="john@restaurant.com"
                />
                {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-deep-charcoal mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-white border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-all"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              {/* Restaurant Name */}
              <div>
                <label htmlFor="restaurant" className="block text-sm font-medium text-deep-charcoal mb-2">
                  Restaurant Name <span className="text-burgundy">*</span>
                </label>
                <input
                  type="text"
                  id="restaurant"
                  name="restaurant"
                  value={formData.restaurant}
                  onChange={handleChange}
                  className={`w-full px-4 py-3 bg-white border rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-all ${fieldErrors.restaurant ? 'border-red-400' : 'border-border-gray'}`}
                  placeholder="La Bella Vista"
                />
                {fieldErrors.restaurant && <p className="mt-1 text-xs text-red-600">{fieldErrors.restaurant}</p>}
              </div>

              {/* Number of Tables */}
              <div>
                <label htmlFor="tables" className="block text-sm font-medium text-deep-charcoal mb-2">
                  Number of Tables
                </label>
                <input
                  type="number"
                  id="tables"
                  name="tables"
                  value={formData.tables}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-white border border-border-gray rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-all"
                  placeholder="12"
                  min="1"
                />
              </div>

              {/* Message */}
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-deep-charcoal mb-2">
                  Tell us about your needs <span className="text-burgundy">*</span>
                </label>
                <textarea
                  id="message"
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  rows={4}
                  className={`w-full px-4 py-3 bg-white border rounded-xl text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy transition-all resize-none ${fieldErrors.message ? 'border-red-400' : 'border-border-gray'}`}
                  placeholder="I'm interested in implementing seatable for my restaurant..."
                />
                {fieldErrors.message && <p className="mt-1 text-xs text-red-600">{fieldErrors.message}</p>}
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || isSubmitted}
                className="w-full px-6 py-4 bg-burgundy text-white text-[15px] font-semibold hover:bg-burgundy-dark transition-all duration-300 rounded-2xl  flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitted ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Message Sent!
                  </>
                ) : isSubmitting ? (
                  <>
                    <div aria-hidden="true" className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Send Message
                  </>
                )}
              </button>

              {/* Error Message */}
              {submitError && (
                <p className="text-sm text-red-600 text-center">{submitError}</p>
              )}

              {/* Privacy Note */}
              <p className="text-xs text-muted-stone text-center font-light">
                By submitting this form, you agree to be contacted regarding your inquiry.
              </p>
            </form>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
