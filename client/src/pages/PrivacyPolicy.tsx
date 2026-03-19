import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function PrivacyPolicy() {
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
        <h1 className="font-serif text-4xl font-medium text-deep-charcoal mb-2">Privacy Policy</h1>
        <p className="text-sm text-warm-stone mb-12">Last updated: January 2025</p>

        <div className="space-y-10 text-[15px] text-warm-stone leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">1. Who we are</h2>
            <p>Seatable operates the restaurant management platform at seatable.one ("the Service"). We are the data controller for personal data you provide to us.</p>
            <p className="mt-2">Contact: <a href="mailto:hello@seatable.one" className="text-burgundy hover:underline">hello@seatable.one</a></p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">2. Data we collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>Account data:</strong> name, email address, restaurant information provided during registration and onboarding.</li>
              <li><strong>Usage data:</strong> reservation records, waitlist entries, table configurations, and call logs created while using the Service.</li>
              <li><strong>Customer data:</strong> names, phone numbers, and reservation preferences of your restaurant's guests entered by you or your staff.</li>
              <li><strong>Payment data:</strong> billing information processed by Stripe. We do not store card details.</li>
              <li><strong>Technical data:</strong> IP addresses, browser type, and usage logs for security and performance monitoring.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">3. How we use your data</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>To provide and improve the Service.</li>
              <li>To process payments and manage subscriptions.</li>
              <li>To send service-related communications (reservation confirmations, reminders).</li>
              <li>To comply with legal obligations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">4. Legal basis (GDPR)</h2>
            <p>We process your data on the basis of: (a) contract performance — to provide the Service you subscribed to; (b) legitimate interests — to maintain security and improve the Service; (c) legal obligation — to comply with applicable law; and (d) consent — where you have given it.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">5. Data retention</h2>
            <p>We retain your data for as long as your account is active or as needed to provide the Service. You may request deletion at any time by contacting us. We retain billing records for 7 years to comply with tax law.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">6. Third-party services</h2>
            <p>We use the following sub-processors:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Supabase</strong> — database hosting (EU region)</li>
              <li><strong>Stripe</strong> — payment processing</li>
              <li><strong>Anthropic / OpenAI</strong> — AI processing for reservation conversations</li>
              <li><strong>ElevenLabs / Cartesia</strong> — voice synthesis</li>
              <li><strong>Twilio / Meta</strong> — SMS and WhatsApp messaging</li>
              <li><strong>Resend</strong> — transactional email</li>
              <li><strong>Vercel</strong> — hosting infrastructure</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">7. Your rights</h2>
            <p>Under GDPR you have the right to: access, rectify, or erase your personal data; restrict or object to processing; and data portability. To exercise any right, email <a href="mailto:hello@seatable.one" className="text-burgundy hover:underline">hello@seatable.one</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">8. Cookies</h2>
            <p>We use essential cookies for authentication and session management. We do not use tracking or advertising cookies.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">9. Contact</h2>
            <p>For privacy questions: <a href="mailto:hello@seatable.one" className="text-burgundy hover:underline">hello@seatable.one</a></p>
          </section>
        </div>

        <p className="mt-16 text-xs text-muted-stone">&copy; {currentYear} Seatable. All rights reserved.</p>
      </div>
    </div>
  );
}
