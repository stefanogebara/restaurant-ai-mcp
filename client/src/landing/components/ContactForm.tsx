import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Mail, CheckCircle, Clock } from 'lucide-react';
import { CONTACT_INFO } from '../data/demoData';
import { supabase } from '../../lib/supabase';

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    const { error } = await supabase.from('contact_submissions').insert({
      name: formData.name,
      email: formData.email,
      phone: formData.phone || null,
      restaurant_name: formData.restaurant,
      num_tables: formData.tables ? parseInt(formData.tables, 10) : null,
      message: formData.message,
    });

    setIsSubmitting(false);

    if (error) {
      setSubmitError('Something went wrong. Please try again or email us directly.');
      return;
    }

    setIsSubmitted(true);

    // Reset form after 3 seconds
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
          <h2 className="font-serif text-3xl md:text-4xl italic mb-4 text-[#1C1917]">
            Get Started Today
          </h2>
          <div className="w-16 h-0.5 bg-[#9F1239] mx-auto opacity-50 mb-6"></div>
          <p className="text-lg text-[#57534E] max-w-2xl mx-auto font-light">
            Schedule a personalized demo and discover how Seatable can transform your operations
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
            <div className="bg-[#1C1917] p-8 rounded-[2rem]">
              <h3 className="font-serif text-2xl text-white mb-6">Contact Information</h3>

              <div className="space-y-6">
                {/* Email */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#9F1239] flex items-center justify-center flex-shrink-0">
                    <Mail className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-sm text-[#A8A29E] mb-1 font-light">Email</div>
                    <a
                      href={`mailto:${CONTACT_INFO.email}`}
                      className="text-white font-medium hover:text-[#9F1239] transition-colors"
                    >
                      support@seatable.io
                    </a>
                  </div>
                </div>

                {/* Response Time */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-sm text-[#A8A29E] mb-1 font-light">Response Time</div>
                    <div className="text-white font-medium">Within 24 hours</div>
                  </div>
                </div>
              </div>
            </div>

            {/* What to Expect */}
            <div className="bg-[#FAFAF9] p-6 rounded-[2rem] border border-[#E7E5E4]">
              <h4 className="font-serif text-lg text-[#1C1917] mb-4">What to Expect</h4>
              <div className="space-y-3">
                {[
                  'Personalized 30-minute demo call',
                  'Custom pricing based on your needs',
                  'Technical consultation with our team',
                  'Free trial to test the platform',
                ].map((item, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#9F1239]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CheckCircle className="w-3 h-3 text-[#9F1239]" />
                    </div>
                    <span className="text-[#57534E] text-sm font-light">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trust Indicators */}
            <div className="bg-[#FAFAF9] p-6 rounded-[2rem] border border-[#E7E5E4]">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-serif font-bold text-[#9F1239]">24/7</div>
                  <div className="text-xs text-[#57534E] mt-1 uppercase tracking-wider">AI Uptime</div>
                </div>
                <div>
                  <div className="text-2xl font-serif font-bold text-[#1C1917]">2.3s</div>
                  <div className="text-xs text-[#57534E] mt-1 uppercase tracking-wider">Response</div>
                </div>
                <div>
                  <div className="text-2xl font-serif font-bold text-[#1C1917]">6+</div>
                  <div className="text-xs text-[#57534E] mt-1 uppercase tracking-wider">Languages</div>
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
            <form onSubmit={handleSubmit} className="bg-[#FAFAF9] p-8 rounded-[2rem] border border-[#E7E5E4] space-y-5">
              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-[#1C1917] mb-2">
                  Full Name <span className="text-[#9F1239]">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239] transition-all"
                  placeholder="John Smith"
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#1C1917] mb-2">
                  Email Address <span className="text-[#9F1239]">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239] transition-all"
                  placeholder="john@restaurant.com"
                />
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-[#1C1917] mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239] transition-all"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              {/* Restaurant Name */}
              <div>
                <label htmlFor="restaurant" className="block text-sm font-medium text-[#1C1917] mb-2">
                  Restaurant Name <span className="text-[#9F1239]">*</span>
                </label>
                <input
                  type="text"
                  id="restaurant"
                  name="restaurant"
                  required
                  value={formData.restaurant}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239] transition-all"
                  placeholder="La Bella Vista"
                />
              </div>

              {/* Number of Tables */}
              <div>
                <label htmlFor="tables" className="block text-sm font-medium text-[#1C1917] mb-2">
                  Number of Tables
                </label>
                <input
                  type="number"
                  id="tables"
                  name="tables"
                  value={formData.tables}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239] transition-all"
                  placeholder="12"
                  min="1"
                />
              </div>

              {/* Message */}
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-[#1C1917] mb-2">
                  Tell us about your needs <span className="text-[#9F1239]">*</span>
                </label>
                <textarea
                  id="message"
                  name="message"
                  required
                  value={formData.message}
                  onChange={handleChange}
                  rows={4}
                  className="w-full px-4 py-3 bg-white border border-[#E7E5E4] rounded-xl text-[#1C1917] placeholder-[#A8A29E] focus:outline-none focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239] transition-all resize-none"
                  placeholder="I'm interested in implementing Seatable for my restaurant..."
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || isSubmitted}
                className="w-full px-6 py-4 bg-[#9F1239] text-white text-sm tracking-widest uppercase font-bold hover:bg-[#881337] transition-all duration-300 rounded-2xl shadow-xl shadow-[#9F1239]/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitted ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Message Sent!
                  </>
                ) : isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
                <p className="text-sm text-[#dc2626] text-center">{submitError}</p>
              )}

              {/* Privacy Note */}
              <p className="text-xs text-[#A8A29E] text-center font-light">
                By submitting this form, you agree to be contacted regarding your inquiry.
              </p>
            </form>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
