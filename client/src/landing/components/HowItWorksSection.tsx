const steps = [
  {
    number: '01',
    title: 'Tell us about your restaurant',
    description: 'Our AI researches your restaurant online, then asks a few questions to understand your unique personality and style.',
  },
  {
    number: '02',
    title: 'We build your AI persona',
    description: 'From web intelligence and your input, we create an authentic AI agent that sounds and feels like your restaurant.',
  },
  {
    number: '03',
    title: 'Go live in minutes',
    description: 'Connect your phone, WhatsApp, and booking page. Your AI starts handling reservations immediately.',
  },
];

export default function HowItWorksSection() {
  return (
    <section className="py-24 px-6 sm:px-16 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="text-center mb-16">
        <div className="text-xs font-semibold tracking-[2px] uppercase text-[#9F1239] mb-4">How It Works</div>
        <h2 className="font-serif text-4xl sm:text-[48px] font-medium tracking-tight text-[#1C1917]">
          Three steps to<br />a smarter restaurant.
        </h2>
      </div>

      {/* Steps */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
        {steps.map((step) => (
          <div key={step.number}>
            <div className="font-serif text-[56px] font-normal text-[rgba(159,18,57,0.12)] leading-none mb-5">
              {step.number}
            </div>
            <h3 className="text-lg font-semibold text-[#1C1917] tracking-tight mb-3">{step.title}</h3>
            <p className="text-sm text-[#78716C] font-light leading-relaxed">{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
