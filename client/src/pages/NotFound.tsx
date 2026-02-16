import { Link } from 'react-router-dom';
import ThiingsIcon from '../components/common/ThiingsIcon';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl shadow-sm border border-[#E7E5E4] p-8 max-w-md text-center">
        {/* Brand logo */}
        <p className="font-serif text-xl text-[#1C1917] mb-6">
          Seatable<span className="text-[#9F1239]">.</span>
        </p>

        {/* Decorative icon */}
        <div className="w-16 h-16 bg-[#9F1239]/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-[#9F1239]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
        </div>

        <h1 className="font-serif text-6xl font-bold text-[#9F1239] mb-4">404</h1>
        <h2 className="font-serif text-2xl text-[#1C1917] mb-3">Page Not Found</h2>
        <p className="text-[#57534E] mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-xl px-6 py-2.5 shadow-sm transition-colors"
          >
            <ThiingsIcon name="home" size="xs" />
            Go Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 bg-[#F5F5F4] hover:bg-[#E7E5E4] text-[#1C1917] font-semibold rounded-xl px-6 py-2.5 transition-colors"
          >
            <ThiingsIcon name="arrow-left" size="xs" />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
