/// <reference path="../types/elevenlabs.d.ts" />
import { useEffect } from 'react';
import ElevenLabsWidget from '../components/ElevenLabsWidget';
import { useNavigate, Link } from 'react-router-dom';

export default function LiveAIDemo() {
  const navigate = useNavigate();

  useEffect(() => {
    // Load ElevenLabs widget script
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/@elevenlabs/convai-widget-embed';
    script.async = true;
    script.type = 'text/javascript';
    document.body.appendChild(script);

    return () => {
      // Cleanup script when component unmounts
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 sm:px-16 py-6 bg-[rgba(250,250,249,0.8)] backdrop-blur-xl border-b border-[#E7E5E4]">
        <Link to="/" className="font-serif text-2xl font-semibold text-[#1C1917] tracking-tight">
          seatable<span className="text-[#9F1239]">.</span>
        </Link>
        <div className="hidden md:flex items-center gap-9">
          <Link to="/#features" className="text-sm font-medium text-[#57534E] hover:text-[#1C1917] transition-colors">Features</Link>
          <Link to="/#pricing" className="text-sm font-medium text-[#57534E] hover:text-[#1C1917] transition-colors">Pricing</Link>
          <Link to="/live-demo" className="text-sm font-medium text-[#1C1917]">Demo</Link>
          <Link to="/#contact" className="text-sm font-medium text-[#57534E] hover:text-[#1C1917] transition-colors">Contact</Link>
        </div>
        <Link
          to="/#pricing"
          className="px-6 py-2.5 bg-[#1C1917] text-white text-sm font-semibold rounded-full hover:bg-[#292524] transition-colors"
        >
          Get Started
        </Link>
      </nav>

      {/* Hero */}
      <section className="pt-24 pb-20 text-center max-w-[1200px] mx-auto px-6 sm:px-16">
        <div className="inline-block text-xs font-semibold tracking-[1.5px] uppercase text-[#9F1239] bg-[rgba(159,18,57,0.06)] border border-[rgba(159,18,57,0.15)] px-4 py-1.5 rounded-full mb-7">
          Live Demo
        </div>
        <h1 className="font-serif text-4xl sm:text-[56px] font-medium leading-[1.1] tracking-tight mb-4">
          Hear the AI in <em className="text-[#9F1239]">action.</em>
        </h1>
        <p className="text-[17px] text-[#78716C] font-light leading-relaxed max-w-[520px] mx-auto">
          Call our demo restaurant and experience the AI voice agent that handles reservations naturally, just like your best host would.
        </p>
      </section>

      {/* Demo Widget */}
      <section className="max-w-[720px] mx-auto px-6 sm:px-16 pb-20">
        <div className="bg-white border border-[#E7E5E4] rounded-[20px] p-8 sm:p-12 text-center">
          <div className="text-xs font-semibold tracking-[1.5px] uppercase text-[#A8A29E] mb-5">Demo Restaurant</div>
          <h2 className="font-serif text-[28px] font-medium mb-2">Celeri Madrid</h2>
          <p className="text-sm text-[#78716C] font-light mb-9">Mediterranean &middot; Farm-to-table &middot; Malasa&ntilde;a</p>

          {/* ElevenLabs Widget */}
          <div className="flex items-center justify-center min-h-[200px] mb-6">
            <ElevenLabsWidget agentId={import.meta.env.VITE_ELEVENLABS_AGENT_ID || 'YOUR_AGENT_ID_HERE'} />
          </div>

          {!import.meta.env.VITE_ELEVENLABS_AGENT_ID && (
            <div className="mt-4 p-4 bg-[rgba(217,119,6,0.08)] rounded-xl border border-[rgba(217,119,6,0.2)] text-left">
              <h4 className="text-sm font-medium text-[#1C1917] mb-1">Configuration Required</h4>
              <p className="text-[13px] text-[#57534E] font-light">
                Set <code className="text-xs text-[#9F1239] bg-[#FAFAF9] px-1.5 py-0.5 rounded border border-[#E7E5E4]">VITE_ELEVENLABS_AGENT_ID</code> to activate.
              </p>
            </div>
          )}

          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[rgba(22,163,74,0.06)] rounded-full mt-6">
            <div className="w-2 h-2 rounded-full bg-[#16a34a]" />
            <span className="text-[13px] font-medium text-[#16a34a]">AI Agent Online</span>
          </div>
        </div>
      </section>

      {/* Feature Callouts */}
      <section className="max-w-[900px] mx-auto px-6 sm:px-16 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { icon: '\u260E', title: 'Natural Conversation', desc: 'The AI speaks naturally, handling complex requests like dietary needs, special occasions, and group bookings.' },
            { icon: '\u2605', title: 'Restaurant Personality', desc: "Each AI agent is trained on your restaurant's style, menu, and values to sound authentically yours." },
            { icon: '\u23F1', title: 'Always Available', desc: 'Never miss a reservation. The AI handles calls 24/7 in multiple languages with instant availability checks.' },
          ].map((item, i) => (
            <div key={i} className="bg-white border border-[#E7E5E4] rounded-2xl p-8">
              <div className="w-10 h-10 rounded-[10px] bg-[rgba(159,18,57,0.06)] flex items-center justify-center mb-4 text-lg text-[#9F1239]">
                {item.icon}
              </div>
              <h3 className="text-base font-semibold text-[#1C1917] mb-2 tracking-tight">{item.title}</h3>
              <p className="text-[13px] text-[#78716C] font-light leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 sm:px-16 pb-24">
        <div className="max-w-[700px] mx-auto bg-[#1C1917] rounded-3xl p-10 sm:p-16 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl font-medium text-white mb-3 tracking-tight">Ready for your own AI host?</h2>
          <p className="text-[15px] text-[#A8A29E] font-light mb-8">Set up in 5 minutes. No technical knowledge required.</p>
          <button
            onClick={() => navigate('/#pricing')}
            className="px-8 py-3.5 bg-[#9F1239] hover:bg-[#881337] text-white text-[15px] font-semibold rounded-full transition-colors"
          >
            Start Free Trial
          </button>
        </div>
      </section>
    </div>
  );
}
