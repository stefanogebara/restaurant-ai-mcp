import { Mail, Github } from 'lucide-react';
import { CONTACT_INFO } from '../data/demoData';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="relative bg-[#0a0a0f] border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand Column */}
          <div className="col-span-1 md:col-span-2">
            <div className="flex items-center space-x-2 mb-4">
              <div className="w-10 h-10 rounded-xl glass-strong flex items-center justify-center">
                <span className="text-2xl">🍽️</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Restaurant AI</h3>
                <p className="text-xs text-gray-400">MCP Platform</p>
              </div>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed max-w-md">
              Transform your restaurant with AI-powered reservations and intelligent table
              management. Built for modern hospitality.
            </p>
            <div className="flex items-center gap-4 mt-4">
              <a
                href={`mailto:${CONTACT_INFO.email}`}
                className="w-10 h-10 glass-subtle rounded-lg flex items-center justify-center hover:glass-strong transition-all group"
              >
                <Mail className="w-5 h-5 text-gray-400 group-hover:text-white" />
              </a>
              <a
                href="https://github.com/stefanogebara/restaurant-ai-mcp"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 glass-subtle rounded-lg flex items-center justify-center hover:glass-strong transition-all group"
              >
                <Github className="w-5 h-5 text-gray-400 group-hover:text-white" />
              </a>
            </div>
          </div>

          {/* Product Column */}
          <div>
            <h4 className="text-white font-semibold mb-4">Product</h4>
            <ul className="space-y-3">
              <li>
                <button
                  onClick={() => scrollToSection('features')}
                  className="text-gray-400 hover:text-white transition-colors text-sm"
                >
                  Features
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('demo')}
                  className="text-gray-400 hover:text-white transition-colors text-sm"
                >
                  Live Demo
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('pricing')}
                  className="text-gray-400 hover:text-white transition-colors text-sm"
                >
                  Pricing
                </button>
              </li>
              <li>
                <a
                  href="/host-dashboard"
                  className="text-gray-400 hover:text-white transition-colors text-sm"
                >
                  Dashboard
                </a>
              </li>
            </ul>
          </div>

          {/* Support Column */}
          <div>
            <h4 className="text-white font-semibold mb-4">Support</h4>
            <ul className="space-y-3">
              <li>
                <button
                  onClick={() => scrollToSection('faq')}
                  className="text-gray-400 hover:text-white transition-colors text-sm"
                >
                  FAQ
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('contact')}
                  className="text-gray-400 hover:text-white transition-colors text-sm"
                >
                  Contact Us
                </button>
              </li>
              <li>
                <a
                  href={`mailto:${CONTACT_INFO.email}`}
                  className="text-gray-400 hover:text-white transition-colors text-sm"
                >
                  Email Support
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/stefanogebara/restaurant-ai-mcp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors text-sm"
                >
                  Documentation
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/10 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-sm">
              © {currentYear} Restaurant AI MCP. All rights reserved.
            </p>
            <div className="flex gap-6">
              <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">
                Privacy Policy
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">
                Terms of Service
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors text-sm">
                Cookie Policy
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
