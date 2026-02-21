import { useNavigate } from 'react-router-dom';

export default function HeroSection() {
  const navigate = useNavigate();

  return (
    <section className="pt-24 pb-20 px-6 sm:px-16 max-w-[1200px] mx-auto text-center">
      {/* Badge */}
      <div className="inline-block text-xs font-semibold tracking-[1.5px] uppercase text-[#9F1239] bg-[rgba(159,18,57,0.06)] border border-[rgba(159,18,57,0.15)] px-4 py-1.5 rounded-full mb-8">
        AI-Powered Restaurant Management
      </div>

      {/* Heading */}
      <h1 className="font-serif text-5xl sm:text-[72px] font-medium leading-[1.05] tracking-tight text-[#1C1917] mb-7">
        Your restaurant,<br /><em className="text-[#9F1239]">reimagined.</em>
      </h1>

      {/* Subtitle */}
      <p className="text-[19px] text-[#78716C] font-light leading-[1.7] max-w-[560px] mx-auto mb-12">
        Effortlessly manage reservations, delight guests, and grow your business with an AI that truly understands your restaurant.
      </p>

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={() => {
            const el = document.getElementById('pricing');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
            else navigate('/#pricing');
          }}
          className="px-8 py-3.5 bg-[#9F1239] hover:bg-[#881337] text-white text-[15px] font-semibold rounded-full transition-colors"
        >
          Start Free Trial
        </button>
        <button
          onClick={() => navigate('/live-demo')}
          className="px-8 py-3.5 border border-[#D6D3D1] text-[#57534E] text-[15px] font-medium rounded-full hover:border-[#A8A29E] transition-colors"
        >
          Watch Demo
        </button>
      </div>

      {/* Social Proof */}
      <div className="mt-16 flex items-center justify-center gap-8">
        <div className="flex">
          {[
            'linear-gradient(135deg, #9F1239, #be123c)',
            'linear-gradient(135deg, #57534E, #78716C)',
            'linear-gradient(135deg, #D6D3D1, #E7E5E4)',
            'linear-gradient(135deg, #1C1917, #44403C)',
          ].map((bg, i) => (
            <div
              key={i}
              className="w-9 h-9 rounded-full border-2 border-[#FAFAF9]"
              style={{ background: bg, marginLeft: i === 0 ? 0 : -10 }}
            />
          ))}
        </div>
        <p className="text-sm text-[#78716C]">
          Trusted by restaurants across Europe
        </p>
      </div>
    </section>
  );
}
