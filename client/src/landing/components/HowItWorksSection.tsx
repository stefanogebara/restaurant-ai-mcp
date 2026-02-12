import { motion } from 'framer-motion';
import ThiingsIcon, { type IconName } from '../../components/common/ThiingsIcon';

const steps = [
  {
    number: '01',
    iconName: 'phone' as IconName,
    title: 'Customer Calls or Chats',
    description: 'A customer contacts your restaurant via phone or web chat to make a reservation.',
    accent: 'bg-[#9F1239]',
  },
  {
    number: '02',
    iconName: 'bot' as IconName,
    title: 'AI Handles Everything',
    description: 'Our AI checks real-time availability, understands preferences, and confirms the booking in seconds.',
    accent: 'bg-[#1C1917]',
  },
  {
    number: '03',
    iconName: 'calendar-check' as IconName,
    title: 'Reservation Confirmed',
    description: 'The guest receives a confirmation. Your dashboard updates instantly. No manual work needed.',
    accent: 'bg-[#9F1239]',
  },
];

export default function HowItWorksSection() {
  return (
    <section className="py-20 px-6 bg-[#FAFAF9]">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="font-serif text-3xl md:text-4xl italic mb-4 text-[#1C1917]">
            How It Works
          </h2>
          <div className="w-16 h-0.5 bg-[#9F1239] mx-auto opacity-50 mb-6"></div>
          <p className="text-lg text-[#57534E] max-w-2xl mx-auto font-light">
            From first call to confirmed reservation in under 30 seconds
          </p>
        </motion.div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connecting line (desktop only) */}
          <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-px bg-[#E7E5E4]" />

          {steps.map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2 }}
              className="text-center relative hover:-translate-y-1 transition-transform duration-300"
            >
              {/* Icon Circle */}
              <div className={`w-16 h-16 ${step.accent} rounded-2xl mx-auto mb-6 flex items-center justify-center relative z-10 shadow-lg`}>
                <ThiingsIcon name={step.iconName} pxSize={28} />
              </div>

              {/* Step Number */}
              <div className="text-xs text-[#A8A29E] uppercase tracking-[0.2em] font-bold mb-3">
                Step {step.number}
              </div>

              {/* Title */}
              <h3 className="font-serif text-xl text-[#1C1917] mb-3">
                {step.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-[#57534E] font-light leading-relaxed max-w-xs mx-auto">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
