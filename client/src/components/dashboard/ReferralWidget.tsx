import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../../services/api';
import ThiingsIcon from '../common/ThiingsIcon';

interface ReferralData {
  success: boolean;
  code: string;
  referral_url: string;
  stats: {
    total: number;
    pending: number;
    converted: number;
  };
}

export default function ReferralWidget() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data } = useQuery<ReferralData>({
    queryKey: ['referral', 'code'],
    queryFn: () => authFetch('/api/referral?action=code').then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  if (!data || !data.code) return null;

  const { referral_url, stats } = data;

  const whatsappText = encodeURIComponent(
    `I use Seatable – the AI that manages restaurant reservations. Try it free: ${referral_url}`
  );
  const emailSubject = encodeURIComponent('Try Seatable – AI reservations for restaurants');
  const emailBody = encodeURIComponent(
    `Hey,\n\nI use Seatable – it handles restaurant reservations with AI. Thought you might find it useful.\n\nTry it free here: ${referral_url}\n\nCheers`
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(referral_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text if clipboard API fails
    }
  };

  return (
    <div className="bg-warm-white border border-border-gray rounded-2xl overflow-hidden">
      {/* Header row — always visible, toggles expansion */}
      <button
        type="button"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-soft-gray transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <ThiingsIcon name="users" pxSize={16} className="text-burgundy flex-shrink-0" />
          <span className="text-sm font-medium text-deep-charcoal">Refer &amp; Earn</span>
          {stats.total > 0 && (
            <span className="text-xs text-stone-gray">
              {stats.total} referral{stats.total !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <ThiingsIcon name="chevron-down" pxSize={16} className={`text-muted-stone transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-border-gray">
          {/* Referral URL + Copy */}
          <div className="mt-4">
            <p className="text-xs text-muted-stone mb-2 font-medium tracking-wide uppercase">
              Your referral link
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-soft-gray border border-border-gray rounded-xl px-3 py-2">
                <p className="text-xs text-stone-gray truncate font-mono">{referral_url}</p>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  copied
                    ? 'bg-green-100 text-green-700 border border-green-200'
                    : 'bg-white border border-border-gray text-deep-charcoal hover:border-muted-stone'
                }`}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Stats badges */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              <span className="font-bold">{stats.pending}</span> pending
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
              <span className="font-bold">{stats.converted}</span> converted
            </span>
          </div>

          {/* Share buttons */}
          <div className="flex gap-2.5">
            <a
              href={`https://wa.me/?text=${whatsappText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#25D366] text-white text-[13px] font-medium hover:bg-[#1ebe5d] transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              WhatsApp
            </a>
            <a
              href={`mailto:?subject=${emailSubject}&body=${emailBody}`}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-deep-charcoal text-white text-[13px] font-medium hover:bg-charcoal-dark transition-colors"
            >
              <ThiingsIcon name="mail" pxSize={16} />
              Email
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
