export default function FeaturesGrid() {
  const features = [
    { icon: '\u260E', title: 'AI Voice Agent', desc: 'An AI receptionist that answers calls, takes reservations, and speaks naturally in your restaurant\u2019s voice and personality.' },
    { icon: '\u2709', title: 'WhatsApp Booking', desc: 'Guests book through WhatsApp with natural conversation. The AI handles availability, confirmations, and reminders automatically.' },
    { icon: '\u2699', title: 'Smart Dashboard', desc: 'Real-time view of reservations, walk-ins, and table assignments. Everything your host team needs on one screen.' },
    { icon: '\u2605', title: 'Guest Memory', desc: 'The AI remembers dietary preferences, birthdays, and favorite tables. Every returning guest feels recognized.' },
    { icon: '\u25C9', title: 'Table Management', desc: 'Intelligent table assignment optimizes seating. Manage walk-ins, no-shows, and waitlists without the chaos.' },
    { icon: '\u25C6', title: 'Analytics & Insights', desc: 'Understand your busiest hours, no-show patterns, and customer lifetime value with beautiful, actionable reports.' },
  ];

  return (
    <section id="features" className="py-24 px-6 sm:px-16 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="mb-16">
        <div className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-4">Features</div>
        <h2 className="font-serif text-4xl sm:text-[48px] font-medium leading-[1.15] tracking-tight text-deep-charcoal mb-4">
          Everything you need,<br />nothing you don&apos;t.
        </h2>
        <p className="text-[17px] text-warm-stone font-light leading-[1.7] max-w-[480px]">
          A complete suite designed for modern restaurants that value simplicity and results.
        </p>
      </div>

      {/* 3x2 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-[2px] bg-border-gray rounded-2xl overflow-hidden">
        {features.map((f, i) => (
          <div key={i} className="bg-white p-10 sm:p-12 hover:bg-warm-white transition-colors">
            <div className="w-12 h-12 rounded-xl bg-[rgba(159,18,57,0.06)] flex items-center justify-center mb-6 text-xl text-burgundy">
              {f.icon}
            </div>
            <h3 className="text-lg font-semibold text-deep-charcoal tracking-tight mb-3">{f.title}</h3>
            <p className="text-sm text-warm-stone font-light leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
