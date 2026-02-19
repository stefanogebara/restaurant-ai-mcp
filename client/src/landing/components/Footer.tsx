export default function Footer() {
  const currentYear = new Date().getFullYear();

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="bg-[#1C1917] text-[#FAFAF9] py-16 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Top Row */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 mb-12">
          {/* Logo */}
          <a href="/" className="font-serif text-2xl font-bold tracking-tight">
            seatable<span className="text-[#9F1239]">.</span>
          </a>

          {/* Navigation Links */}
          <div className="flex flex-wrap justify-center gap-8 text-sm text-[#A8A29E]">
            <a href="/live-demo" className="hover:text-white transition-colors">
              Live Demo
            </a>
            <button onClick={() => scrollToSection('features')} className="hover:text-white transition-colors">
              Features
            </button>
            <button onClick={() => scrollToSection('pricing')} className="hover:text-white transition-colors">
              Pricing
            </button>
            <button onClick={() => scrollToSection('faq')} className="hover:text-white transition-colors">
              FAQ
            </button>
            <a href="mailto:hello@seatable.io" className="hover:text-white transition-colors">
              Contact
            </a>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[#57534E] text-xs font-light">
            &copy; {currentYear} seatable AI. All rights reserved.
          </p>
          <div className="flex gap-6 text-xs text-[#57534E]">
            <a href="/#pricing" className="hover:text-[#A8A29E] transition-colors">
              Get Started
            </a>
            <a href="/login" className="hover:text-[#A8A29E] transition-colors">
              Login
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
