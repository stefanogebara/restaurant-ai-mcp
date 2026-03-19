import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function TermsOfService() {
  const currentYear = new Date().getFullYear();
  const { i18n } = useTranslation();
  const showPtNotice = i18n.language === 'pt-BR' || i18n.language === 'pt';

  return (
    <div className="min-h-screen bg-warm-white">
      <nav className="flex items-center justify-between px-6 sm:px-16 py-6 border-b border-border-gray">
        <Link to="/" className="font-serif text-2xl font-semibold text-deep-charcoal tracking-tight hover:opacity-80 transition-opacity">
          seatable<span className="text-burgundy">.</span>
        </Link>
      </nav>

      <div className="max-w-[720px] mx-auto px-6 py-16">
        {showPtNotice && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3.5 mb-8">
            <p className="text-sm text-amber-800">
              Esta p&aacute;gina est&aacute; dispon&iacute;vel apenas em ingl&ecirc;s. Estamos trabalhando na tradu&ccedil;&atilde;o.
            </p>
          </div>
        )}
        <h1 className="font-serif text-4xl font-medium text-deep-charcoal mb-2">Terms of Service</h1>
        <p className="text-sm text-warm-stone mb-12">Last updated: January 2025</p>

        <div className="space-y-10 text-[15px] text-warm-stone leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">1. Acceptance of Terms</h2>
            <p>By creating an account or using Seatable ("the Service"), you agree to these Terms of Service. If you do not agree, do not use the Service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">2. Description of Service</h2>
            <p>Seatable provides AI-powered restaurant management software including reservation management, AI voice and chat agents, waitlist management, analytics, and related features on a subscription basis.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">3. Subscriptions and Billing</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>Subscriptions are billed monthly in EUR.</li>
              <li>Usage-based fees apply for reservations, AI calls, SMS, and WhatsApp messages beyond your plan's included limits.</li>
              <li>You may cancel at any time; your subscription remains active until the end of the billing period.</li>
              <li>No refunds are issued for partial months.</li>
              <li>Prices may change with 30 days' notice.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">4. Your Responsibilities</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>You are responsible for the accuracy of data you enter and for obtaining consent from your guests to process their data.</li>
              <li>You must not use the Service for unlawful purposes.</li>
              <li>You must keep your login credentials secure.</li>
              <li>You are responsible for complying with local laws applicable to your restaurant, including data protection regulations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">5. Acceptable Use</h2>
            <p>You may not: reverse-engineer the Service; resell or sublicense access; use the Service to send spam; or interfere with the Service's infrastructure.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">6. Intellectual Property</h2>
            <p>All software, designs, and content in the Service are owned by Seatable. You retain ownership of data you submit to the Service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">7. Availability and Uptime</h2>
            <p>We target 99.9% uptime but do not guarantee uninterrupted service. Planned maintenance will be communicated in advance.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">8. Limitation of Liability</h2>
            <p>To the maximum extent permitted by law, Seatable is not liable for indirect, incidental, or consequential damages. Our total liability is limited to the amount you paid in the 3 months preceding a claim.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">9. Termination</h2>
            <p>We may suspend or terminate accounts that violate these Terms. You may cancel your account at any time through the subscription management page.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">10. Changes to Terms</h2>
            <p>We may update these Terms. We will notify you by email 14 days before material changes take effect. Continued use constitutes acceptance.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">11. Governing Law</h2>
            <p>These Terms are governed by the laws of Spain. Disputes shall be resolved in the courts of Madrid.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">12. Contact</h2>
            <p><a href="mailto:hello@seatable.one" className="text-burgundy hover:underline">hello@seatable.one</a></p>
          </section>
        </div>

        <p className="mt-16 text-xs text-muted-stone">&copy; {currentYear} Seatable. All rights reserved.</p>
      </div>
    </div>
  );
}
