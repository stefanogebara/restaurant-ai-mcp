import { useState } from 'react';
import { MessageCircle, Link } from 'lucide-react';

interface SharePromptProps {
  className?: string;
}

const SHARE_URL = 'https://seatable.one';
const WA_LINK = `https://wa.me/?text=${encodeURIComponent('Check this out — an AI that handles restaurant reservations: seatable.one')}`;

export default function SharePrompt({ className = '' }: SharePromptProps) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    await navigator.clipboard.writeText(SHARE_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`bg-white rounded-xl border border-[#E7E5E4] p-4 ${className}`}>
      <h4 className="text-sm font-semibold text-[#1C1917] mb-1">
        Know a restaurant owner?
      </h4>
      <p className="text-xs text-[#78716C] mb-3">
        Share this demo with them
      </p>

      <div className="flex gap-2">
        <a
          href={WA_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 inline-flex items-center justify-center gap-1.5 bg-[#25D366] hover:bg-[#20bd5a] text-white text-sm font-medium py-2 rounded-full transition-colors"
        >
          <MessageCircle size={15} />
          Share on WhatsApp
        </a>

        <button
          type="button"
          onClick={copyLink}
          className="flex-1 inline-flex items-center justify-center gap-1.5 border border-[#E7E5E4] hover:bg-[#FAFAF9] text-[#1C1917] text-sm font-medium py-2 rounded-full transition-colors"
        >
          <Link size={15} />
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}
