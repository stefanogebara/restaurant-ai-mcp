export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-[#1C1917] text-[#FAFAF9] py-20 px-6">
      <div className="max-w-7xl mx-auto text-center">
        {/* Logo */}
        <div className="font-serif text-3xl font-bold tracking-tight mb-8">
          Seatable<span className="text-[#9F1239]">.</span>
        </div>

        {/* Social Links */}
        <div className="flex justify-center gap-8 text-xs font-bold tracking-widest uppercase text-[#A8A29E] mb-12">
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="hover:text-white transition-colors cursor-default"
          >
            Instagram
          </a>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="hover:text-white transition-colors cursor-default"
          >
            Twitter
          </a>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="hover:text-white transition-colors cursor-default"
          >
            LinkedIn
          </a>
        </div>

        {/* Navigation Links */}
        <div className="flex justify-center flex-wrap gap-8 text-sm text-[#A8A29E] mb-12">
          <a href="/live-demo" className="hover:text-white transition-colors">
            Live Demo
          </a>
          <a href="/login" className="hover:text-white transition-colors">
            Get Started
          </a>
          <a href="/login" className="hover:text-white transition-colors">
            Login
          </a>
          <a href="mailto:stefanogebara@gmail.com" className="hover:text-white transition-colors">
            Contact
          </a>
        </div>

        {/* Copyright */}
        <p className="text-[#57534E] text-xs font-light">
          &copy; {currentYear} Seatable AI. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
