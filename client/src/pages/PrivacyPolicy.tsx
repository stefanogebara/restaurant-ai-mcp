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
        <h1 className="font-serif text-4xl font-medium text-deep-charcoal mb-2">
          {showPtNotice ? 'Política de Privacidade' : 'Privacy Policy'}
        </h1>
        <p className="text-sm text-warm-stone mb-12">
          {showPtNotice ? 'Última atualização: junho de 2026' : 'Last updated: June 2026'}
        </p>

        <div className="space-y-10 text-[15px] text-warm-stone leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '1. Quem somos' : '1. Who we are'}
            </h2>
            <p>{showPtNotice
              ? 'A Seatable opera a plataforma de gestão de restaurantes em seatable.one ("o Serviço"). Somos os controladores dos dados pessoais que você nos fornece.'
              : 'Seatable operates the restaurant management platform at seatable.one ("the Service"). We are the data controller for personal data you provide to us.'}
            </p>
            <p className="mt-2">{showPtNotice ? 'Contato: ' : 'Contact: '}<a href="mailto:hello@seatable.one" className="text-burgundy hover:underline">hello@seatable.one</a></p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '2. Dados que coletamos' : '2. Data we collect'}
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              {showPtNotice ? (
                <>
                  <li><strong>Dados da conta:</strong> nome, endereço de e-mail, informações do restaurante fornecidas durante o cadastro.</li>
                  <li><strong>Dados de uso:</strong> registros de reservas, lista de espera, configurações de mesas e logs de chamadas.</li>
                  <li><strong>Dados de clientes:</strong> nomes, telefones e preferências de reserva dos clientes do seu restaurante.</li>
                  <li><strong>Dados de pagamento:</strong> informações de cobrança processadas pelo Stripe. Não armazenamos dados de cartão.</li>
                  <li><strong>Dados técnicos:</strong> endereços IP, tipo de navegador e logs de uso para segurança e monitoramento.</li>
                </>
              ) : (
                <>
                  <li><strong>Account data:</strong> name, email address, restaurant information provided during registration and onboarding.</li>
                  <li><strong>Usage data:</strong> reservation records, waitlist entries, table configurations, and call logs created while using the Service.</li>
                  <li><strong>Customer data:</strong> names, phone numbers, and reservation preferences of your restaurant's guests entered by you or your staff.</li>
                  <li><strong>Payment data:</strong> billing information processed by Stripe. We do not store card details.</li>
                  <li><strong>Technical data:</strong> IP addresses, browser type, and usage logs for security and performance monitoring.</li>
                </>
              )}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '3. Como usamos seus dados' : '3. How we use your data'}
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              {showPtNotice ? (
                <>
                  <li>Para fornecer e melhorar o Serviço.</li>
                  <li>Para processar pagamentos e gerenciar assinaturas.</li>
                  <li>Para enviar comunicações relacionadas ao serviço (confirmações de reserva, lembretes).</li>
                  <li>Para cumprir obrigações legais.</li>
                </>
              ) : (
                <>
                  <li>To provide and improve the Service.</li>
                  <li>To process payments and manage subscriptions.</li>
                  <li>To send service-related communications (reservation confirmations, reminders).</li>
                  <li>To comply with legal obligations.</li>
                </>
              )}
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '4. Base legal (LGPD/GDPR)' : '4. Legal basis (GDPR)'}
            </h2>
            <p>{showPtNotice
              ? 'Processamos seus dados com base em: (a) execução de contrato — para fornecer o Serviço contratado; (b) interesses legítimos — para manter a segurança e melhorar o Serviço; (c) obrigação legal — para cumprir a legislação aplicável; e (d) consentimento — quando fornecido por você.'
              : 'We process your data on the basis of: (a) contract performance — to provide the Service you subscribed to; (b) legitimate interests — to maintain security and improve the Service; (c) legal obligation — to comply with applicable law; and (d) consent — where you have given it.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '5. Retenção de dados' : '5. Data retention'}
            </h2>
            <p>{showPtNotice
              ? 'Retemos seus dados enquanto sua conta estiver ativa ou conforme necessário para fornecer o Serviço. Você pode solicitar a exclusão a qualquer momento entrando em contato conosco. Retemos registros de cobrança por 7 anos para cumprir a legislação fiscal.'
              : 'We retain your data for as long as your account is active or as needed to provide the Service. You may request deletion at any time by contacting us. We retain billing records for 7 years to comply with tax law.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '6. Serviços de terceiros' : '6. Third-party services'}
            </h2>
            <p>{showPtNotice ? 'Utilizamos os seguintes subprocessadores:' : 'We use the following sub-processors:'}</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Supabase</strong> — {showPtNotice ? 'hospedagem de banco de dados' : 'database hosting (EU region)'}</li>
              <li><strong>Stripe</strong> — {showPtNotice ? 'processamento de pagamentos' : 'payment processing'}</li>
              <li><strong>Anthropic / OpenAI</strong> — {showPtNotice ? 'processamento de IA para conversas de reserva' : 'AI processing for reservation conversations'}</li>
              <li><strong>ElevenLabs / Cartesia</strong> — {showPtNotice ? 'síntese de voz' : 'voice synthesis'}</li>
              <li><strong>Twilio / Meta</strong> — {showPtNotice ? 'SMS e mensagens WhatsApp' : 'SMS and WhatsApp messaging'}</li>
              <li><strong>Resend</strong> — {showPtNotice ? 'e-mail transacional' : 'transactional email'}</li>
              <li><strong>Vercel</strong> — {showPtNotice ? 'infraestrutura de hospedagem' : 'hosting infrastructure'}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '7. Seus direitos' : '7. Your rights'}
            </h2>
            <p>{showPtNotice
              ? <>Pela LGPD/GDPR, você tem o direito de: acessar, retificar ou excluir seus dados pessoais; restringir ou se opor ao processamento; e portabilidade de dados. Para exercer qualquer direito, envie e-mail para <a href="mailto:hello@seatable.one" className="text-burgundy hover:underline">hello@seatable.one</a>.</>
              : <>Under GDPR you have the right to: access, rectify, or erase your personal data; restrict or object to processing; and data portability. To exercise any right, email <a href="mailto:hello@seatable.one" className="text-burgundy hover:underline">hello@seatable.one</a>.</>}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '8. Cookies' : '8. Cookies'}
            </h2>
            <p>{showPtNotice
              ? 'Utilizamos cookies essenciais para autenticação e gerenciamento de sessão. Não utilizamos cookies de rastreamento ou publicidade.'
              : 'We use essential cookies for authentication and session management. We do not use tracking or advertising cookies.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '9. Contato' : '9. Contact'}
            </h2>
            <p>{showPtNotice ? 'Dúvidas sobre privacidade: ' : 'For privacy questions: '}<a href="mailto:hello@seatable.one" className="text-burgundy hover:underline">hello@seatable.one</a></p>
          </section>
        </div>

        <p className="mt-16 text-xs text-muted-stone">&copy; {currentYear} Seatable. All rights reserved.</p>
      </div>
    </div>
  );
}
