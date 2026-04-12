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
        <h1 className="font-serif text-4xl font-medium text-deep-charcoal mb-2">
          {showPtNotice ? 'Termos de Servi\u00e7o' : 'Terms of Service'}
        </h1>
        <p className="text-sm text-warm-stone mb-12">
          {showPtNotice ? '\u00daltima atualiza\u00e7\u00e3o: janeiro de 2025' : 'Last updated: January 2025'}
        </p>

        <div className="space-y-10 text-[15px] text-warm-stone leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '1. Aceita\u00e7\u00e3o dos Termos' : '1. Acceptance of Terms'}
            </h2>
            <p>{showPtNotice
              ? 'Ao criar uma conta ou usar o Seatable ("o Servi\u00e7o"), voc\u00ea concorda com estes Termos de Servi\u00e7o. Se voc\u00ea n\u00e3o concordar, n\u00e3o utilize o Servi\u00e7o.'
              : 'By creating an account or using Seatable ("the Service"), you agree to these Terms of Service. If you do not agree, do not use the Service.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '2. Descri\u00e7\u00e3o do Servi\u00e7o' : '2. Description of Service'}
            </h2>
            <p>{showPtNotice
              ? 'O Seatable fornece software de gest\u00e3o de restaurantes com intelig\u00eancia artificial, incluindo gest\u00e3o de reservas, agentes de voz e chat com IA, gest\u00e3o de lista de espera, an\u00e1lises e recursos relacionados por assinatura.'
              : 'Seatable provides AI-powered restaurant management software including reservation management, AI voice and chat agents, waitlist management, analytics, and related features on a subscription basis.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '3. Assinaturas e Cobran\u00e7a' : '3. Subscriptions and Billing'}
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              {showPtNotice ? (
                <>
                  <li>As assinaturas s\u00e3o cobradas mensalmente em BRL (Real Brasileiro).</li>
                  <li>Taxas baseadas em uso se aplicam para reservas, chamadas de IA, SMS e mensagens WhatsApp al\u00e9m dos limites do seu plano.</li>
                  <li>Voc\u00ea pode cancelar a qualquer momento; sua assinatura permanece ativa at\u00e9 o final do per\u00edodo de cobran\u00e7a.</li>
                  <li>N\u00e3o s\u00e3o emitidos reembolsos para meses parciais.</li>
                  <li>Os pre\u00e7os podem mudar com 30 dias de aviso pr\u00e9vio.</li>
                </>
              ) : (
                <>
                  <li>Subscriptions are billed monthly in BRL (Brazilian Real).</li>
                  <li>Usage-based fees apply for reservations, AI calls, SMS, and WhatsApp messages beyond your plan's included limits.</li>
                  <li>You may cancel at any time; your subscription remains active until the end of the billing period.</li>
                  <li>No refunds are issued for partial months.</li>
                  <li>Prices may change with 30 days' notice.</li>
                </>
              )}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '4. Suas Responsabilidades' : '4. Your Responsibilities'}
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              {showPtNotice ? (
                <>
                  <li>Voc\u00ea \u00e9 respons\u00e1vel pela precis\u00e3o dos dados inseridos e por obter consentimento dos seus clientes para processar seus dados.</li>
                  <li>Voc\u00ea n\u00e3o deve usar o Servi\u00e7o para fins il\u00edcitos.</li>
                  <li>Voc\u00ea deve manter suas credenciais de login seguras.</li>
                  <li>Voc\u00ea \u00e9 respons\u00e1vel por cumprir as leis locais aplic\u00e1veis ao seu restaurante, incluindo regulamentos de prote\u00e7\u00e3o de dados.</li>
                </>
              ) : (
                <>
                  <li>You are responsible for the accuracy of data you enter and for obtaining consent from your guests to process their data.</li>
                  <li>You must not use the Service for unlawful purposes.</li>
                  <li>You must keep your login credentials secure.</li>
                  <li>You are responsible for complying with local laws applicable to your restaurant, including data protection regulations.</li>
                </>
              )}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '5. Uso Aceit\u00e1vel' : '5. Acceptable Use'}
            </h2>
            <p>{showPtNotice
              ? 'Voc\u00ea n\u00e3o pode: fazer engenharia reversa do Servi\u00e7o; revender ou sublicenciar o acesso; usar o Servi\u00e7o para enviar spam; ou interferir na infraestrutura do Servi\u00e7o.'
              : 'You may not: reverse-engineer the Service; resell or sublicense access; use the Service to send spam; or interfere with the Service\'s infrastructure.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '6. Propriedade Intelectual' : '6. Intellectual Property'}
            </h2>
            <p>{showPtNotice
              ? 'Todo software, designs e conte\u00fado do Servi\u00e7o s\u00e3o de propriedade da Seatable. Voc\u00ea mant\u00e9m a propriedade dos dados que envia ao Servi\u00e7o.'
              : 'All software, designs, and content in the Service are owned by Seatable. You retain ownership of data you submit to the Service.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '7. Disponibilidade e Uptime' : '7. Availability and Uptime'}
            </h2>
            <p>{showPtNotice
              ? 'Buscamos 99,9% de uptime, mas n\u00e3o garantimos servi\u00e7o ininterrupto. Manuten\u00e7\u00f5es planejadas ser\u00e3o comunicadas com anteced\u00eancia.'
              : 'We target 99.9% uptime but do not guarantee uninterrupted service. Planned maintenance will be communicated in advance.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '8. Limita\u00e7\u00e3o de Responsabilidade' : '8. Limitation of Liability'}
            </h2>
            <p>{showPtNotice
              ? 'Na m\u00e1xima extens\u00e3o permitida por lei, a Seatable n\u00e3o \u00e9 respons\u00e1vel por danos indiretos, incidentais ou consequenciais. Nossa responsabilidade total \u00e9 limitada ao valor pago nos 3 meses anteriores \u00e0 reclama\u00e7\u00e3o.'
              : 'To the maximum extent permitted by law, Seatable is not liable for indirect, incidental, or consequential damages. Our total liability is limited to the amount you paid in the 3 months preceding a claim.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '9. Rescis\u00e3o' : '9. Termination'}
            </h2>
            <p>{showPtNotice
              ? 'Podemos suspender ou encerrar contas que violem estes Termos. Voc\u00ea pode cancelar sua conta a qualquer momento pela p\u00e1gina de gerenciamento de assinatura.'
              : 'We may suspend or terminate accounts that violate these Terms. You may cancel your account at any time through the subscription management page.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '10. Altera\u00e7\u00f5es nos Termos' : '10. Changes to Terms'}
            </h2>
            <p>{showPtNotice
              ? 'Podemos atualizar estes Termos. Notificaremos voc\u00ea por e-mail 14 dias antes de altera\u00e7\u00f5es significativas entrarem em vigor. O uso continuado constitui aceita\u00e7\u00e3o.'
              : 'We may update these Terms. We will notify you by email 14 days before material changes take effect. Continued use constitutes acceptance.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '11. Legisla\u00e7\u00e3o Aplic\u00e1vel' : '11. Governing Law'}
            </h2>
            <p>{showPtNotice
              ? 'Estes Termos s\u00e3o regidos pelas leis do Brasil. Disputas ser\u00e3o resolvidas nos tribunais de S\u00e3o Paulo, SP, Brasil.'
              : 'These Terms are governed by the laws of Brazil. Disputes shall be resolved in the courts of S\u00e3o Paulo, SP, Brazil.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '12. Contato' : '12. Contact'}
            </h2>
            <p><a href="mailto:hello@seatable.one" className="text-burgundy hover:underline">hello@seatable.one</a></p>
          </section>
        </div>

        <p className="mt-16 text-xs text-muted-stone">&copy; {currentYear} Seatable. All rights reserved.</p>
      </div>
    </div>
  );
}
