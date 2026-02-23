interface DemoBannerProps {
  daysLeft: number;
  token: string;
}

export default function DemoBanner({ daysLeft, token }: DemoBannerProps) {
  const urgencyClass =
    daysLeft <= 0
      ? 'bg-red-50 border-b border-red-200 text-red-700'
      : daysLeft <= 2
      ? 'bg-amber-50 border-b border-amber-200 text-amber-800'
      : 'bg-burgundy/[4%] border-b border-burgundy/15 text-deep-charcoal';

  const expiryLabel =
    daysLeft <= 0
      ? 'Demo expired'
      : daysLeft === 1
      ? 'Demo mode · 1 day left'
      : `Demo mode · ${daysLeft} days left`;

  return (
    <div className={`sticky top-0 z-50 flex items-center justify-between px-4 sm:px-6 py-2.5 ${urgencyClass}`}>
      <span className="text-sm font-medium">{expiryLabel}</span>
      <a
        href={`/login?from=demo&token=${token}`}
        className="px-4 py-1.5 bg-burgundy text-white rounded-full text-xs font-semibold hover:bg-burgundy-dark transition-colors whitespace-nowrap"
      >
        Upgrade to keep your data &rarr;
      </a>
    </div>
  );
}
