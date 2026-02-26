import { Link } from 'react-router-dom';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 sm:px-16 py-10 border-t border-border-gray">
      <div className="font-serif text-xl font-semibold text-deep-charcoal">
        seatable<span className="text-burgundy">.</span>
      </div>
      <div className="flex items-center gap-6">
        <Link to="/privacy" className="text-[13px] text-muted-stone hover:text-deep-charcoal transition-colors">
          Privacy Policy
        </Link>
        <Link to="/terms" className="text-[13px] text-muted-stone hover:text-deep-charcoal transition-colors">
          Terms of Service
        </Link>
        <p className="text-[13px] text-muted-stone">
          &copy; {currentYear} Seatable.
        </p>
      </div>
    </footer>
  );
}
