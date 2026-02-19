import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FAFAF9] flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 sm:px-16 py-6 border-b border-[#E7E5E4]">
        <Link to="/" className="font-serif text-2xl font-semibold tracking-tight text-[#1C1917]">
          seatable<span className="text-[#9F1239]">.</span>
        </Link>
      </nav>

      {/* 404 Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="relative mb-4">
          <span className="font-serif text-[120px] sm:text-[180px] font-medium leading-none tracking-[-8px] text-[#E7E5E4]">
            404
          </span>
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[120px] h-1 bg-[#9F1239] rounded-full" />
        </div>

        <h1 className="font-serif text-2xl sm:text-4xl font-medium tracking-tight mb-3">
          Page not found
        </h1>

        <p className="text-base text-[#78716C] font-light max-w-[400px] leading-relaxed mb-10">
          The page you're looking for doesn't exist or has been moved. Let's get you back on track.
        </p>

        <div className="flex gap-3">
          <Link
            to="/"
            className="text-[15px] font-semibold text-white bg-[#9F1239] hover:bg-[#881337] px-8 py-3.5 rounded-full transition-colors"
          >
            Go Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="text-[15px] font-medium text-[#57534E] border border-[#D6D3D1] hover:border-[#A8A29E] px-8 py-3.5 rounded-full transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-8 sm:px-16 py-6 border-t border-[#E7E5E4] text-center">
        <p className="text-[13px] text-[#A8A29E]">&copy; 2026 Seatable. All rights reserved.</p>
      </footer>
    </div>
  );
}
