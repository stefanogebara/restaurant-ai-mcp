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
          {showPtNotice ? 'Pol\u00edtica de Privacidade' : 'Privacy Policy'}
        </h1>
        <p className="text-sm text-warm-stone mb-12">
          {showPtNotice ? '\u00daltima atualiza\u00e7\u00e3o: janeiro de 2025' : 'Last updated: January 2025'}
        </p>

        <div className="space-y-10 text-[15px] text-warm-stone leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '1. Quem somos' : '1. Who we are'}
            </h2>
            <p>{showPtNotice
              ? 'A Seatable opera a plataforma de gest\u00e3o de restaurantes em seatable.one ("o Servi\u00e7o"). Somos os controladores dos dados pessoais que voc\u00ea nos fornece.'
              : 'Seatable operates the restaurant management platform at seatable.one ("the Service"). We are the data controller for personal data you provide to us.'}
            </p>
            <p className="mt-2">{showPtNotice ? 'Contato: ' : 'Contact: '}<a href="mailto:seatable.ai.br@gmail.com" className="text-burgundy hover:underline">seatable.ai.br@gmail.com</a></p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '2. Dados que coletamos' : '2. Data we collect'}
            </h2>
            <ul className="list-disc pl-5 space-y-2">
              {showPtNotice ? (
                <>
                  <li><strong>Dados da conta:</strong> nome, endere\u00e7o de e-mail, informa\u00e7\u00f5es do restaurante fornecidas durante o cadastro.</li>
                  <li><strong>Dados de uso:</strong> registros de reservas, lista de espera, configura\u00e7\u00f5es de mesas e logs de chamadas.</li>
                  <li><strong>Dados de clientes:</strong> nomes, telefones e prefer\u00eancias de reserva dos clientes do seu restaurante.</li>
                  <li><strong>Dados de pagamento:</strong> informa\u00e7\u00f5es de cobran\u00e7a processadas pelo Stripe. N\u00e3o armazenamos dados de cart\u00e3o.</li>
                  <li><strong>Dados t\u00e9cnicos:</strong> endere\u00e7os IP, tipo de navegador e logs de uso para seguran\u00e7a e monitoramento.</li>
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
                  <li>Para fornecer e melhorar o Servi\u00e7o.</li>
                  <li>Para processar pagamentos e gerenciar assinaturas.</li>
                  <li>Para enviar comunica\u00e7\u00f5es relacionadas ao servi\u00e7o (confirma\u00e7\u00f5es de reserva, lembretes).</li>
                  <li>Para cumprir obriga\u00e7\u00f5es legais.</li>
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
              ? 'Processamos seus dados com base em: (a) execu\u00e7\u00e3o de contrato \u2014 para fornecer o Servi\u00e7o contratado; (b) interesses leg\u00edtimos \u2014 para manter a seguran\u00e7a e melhorar o Servi\u00e7o; (c) obriga\u00e7\u00e3o legal \u2014 para cumprir a legisla\u00e7\u00e3o aplic\u00e1vel; e (d) consentimento \u2014 quando fornecido por voc\u00ea.'
              : 'We process your data on the basis of: (a) contract performance — to provide the Service you subscribed to; (b) legitimate interests — to maintain security and improve the Service; (c) legal obligation — to comply with applicable law; and (d) consent — where you have given it.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '5. Reten\u00e7\u00e3o de dados' : '5. Data retention'}
            </h2>
            <p>{showPtNotice
              ? 'Retemos seus dados enquanto sua conta estiver ativa ou conforme necess\u00e1rio para fornecer o Servi\u00e7o. Voc\u00ea pode solicitar a exclus\u00e3o a qualquer momento entrando em contato conosco. Retemos registros de cobran\u00e7a por 7 anos para cumprir a legisla\u00e7\u00e3o fiscal.'
              : 'We retain your data for as long as your account is active or as needed to provide the Service. You may request deletion at any time by contacting us. We retain billing records for 7 years to comply with tax law.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '6. Servi\u00e7os de terceiros' : '6. Third-party services'}
            </h2>
            <p>{showPtNotice ? 'Utilizamos os seguintes subprocessadores:' : 'We use the following sub-processors:'}</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Supabase</strong> — {showPtNotice ? 'hospedagem de banco de dados' : 'database hosting (EU region)'}</li>
              <li><strong>Stripe</strong> — {showPtNotice ? 'processamento de pagamentos' : 'payment processing'}</li>
              <li><strong>Anthropic / OpenAI</strong> — {showPtNotice ? 'processamento de IA para conversas de reserva' : 'AI processing for reservation conversations'}</li>
              <li><strong>ElevenLabs / Cartesia</strong> — {showPtNotice ? 's\u00edntese de voz' : 'voice synthesis'}</li>
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
              ? <>Pela LGPD/GDPR, voc\u00ea tem o direito de: acessar, retificar ou excluir seus dados pessoais; restringir ou se opor ao processamento; e portabilidade de dados. Para exercer qualquer direito, envie e-mail para <a href="mailto:seatable.ai.br@gmail.com" className="text-burgundy hover:underline">seatable.ai.br@gmail.com</a>.</>
              : <>Under GDPR you have the right to: access, rectify, or erase your personal data; restrict or object to processing; and data portability. To exercise any right, email <a href="mailto:seatable.ai.br@gmail.com" className="text-burgundy hover:underline">seatable.ai.br@gmail.com</a>.</>}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '8. Cookies' : '8. Cookies'}
            </h2>
            <p>{showPtNotice
              ? 'Utilizamos cookies essenciais para autentica\u00e7\u00e3o e gerenciamento de sess\u00e3o. N\u00e3o utilizamos cookies de rastreamento ou publicidade.'
              : 'We use essential cookies for authentication and session management. We do not use tracking or advertising cookies.'}
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-deep-charcoal mb-3">
              {showPtNotice ? '9. Contato' : '9. Contact'}
            </h2>
            <p>{showPtNotice ? 'D\u00favidas sobre privacidade: ' : 'For privacy questions: '}<a href="mailto:seatable.ai.br@gmail.com" className="text-burgundy hover:underline">seatable.ai.br@gmail.com</a></p>
          </section>
        </div>

        <p className="mt-16 text-xs text-muted-stone">&copy; {currentYear} Seatable. All rights reserved.</p>
      </div>
    </div>
  );
}
