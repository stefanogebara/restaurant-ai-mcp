import { useEffect, useRef } from 'react';
import { PLAN_PRICES_BRL } from '../config/planFeatures';

// Inject Plus Jakarta Sans font
const FONT_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
  .portfolio-page { font-family: 'Plus Jakarta Sans', sans-serif; }
`;

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconPhone() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 4C14 4 18 4 20 8" stroke="#CA8A04" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M14 4C14 4 22 4 23 12" stroke="#CA8A04" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M8.5 5.5L10.5 10.5L8 13C9 15.5 12.5 19 15 20L17.5 17.5L22.5 19.5L22.5 23C22.5 23 19 25 14 21C9 17 5 12 5.5 7L8.5 5.5Z" stroke="#CA8A04" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M17 14C17.5 14 18 14 18.5 13.5" stroke="#CA8A04" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

function IconChat() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="5" width="20" height="14" rx="3" stroke="#CA8A04" strokeWidth="1.8"/>
      <path d="M8 21L12 17H20" stroke="#CA8A04" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="9" cy="12" r="1.2" fill="#CA8A04"/>
      <circle cx="14" cy="12" r="1.2" fill="#CA8A04"/>
      <circle cx="19" cy="12" r="1.2" fill="#CA8A04"/>
    </svg>
  );
}

function IconBrain() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 6C14 6 10 6 9 10C7 10 5 12 6 15C4 16 4 20 8 20H20C24 20 24 16 22 15C23 12 21 10 19 10C18 6 14 6 14 6Z" stroke="#CA8A04" strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M14 10V20" stroke="#CA8A04" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M11 14L14 12L17 14" stroke="#CA8A04" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="21" cy="8" r="2" fill="#CA8A04" opacity="0.6"/>
      <path d="M20 7L22 9" stroke="#CA8A04" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

function IconChart() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="17" width="4" height="7" rx="1" stroke="#CA8A04" strokeWidth="1.8"/>
      <rect x="12" y="11" width="4" height="13" rx="1" stroke="#CA8A04" strokeWidth="1.8"/>
      <rect x="19" y="5" width="4" height="19" rx="1" stroke="#CA8A04" strokeWidth="1.8"/>
      <path d="M5 8L10 5L15 8L22 4" stroke="#CA8A04" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="6" width="20" height="18" rx="3" stroke="#CA8A04" strokeWidth="1.8"/>
      <path d="M4 11H24" stroke="#CA8A04" strokeWidth="1.8"/>
      <path d="M9 4V8" stroke="#CA8A04" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M19 4V8" stroke="#CA8A04" strokeWidth="1.8" strokeLinecap="round"/>
      <rect x="8" y="15" width="3" height="3" rx="0.5" fill="#CA8A04"/>
      <rect x="13" y="15" width="3" height="3" rx="0.5" fill="#CA8A04"/>
      <rect x="17" y="15" width="3" height="3" rx="0.5" fill="#CA8A04"/>
    </svg>
  );
}

function IconGear() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="14" cy="14" r="3.5" stroke="#CA8A04" strokeWidth="1.8"/>
      <path d="M14 4V7M14 21V24M4 14H7M21 14H24M6.34 6.34L8.46 8.46M19.54 19.54L21.66 21.66M6.34 21.66L8.46 19.54M19.54 8.46L21.66 6.34" stroke="#CA8A04" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

function IconSparkle() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 1L8.2 5.5L12 7L8.2 8.5L7 13L5.8 8.5L2 7L5.8 5.5L7 1Z" fill="#CA8A04"/>
    </svg>
  );
}

function IconSquare() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="12" height="12" rx="2" fill="#CA8A04"/>
      <rect x="6" y="6" width="6" height="6" rx="1" fill="#1C1917"/>
    </svg>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function Navbar() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <nav className="backdrop-blur-xl bg-black/40 border-b border-white/10 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <IconSquare />
          <span className="text-amber-400 font-bold text-xl tracking-tight">Seatable</span>
        </div>

        {/* Center links */}
        <div className="hidden md:flex items-center gap-8">
          {[
            { label: 'Produto', id: 'produto' },
            { label: 'Como funciona', id: 'como-funciona' },
            { label: 'Preços', id: 'precos' },
            { label: 'Contato', id: 'contato' },
          ].map(({ label, id }) => (
            <button
              key={id}
              type="button"
              onClick={() => scrollTo(id)}
              className="text-stone-300 hover:text-white transition-colors duration-300 text-sm font-medium cursor-pointer"
            >
              {label}
            </button>
          ))}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => scrollTo('contato')}
          className="bg-amber-600 hover:bg-amber-500 text-white rounded-xl px-5 py-2 text-sm font-semibold transition-all duration-300 cursor-pointer"
        >
          Agendar Demo
        </button>
      </div>
    </nav>
  );
}

function HeroSection() {
  return (
    <section
      className="min-h-screen relative flex items-center overflow-hidden"
      style={{
        backgroundImage: "url('/images/portfolio-hero-bg.png'), radial-gradient(ellipse 80% 80% at 50% -20%, rgba(202,138,4,0.18) 0%, transparent 60%)",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundBlendMode: 'overlay',
        backgroundColor: '#1C1917',
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-[#1C1917]/90 via-[#1C1917]/70 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-6 py-24 w-full">
        <div className="grid lg:grid-cols-5 gap-12 items-center">
          {/* Left column */}
          <div className="lg:col-span-3 space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 border border-amber-500/40 rounded-full px-4 py-1.5 bg-amber-950/30">
              <IconSparkle />
              <span className="text-amber-400 text-sm font-medium">IA para Restaurantes</span>
            </div>

            {/* Headline */}
            <h1 className="text-5xl xl:text-7xl font-bold leading-tight text-[#FAFAF9]">
              O futuro da gestão<br />
              de restaurantes<br />
              <span className="text-amber-400">está aqui.</span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl text-stone-300 max-w-lg leading-relaxed">
              IA que atende clientes pelo WhatsApp e por voz, gerencia mesas e antecipa sua operação — 24 horas por dia.
            </p>

            {/* CTA row */}
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                className="bg-amber-600 hover:bg-amber-500 text-white rounded-xl px-6 py-3 font-semibold transition-all duration-300 cursor-pointer"
              >
                Começar grátis
              </button>
              <button
                type="button"
                className="border border-white/20 hover:border-white/40 text-white rounded-xl px-6 py-3 font-medium transition-all duration-300 cursor-pointer"
              >
                Ver demonstração
              </button>
            </div>
          </div>

          {/* Right column — WhatsApp card */}
          <div className="lg:col-span-2 relative">
            {/* Gold glow */}
            <div
              className="absolute inset-0 rounded-3xl pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(202,138,4,0.22) 0%, transparent 70%)',
                transform: 'scale(1.2)',
              }}
            />
            <div className="relative bg-white/8 backdrop-blur-xl border border-white/10 rounded-3xl p-6 space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                <div className="w-9 h-9 rounded-full bg-rose-500 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">WA</span>
                </div>
                <div>
                  <div className="text-[#FAFAF9] font-semibold text-sm">WhatsApp IA</div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
                    <span className="text-rose-400 text-xs font-medium">Online</span>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="space-y-3 text-sm">
                <ChatBubble side="left" text="Quero reservar mesa para 2 pessoas amanhã às 20h" />
                <ChatBubble
                  side="right"
                  text="Perfeito! Temos disponibilidade para amanhã às 20h para 2 pessoas. Posso confirmar no nome de qual pessoa?"
                />
                <ChatBubble side="left" text="João Silva" />
                <ChatBubble
                  side="right"
                  text="✓ Reserva confirmada! João Silva — 2 pessoas — amanhã 20h. Você receberá uma confirmação em breve."
                  amber
                />
              </div>

              {/* Input mock */}
              <div className="flex items-center gap-2 mt-2 pt-3 border-t border-white/10">
                <div className="flex-1 bg-white/5 rounded-xl px-4 py-2 text-stone-500 text-sm">Mensagem...</div>
                <div className="w-8 h-8 rounded-full bg-amber-600 flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 7H12M8 3L12 7L8 11" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            '3.000+ reservas automatizadas',
            '98% satisfação',
            '40% menos no-shows',
            'Disponível 24/7',
          ].map((stat) => (
            <div
              key={stat}
              className="bg-white/8 backdrop-blur-xl border border-white/10 rounded-2xl px-5 py-3 text-center"
            >
              <span className="text-[#FAFAF9] text-sm font-semibold">{stat}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ChatBubble({ side, text, amber }: { side: 'left' | 'right'; text: string; amber?: boolean }) {
  if (side === 'left') {
    return (
      <div className="flex justify-start">
        <div className="bg-white/10 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[85%] text-stone-200 leading-snug">
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-end">
      <div
        className={`rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[85%] leading-snug ${
          amber
            ? 'bg-amber-600/80 text-white'
            : 'bg-stone-700 text-stone-100'
        }`}
      >
        {text}
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: <IconPhone />,
    title: 'Agente de Voz IA',
    desc: 'Cliente liga, a IA atende em português natural, faz reservas e verifica disponibilidade — sem espera, sem equipe extra.',
  },
  {
    icon: <IconChat />,
    title: 'WhatsApp Inteligente',
    desc: 'Conversas naturais que confirmam reservas, enviam lembretes e reduzem cancelamentos em até 40%.',
  },
  {
    icon: <IconBrain />,
    title: 'Manager AI',
    desc: 'Briefings diários, alertas de operação, análise de desempenho e sugestões estratégicas para sua gestão.',
  },
  {
    icon: <IconChart />,
    title: 'Analytics em Tempo Real',
    desc: 'Ocupação, previsão de receita, clientes VIP, risco de churn e relatórios exportáveis.',
  },
  {
    icon: <IconCalendar />,
    title: 'Reservas Online',
    desc: 'Widget personalizável para seu site com confirmação automática e prevenção de no-show por depósito.',
  },
  {
    icon: <IconGear />,
    title: 'Personalização Total',
    desc: 'Configure voz, saudação e idioma do agente — ele representa sua marca, não uma marca genérica.',
  },
];

function FeaturesSection() {
  return (
    <section id="produto" className="py-24 bg-[#0C0A09]">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <div className="text-center mb-16 space-y-4">
          <p className="text-amber-500 text-sm font-semibold tracking-widest uppercase">Funcionalidades</p>
          <h2 className="text-4xl md:text-5xl font-bold text-[#FAFAF9] max-w-2xl mx-auto leading-tight">
            Tudo que seu restaurante precisa, potencializado por IA
          </h2>
        </div>

        {/* Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon, title, desc }) => (
            <div
              key={title}
              className="group bg-white/8 backdrop-blur-xl border border-white/10 rounded-3xl p-8 hover:border-amber-500/30 transition-all duration-300 cursor-default"
            >
              <div className="mb-5 w-12 h-12 rounded-2xl bg-amber-950/40 border border-amber-500/20 flex items-center justify-center">
                {icon}
              </div>
              <h3 className="text-[#FAFAF9] font-bold text-lg mb-3">{title}</h3>
              <p className="text-[#A8A29E] leading-relaxed text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    {
      num: '01',
      title: 'Configure em minutos',
      desc: 'Onboarding guiado com seu cardápio, mesas e horários. Sem equipe técnica necessária.',
    },
    {
      num: '02',
      title: 'IA aprende seu restaurante',
      desc: 'O agente absorve a identidade e começa a atender com seu estilo e tom de voz.',
    },
    {
      num: '03',
      title: 'Resultados desde o primeiro dia',
      desc: 'Reservas automáticas, notificações e analytics para tomar decisões com dados.',
    },
  ];

  const integrations = [
    'WhatsApp', 'ElevenLabs', 'Twilio', 'Stripe', 'Meta', 'Anthropic Claude',
  ];

  return (
    <section id="como-funciona" className="py-24 bg-[#1C1917]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-[#FAFAF9]">Como funciona</h2>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-6 relative">
          {/* Connecting line (desktop) */}
          <div className="hidden md:block absolute top-14 left-[16.66%] right-[16.66%] h-px border-t-2 border-dashed border-amber-600/30 z-0" />

          {steps.map(({ num, title, desc }) => (
            <div
              key={num}
              className="relative z-10 bg-white/8 backdrop-blur-xl border border-white/10 rounded-3xl p-8 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-amber-600 text-white font-bold text-sm flex items-center justify-center mx-auto mb-6">
                {num}
              </div>
              <h3 className="text-[#FAFAF9] font-bold text-lg mb-3">{title}</h3>
              <p className="text-[#A8A29E] text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        {/* Integrations */}
        <div className="mt-16 text-center">
          <p className="text-[#A8A29E] text-sm mb-6 font-medium">Integra com as ferramentas que você já usa</p>
          <div className="flex flex-wrap justify-center gap-3">
            {integrations.map((name) => (
              <span
                key={name}
                className="bg-white/8 border border-white/10 rounded-full px-5 py-2 text-stone-300 text-sm font-medium"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const plans = [
    {
      name: 'Starter',
      price: String(PLAN_PRICES_BRL.starter),
      featured: false,
      features: [
        'Reservas IA (Chat + WhatsApp)',
        'Painel do host',
        'Analytics básico',
        'Até 50 reservas/mês',
        'Suporte por email',
      ],
      cta: 'Começar agora',
      ctaStyle: 'ghost' as const,
    },
    {
      name: 'Growth',
      price: String(PLAN_PRICES_BRL.growth),
      featured: true,
      badge: 'Mais popular',
      trial: '14 dias grátis',
      features: [
        'Tudo do Starter +',
        'Agente de Voz IA',
        'Analytics avançado',
        'Lista de espera',
        'Até 150 reservas/mês',
        'Notificações SMS',
        '14 dias grátis',
      ],
      cta: 'Começar grátis',
      ctaStyle: 'primary' as const,
    },
    {
      name: 'Scale',
      price: String(PLAN_PRICES_BRL.scale),
      featured: false,
      features: [
        'Tudo do Growth +',
        'Reservas ilimitadas',
        'SMS ilimitado',
        'Suporte prioritário',
        'Integrações customizadas',
      ],
      cta: 'Começar agora',
      ctaStyle: 'ghost' as const,
    },
  ];

  return (
    <section id="precos" className="py-24 bg-[#0C0A09]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-[#FAFAF9]">Escolha o plano ideal</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-start">
          {plans.map(({ name, price, featured, badge, features, cta, ctaStyle }) => (
            <div
              key={name}
              className={`relative rounded-3xl p-8 flex flex-col gap-6 transition-all duration-300 ${
                featured
                  ? 'bg-amber-950/20 border border-amber-500/50'
                  : 'bg-white/8 backdrop-blur-xl border border-white/10'
              }`}
            >
              {badge && (
                <div className="absolute -top-3 right-6">
                  <span className="bg-amber-600 text-white text-xs font-semibold rounded-full px-4 py-1">
                    {badge}
                  </span>
                </div>
              )}

              <div>
                <p className="text-[#A8A29E] text-sm font-medium mb-1">{name}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-[#FAFAF9] text-4xl font-bold">R$ {price}</span>
                  <span className="text-[#A8A29E] text-sm">/mês</span>
                </div>
              </div>

              <ul className="space-y-3 flex-1">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-3 text-sm text-stone-300">
                    <svg className="shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 16 16" fill="none">
                      <circle cx="8" cy="8" r="7" stroke="#CA8A04" strokeWidth="1.5"/>
                      <path d="M5 8L7 10L11 6" stroke="#CA8A04" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className={`w-full rounded-xl px-6 py-3 font-semibold transition-all duration-300 cursor-pointer ${
                  ctaStyle === 'primary'
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'border border-white/20 hover:border-white/40 text-white'
                }`}
              >
                {cta}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-24 bg-[#1C1917]">
      <div className="max-w-3xl mx-auto px-6 text-center space-y-8">
        <h2 className="text-4xl md:text-5xl font-bold text-[#FAFAF9] leading-tight">
          Pronto para transformar<br />seu restaurante?
        </h2>
        <p className="text-[#A8A29E] text-lg max-w-xl mx-auto">
          Junte-se a centenas de restaurantes que já automatizaram suas reservas com IA.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <button
            type="button"
            className="bg-amber-600 hover:bg-amber-500 text-white rounded-xl px-8 py-3.5 font-semibold transition-all duration-300 cursor-pointer text-base"
          >
            Agendar demonstração gratuita
          </button>
          <button
            type="button"
            className="border border-white/20 hover:border-white/40 text-white rounded-xl px-8 py-3.5 font-medium transition-all duration-300 cursor-pointer text-base"
          >
            Falar com nossa equipe
          </button>
        </div>
        <p className="text-stone-500 text-sm">
          Sem cartão de crédito &bull; 14 dias grátis &bull; Cancele quando quiser
        </p>
      </div>
    </section>
  );
}

function ContactSection() {
  return (
    <section id="contato" className="py-20 bg-[#0C0A09]">
      <div className="max-w-2xl mx-auto px-6 text-center space-y-6">
        <h2 className="text-3xl font-bold text-[#FAFAF9]">Entre em contato</h2>
        <p className="text-[#A8A29E]">Fale com nossa equipe. Respondemos em até 24 horas.</p>
        <div className="bg-white/8 backdrop-blur-xl border border-white/10 rounded-3xl p-8 space-y-4 text-left">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-stone-300 text-sm font-medium">Nome</label>
              <input
                type="text"
                placeholder="Seu nome"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#FAFAF9] placeholder-stone-600 text-sm focus:outline-none focus:border-amber-500/50 transition-colors duration-300"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-stone-300 text-sm font-medium">Email</label>
              <input
                type="email"
                placeholder="seu@restaurante.com"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#FAFAF9] placeholder-stone-600 text-sm focus:outline-none focus:border-amber-500/50 transition-colors duration-300"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-stone-300 text-sm font-medium">Mensagem</label>
            <textarea
              rows={4}
              placeholder="Como podemos ajudar?"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[#FAFAF9] placeholder-stone-600 text-sm focus:outline-none focus:border-amber-500/50 transition-colors duration-300 resize-none"
            />
          </div>
          <button
            type="button"
            className="w-full bg-amber-600 hover:bg-amber-500 text-white rounded-xl px-6 py-3 font-semibold transition-all duration-300 cursor-pointer"
          >
            Enviar mensagem
          </button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <footer className="py-12 bg-[#0C0A09] border-t border-white/10">
      <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="text-center md:text-left">
          <div className="flex items-center gap-2 justify-center md:justify-start mb-1">
            <IconSquare />
            <span className="text-amber-400 font-bold text-lg">Seatable</span>
          </div>
          <p className="text-stone-500 text-sm">{`© ${new Date().getFullYear()} Seatable. Todos os direitos reservados.`}</p>
        </div>

        <div className="flex flex-wrap justify-center gap-6 text-sm text-stone-400">
          {[
            { label: 'Produto', id: 'produto' },
            { label: 'Preços', id: 'precos' },
            { label: 'Contato', id: 'contato' },
          ].map(({ label, id }) => (
            <button
              key={id}
              type="button"
              onClick={() => scrollTo(id)}
              className="hover:text-white transition-colors duration-300 cursor-pointer"
            >
              {label}
            </button>
          ))}
          <a href="/privacy" className="hover:text-white transition-colors duration-300">
            Política de Privacidade
          </a>
        </div>
      </div>
    </footer>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = FONT_STYLE;
    document.head.appendChild(style);
    styleRef.current = style;

    // Smooth scroll globally on this page
    document.documentElement.style.scrollBehavior = 'smooth';

    return () => {
      if (styleRef.current) {
        document.head.removeChild(styleRef.current);
        styleRef.current = null;
      }
      document.documentElement.style.scrollBehavior = '';
    };
  }, []);

  return (
    <div
      className="portfolio-page min-h-screen"
      style={{ backgroundColor: '#1C1917', color: '#FAFAF9' }}
    >
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <PricingSection />
      <CTASection />
      <ContactSection />
      <Footer />
    </div>
  );
}
