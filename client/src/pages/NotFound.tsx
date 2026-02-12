import { Link } from 'react-router-dom';
import ThiingsIcon from '../components/common/ThiingsIcon';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <h1 className="font-serif text-8xl font-bold text-[#9F1239] mb-4">404</h1>
        <h2 className="font-serif text-2xl text-[#1C1917] mb-3">Page Not Found</h2>
        <p className="text-[#57534E] mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#9F1239] text-white rounded-xl hover:bg-[#881337] transition-colors font-medium"
          >
            <ThiingsIcon name="home" size="xs" />
            Go Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 px-6 py-3 border border-[#D6D3D1] text-[#57534E] rounded-xl hover:bg-white transition-colors font-medium"
          >
            <ThiingsIcon name="arrow-left" size="xs" />
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
