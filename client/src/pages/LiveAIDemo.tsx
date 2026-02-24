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
    <div className="min-h-screen bg-warm-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 sm:px-16 py-6 bg-[rgba(250,250,249,0.8)] backdrop-blur-xl border-b border-border-gray">
        <Link to="/" className="font-serif text-2xl font-semibold text-deep-charcoal tracking-tight">
          seatable<span className="text-burgundy">.</span>
        </Link>
        <div className="hidden md:flex items-center gap-9">
          <Link to="/#features" className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">Features</Link>
          <Link to="/#pricing" className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">Pricing</Link>
          <Link to="/live-demo" className="text-sm font-medium text-deep-charcoal">Demo</Link>
          <Link to="/#contact" className="text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">Contact</Link>
        </div>
        <Link
          to="/#pricing"
          className="px-6 py-2.5 bg-deep-charcoal text-white text-sm font-semibold rounded-full hover:bg-charcoal-dark transition-colors"
        >
          Get Started
        </Link>
      </nav>

      {/* Hero */}
      <section className="pt-24 pb-20 text-center max-w-[1200px] mx-auto px-6 sm:px-16">
        <div className="inline-block text-xs font-semibold tracking-[1.5px] uppercase text-burgundy bg-burgundy/[6%] border border-burgundy/15 px-4 py-1.5 rounded-full mb-7">
          Live Demo
        </div>
        <h1 className="font-serif text-4xl sm:text-[56px] font-medium leading-[1.1] tracking-tight mb-4">
          Hear the AI in <em className="text-burgundy">action.</em>
        </h1>
        <p className="text-[17px] text-warm-stone font-light leading-relaxed max-w-[520px] mx-auto">
          Call our demo restaurant and experience the AI voice agent that handles reservations naturally, just like your best host would.
        </p>
      </section>

      {/* Demo Widget */}
      <section className="max-w-[720px] mx-auto px-6 sm:px-16 pb-20">
        <div className="bg-white border border-border-gray rounded-[20px] p-8 sm:p-12 text-center">
          <div className="text-xs font-semibold tracking-[1.5px] uppercase text-muted-stone mb-5">Demo Restaurant</div>
          <h2 className="font-serif text-[28px] font-medium mb-2">Celeri Madrid</h2>
          <p className="text-sm text-warm-stone font-light mb-9">Mediterranean &middot; Farm-to-table &middot; Malasa&ntilde;a</p>

          {/* ElevenLabs Widget */}
          <div className="flex items-center justify-center min-h-[200px] mb-6">
            <ElevenLabsWidget agentId={import.meta.env.VITE_ELEVENLABS_AGENT_ID || 'YOUR_AGENT_ID_HERE'} />
          </div>

          {!import.meta.env.VITE_ELEVENLABS_AGENT_ID && (
            <div className="mt-4 p-4 bg-[rgba(217,119,6,0.08)] rounded-xl border border-[rgba(217,119,6,0.2)] text-left">
              <h4 className="text-sm font-medium text-deep-charcoal mb-1">Configuration Required</h4>
              <p className="text-[13px] text-stone-gray font-light">
                Set <code className="text-xs text-burgundy bg-warm-white px-1.5 py-0.5 rounded border border-border-gray">VITE_ELEVENLABS_AGENT_ID</code> to activate.
              </p>
            </div>
          )}

          <div className="inline-flex items-center gap-2 px-4 py-2 bg-[rgba(22,163,74,0.06)] rounded-full mt-6">
            <div className="w-2 h-2 rounded-full bg-green-600" />
            <span className="text-[13px] font-medium text-green-600">AI Agent Online</span>
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
            <div key={i} className="bg-white border border-border-gray rounded-2xl p-8">
              <div className="w-10 h-10 rounded-xl bg-burgundy/[6%] flex items-center justify-center mb-4 text-lg text-burgundy">
                {item.icon}
              </div>
              <h3 className="text-base font-semibold text-deep-charcoal mb-2 tracking-tight">{item.title}</h3>
              <p className="text-[13px] text-warm-stone font-light leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 sm:px-16 pb-24">
        <div className="max-w-[700px] mx-auto bg-deep-charcoal rounded-3xl p-10 sm:p-16 text-center">
          <h2 className="font-serif text-3xl sm:text-4xl font-medium text-white mb-3 tracking-tight">Ready for your own AI host?</h2>
          <p className="text-[15px] text-muted-stone font-light mb-8">Set up in 5 minutes. No technical knowledge required.</p>
          <button
            onClick={() => navigate('/#pricing')}
            className="px-8 py-3.5 bg-burgundy hover:bg-burgundy-dark text-white text-[15px] font-semibold rounded-full transition-colors"
          >
            Start Free Trial
          </button>
        </div>
      </section>
    </div>
  );
}
