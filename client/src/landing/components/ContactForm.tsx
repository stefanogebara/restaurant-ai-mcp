import { useState } from 'react';
import { motion } from 'framer-motion';
import { Send, Mail, CheckCircle } from 'lucide-react';
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // Simulate form submission (in production, this would send to an API)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Create mailto link with form data
    const subject = `Restaurant AI MCP Inquiry from ${formData.name}`;
    const body = `
Name: ${formData.name}
Email: ${formData.email}
Phone: ${formData.phone || 'Not provided'}
Restaurant: ${formData.restaurant}
Number of Tables: ${formData.tables || 'Not provided'}

Message:
${formData.message}
    `.trim();

    window.location.href = `mailto:${CONTACT_INFO.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    setIsSubmitting(false);
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
    <section id="contact" className="relative py-24 bg-[#0a0a0f] overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 section-gradient-3 opacity-50" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="gradient-text">Get Started</span> Today
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            Schedule a personalized demo and discover how Restaurant AI MCP can transform your
            operations
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
            <div className="glass-card p-8">
              <h3 className="text-2xl font-bold text-white mb-6">Contact Information</h3>

              <div className="space-y-6">
                {/* Email */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0">
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Email</div>
                    <a
                      href={`mailto:${CONTACT_INFO.email}`}
                      className="text-white font-semibold hover:text-indigo-400 transition-colors"
                    >
                      {CONTACT_INFO.email}
                    </a>
                  </div>
                </div>

                {/* Response Time */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Response Time</div>
                    <div className="text-white font-semibold">Within 24 hours</div>
                  </div>
                </div>
              </div>
            </div>

            {/* What to Expect */}
            <div className="glass-subtle p-6 rounded-2xl">
              <h4 className="text-lg font-bold text-white mb-4">What to Expect</h4>
              <div className="space-y-3">
                {[
                  'Personalized 30-minute demo call',
                  'Custom pricing based on your needs',
                  'Technical consultation with our team',
                  'Free trial to test the platform',
                ].map((item, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-300 text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Trust Indicators */}
            <div className="glass-subtle p-6 rounded-2xl">
              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-3xl font-bold gradient-text">99.9%</div>
                  <div className="text-xs text-gray-400 mt-1">Uptime</div>
                </div>
                <div>
                  <div className="text-3xl font-bold gradient-text-emerald">94%</div>
                  <div className="text-xs text-gray-400 mt-1">Satisfaction</div>
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
            <form onSubmit={handleSubmit} className="glass-card p-8 space-y-6">
              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                  Full Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-4 py-3 glass-input text-white placeholder-gray-500"
                  placeholder="John Smith"
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Email Address <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 glass-input text-white placeholder-gray-500"
                  placeholder="john@restaurant.com"
                />
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-300 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-3 glass-input text-white placeholder-gray-500"
                  placeholder="+1 (555) 123-4567"
                />
              </div>

              {/* Restaurant Name */}
              <div>
                <label htmlFor="restaurant" className="block text-sm font-medium text-gray-300 mb-2">
                  Restaurant Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  id="restaurant"
                  name="restaurant"
                  required
                  value={formData.restaurant}
                  onChange={handleChange}
                  className="w-full px-4 py-3 glass-input text-white placeholder-gray-500"
                  placeholder="La Bella Vista"
                />
              </div>

              {/* Number of Tables */}
              <div>
                <label htmlFor="tables" className="block text-sm font-medium text-gray-300 mb-2">
                  Number of Tables
                </label>
                <input
                  type="number"
                  id="tables"
                  name="tables"
                  value={formData.tables}
                  onChange={handleChange}
                  className="w-full px-4 py-3 glass-input text-white placeholder-gray-500"
                  placeholder="12"
                  min="1"
                />
              </div>

              {/* Message */}
              <div>
                <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-2">
                  Tell us about your needs <span className="text-red-400">*</span>
                </label>
                <textarea
                  id="message"
                  name="message"
                  required
                  value={formData.message}
                  onChange={handleChange}
                  rows={4}
                  className="w-full px-4 py-3 glass-input text-white placeholder-gray-500 resize-none"
                  placeholder="I'm interested in implementing Restaurant AI MCP for my restaurant..."
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || isSubmitted}
                className="w-full px-6 py-4 glass-button-primary text-white font-semibold text-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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

              {/* Privacy Note */}
              <p className="text-xs text-gray-500 text-center">
                By submitting this form, you agree to our Terms of Service and Privacy Policy
              </p>
            </form>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
