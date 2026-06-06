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
          {showPtNotice ? 'Termos de Serviço' : 'Terms of Service'}
        </h1>
        <p className="text-sm text-warm-stone mb-12">
          {showPtNotice ? 'Última atualização: junho de 2026' : 'Last updated: June 2026'}
        </p>

        <div className="space-y-10 text-[15px] text-warm-stone leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '1. Aceitação dos Termos' : '1. Acceptance of Terms'}
            </h2>
            <p>{showPtNotice
              ? 'Ao criar uma conta ou usar o Seatable ("o Serviço"), você concorda com estes Termos de Serviço. Se você não concordar, não utilize o Serviço.'
              : 'By creating an account or using Seatable ("the Service"), you agree to these Terms of Service. If you do not agree, do not use the Service.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '2. Descrição do Serviço' : '2. Description of Service'}
            </h2>
            <p>{showPtNotice
              ? 'O Seatable fornece software de gestão de restaurantes com inteligência artificial, incluindo gestão de reservas, agentes de voz e chat com IA, gestão de lista de espera, análises e recursos relacionados por assinatura.'
              : 'Seatable provides AI-powered restaurant management software including reservation management, AI voice and chat agents, waitlist management, analytics, and related features on a subscription basis.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '3. Assinaturas e Cobrança' : '3. Subscriptions and Billing'}
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              {showPtNotice ? (
                <>
                  <li>As assinaturas são cobradas mensalmente em BRL (Real Brasileiro).</li>
                  <li>Taxas baseadas em uso se aplicam para reservas, chamadas de IA, SMS e mensagens WhatsApp além dos limites do seu plano.</li>
                  <li>Você pode cancelar a qualquer momento; sua assinatura permanece ativa até o final do período de cobrança.</li>
                  <li>Não são emitidos reembolsos para meses parciais.</li>
                  <li>Os preços podem mudar com 30 dias de aviso prévio.</li>
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
                  <li>Você é responsável pela precisão dos dados inseridos e por obter consentimento dos seus clientes para processar seus dados.</li>
                  <li>Você não deve usar o Serviço para fins ilícitos.</li>
                  <li>Você deve manter suas credenciais de login seguras.</li>
                  <li>Você é responsável por cumprir as leis locais aplicáveis ao seu restaurante, incluindo regulamentos de proteção de dados.</li>
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
              {showPtNotice ? '5. Uso Aceitável' : '5. Acceptable Use'}
            </h2>
            <p>{showPtNotice
              ? 'Você não pode: fazer engenharia reversa do Serviço; revender ou sublicenciar o acesso; usar o Serviço para enviar spam; ou interferir na infraestrutura do Serviço.'
              : 'You may not: reverse-engineer the Service; resell or sublicense access; use the Service to send spam; or interfere with the Service\'s infrastructure.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '6. Propriedade Intelectual' : '6. Intellectual Property'}
            </h2>
            <p>{showPtNotice
              ? 'Todo software, designs e conteúdo do Serviço são de propriedade da Seatable. Você mantém a propriedade dos dados que envia ao Serviço.'
              : 'All software, designs, and content in the Service are owned by Seatable. You retain ownership of data you submit to the Service.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '7. Disponibilidade e Uptime' : '7. Availability and Uptime'}
            </h2>
            <p>{showPtNotice
              ? 'Buscamos 99,9% de uptime, mas não garantimos serviço ininterrupto. Manutenções planejadas serão comunicadas com antecedência.'
              : 'We target 99.9% uptime but do not guarantee uninterrupted service. Planned maintenance will be communicated in advance.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '8. Limitação de Responsabilidade' : '8. Limitation of Liability'}
            </h2>
            <p>{showPtNotice
              ? 'Na máxima extensão permitida por lei, a Seatable não é responsável por danos indiretos, incidentais ou consequenciais. Nossa responsabilidade total é limitada ao valor pago nos 3 meses anteriores à reclamação.'
              : 'To the maximum extent permitted by law, Seatable is not liable for indirect, incidental, or consequential damages. Our total liability is limited to the amount you paid in the 3 months preceding a claim.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '9. Rescisão' : '9. Termination'}
            </h2>
            <p>{showPtNotice
              ? 'Podemos suspender ou encerrar contas que violem estes Termos. Você pode cancelar sua conta a qualquer momento pela página de gerenciamento de assinatura.'
              : 'We may suspend or terminate accounts that violate these Terms. You may cancel your account at any time through the subscription management page.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '10. Alterações nos Termos' : '10. Changes to Terms'}
            </h2>
            <p>{showPtNotice
              ? 'Podemos atualizar estes Termos. Notificaremos você por e-mail 14 dias antes de alterações significativas entrarem em vigor. O uso continuado constitui aceitação.'
              : 'We may update these Terms. We will notify you by email 14 days before material changes take effect. Continued use constitutes acceptance.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '11. Legislação Aplicável' : '11. Governing Law'}
            </h2>
            <p>{showPtNotice
              ? 'Estes Termos são regidos pelas leis do Brasil. Disputas serão resolvidas nos tribunais de São Paulo, SP, Brasil.'
              : 'These Terms are governed by the laws of Brazil. Disputes shall be resolved in the courts of São Paulo, SP, Brazil.'}
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
