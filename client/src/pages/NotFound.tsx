import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center px-6">
      <div className="bg-white rounded-2xl shadow-sm border border-[#E7E5E4] p-12 max-w-md text-center">
        {/* Brand logo */}
        <p className="font-serif text-xl text-[#1C1917] mb-8">
          seatable<span className="text-[#9F1239]">.</span>
        </p>

        <h1 className="font-serif text-8xl font-bold text-[#9F1239] mb-4">404</h1>
        <h2 className="font-serif text-2xl text-[#1C1917] mb-3">Page Not Found</h2>
        <p className="text-[#57534E] font-light mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold text-[15px] rounded-full px-6 py-3 shadow-sm transition-colors"
          >
            Go Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 border border-[#1C1917] text-[#1C1917] hover:bg-[#1C1917] hover:text-white font-semibold text-[15px] rounded-full px-6 py-3 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
