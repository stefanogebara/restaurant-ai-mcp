import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Phone, MessageSquare, LayoutDashboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * "See It in Action" section — showcases WhatsApp, Voice Agent, and Dashboard
 * via embedded videos/GIFs. Falls back to animated illustrations when no
 * video assets are available.
 *
 * To add real videos:
 *   1. Place .mp4 files in /client/public/videos/
 *   2. Update the SHOWCASE_ITEMS video paths below
 */

interface ShowcaseItem {
  id: string;
  icon: React.ReactNode;
  titleKey: string;
  descKey: string;
  videoSrc: string | null; // null = show placeholder
  color: string;
  bgColor: string;
}

const SHOWCASE_ITEMS: ShowcaseItem[] = [
  {
    id: 'whatsapp',
    icon: <MessageSquare className="w-5 h-5" />,
    titleKey: 'landing.showcase.whatsappTitle',
    descKey: 'landing.showcase.whatsappDesc',
    videoSrc: '/videos/whatsapp-demo.mp4',
    color: 'text-rose-600',
    bgColor: 'bg-rose-50',
  },
  {
    id: 'voice',
    icon: <Phone className="w-5 h-5" />,
    titleKey: 'landing.showcase.voiceTitle',
    descKey: 'landing.showcase.voiceDesc',
    videoSrc: '/videos/voice-demo.mp4',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  {
    id: 'dashboard',
    icon: <LayoutDashboard className="w-5 h-5" />,
    titleKey: 'landing.showcase.dashboardTitle',
    descKey: 'landing.showcase.dashboardDesc',
    videoSrc: '/videos/dashboard-demo.mp4',
    color: 'text-burgundy',
    bgColor: 'bg-burgundy/5',
  },
];

const FEATURE_HIGHLIGHTS: Record<string, { icon: 'whatsapp' | 'phone' | 'dashboard'; pointKeys: string[] }> = {
  whatsapp: {
    icon: 'whatsapp',
    pointKeys: [
      'landing.showcase.whatsapp1',
      'landing.showcase.whatsapp2',
      'landing.showcase.whatsapp3',
      'landing.showcase.whatsapp4',
    ],
  },
  voice: {
    icon: 'phone',
    pointKeys: [
      'landing.showcase.voice1',
      'landing.showcase.voice2',
      'landing.showcase.voice3',
      'landing.showcase.voice4',
    ],
  },
  dashboard: {
    icon: 'dashboard',
    pointKeys: [
      'landing.showcase.dashboard1',
      'landing.showcase.dashboard2',
      'landing.showcase.dashboard3',
      'landing.showcase.dashboard4',
    ],
  },
};

function PlaceholderIcon({ type }: { type: 'whatsapp' | 'phone' | 'dashboard' }) {
  if (type === 'whatsapp') {
    return (
      <div className="w-16 h-16 rounded-full bg-whatsapp flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-8 h-8 text-white" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </div>
    );
  }
  if (type === 'phone') {
    return (
      <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
        <svg viewBox="0 0 24 24" className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.09 5.18 2 2 0 0 1 5.11 3h3a2 2 0 0 1 2 1.72c.13.81.36 1.6.68 2.34a2 2 0 0 1-.45 2.11L8.91 10.6a16 16 0 0 0 6.49 6.49l1.43-1.43a2 2 0 0 1 2.11-.45c.74.32 1.53.55 2.34.68A2 2 0 0 1 22 16.92z" />
        </svg>
      </div>
    );
  }
  // dashboard
  return (
    <div className="w-16 h-16 rounded-full bg-burgundy/10 flex items-center justify-center">
      <svg viewBox="0 0 32 32" className="w-9 h-9" aria-label="Seatable">
        <text x="6" y="24" fontFamily="Georgia, 'Palatino Linotype', serif" fontSize="22" fontWeight="700" fill="#8B1A4A">S</text>
        <circle cx="24" cy="22" r="3" fill="#8B1A4A" opacity="0.5" />
      </svg>
    </div>
  );
}

function VideoPlaceholder({ item, t }: { item: ShowcaseItem; t: (key: string, fallback?: string) => string }) {
  const highlights = FEATURE_HIGHLIGHTS[item.id];

  return (
    <div className={`relative rounded-xl ${item.bgColor} overflow-hidden px-8 py-10 sm:px-12 sm:py-14`}>
      {/* Animated grid dots background */}
      <div className="absolute inset-0 opacity-10">
        <div className="w-full h-full" style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }} />
      </div>

      <div className="relative flex flex-col items-center text-center gap-6">
        <PlaceholderIcon type={highlights.icon} />
        <ul className="space-y-3 text-left max-w-md">
          {highlights.pointKeys.map((key, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className={`mt-1 w-5 h-5 rounded-full ${item.bgColor} border border-current/20 ${item.color} flex items-center justify-center flex-shrink-0 text-xs font-bold`}>
                {i + 1}
              </span>
              <span className="text-sm sm:text-base text-deep-charcoal/80 font-light">{t(key)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function VideoPlayer({ src }: { src: string }) {
  const [isPlaying, setIsPlaying] = useState(true);

  return (
    <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-black shadow-xl">
      <video
        className="w-full h-full object-cover"
        src={src}
        muted
        loop
        playsInline
        preload="auto"
        autoPlay
        aria-label={isPlaying ? 'Click to pause video' : 'Click to play video'}
        role="button"
        tabIndex={0}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={(e) => {
          const video = e.currentTarget;
          if (video.paused) {
            video.play();
          } else {
            video.pause();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const video = e.currentTarget;
            if (video.paused) {
              video.play();
            } else {
              video.pause();
            }
          }
        }}
      />
      {!isPlaying && (
        <button
          type="button"
          aria-label="Play video"
          className="absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity hover:bg-black/20"
          onClick={(e) => {
            const video = (e.currentTarget as HTMLElement).previousElementSibling as HTMLVideoElement;
            video?.play();
          }}
        >
          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
            <Play className="w-7 h-7 text-deep-charcoal ml-1" />
          </div>
        </button>
      )}
    </div>
  );
}

export default function VideoShowcaseSection() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(0);
  const activeItem = SHOWCASE_ITEMS[activeTab];

  return (
    <section className="py-24 px-6 bg-warm-white">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="text-xs font-semibold tracking-[2px] uppercase text-burgundy mb-4">
            {t('landing.showcase.label', 'See It in Action')}
          </div>
          <h2 className="font-serif text-4xl sm:text-[48px] font-medium tracking-tight text-deep-charcoal mb-3">
            {t('landing.showcase.heading', 'Your AI team, working 24/7')}
          </h2>
          <p className="text-lg text-warm-stone font-light max-w-2xl mx-auto">
            {t('landing.showcase.subtitle', 'Watch how Seatable handles reservations via WhatsApp, phone calls, and your live dashboard — automatically.')}
          </p>
        </motion.div>

        {/* Tab selector */}
        <div className="flex justify-center gap-2 mb-8">
          {SHOWCASE_ITEMS.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(i)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                i === activeTab
                  ? `${item.bgColor} ${item.color} ring-1 ring-current/20`
                  : 'text-muted-stone hover:bg-soft-gray'
              }`}
            >
              {item.icon}
              <span className="text-xs sm:text-sm">{t(item.titleKey, item.id)}</span>
            </button>
          ))}
        </div>

        {/* Video / Placeholder */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="max-w-3xl mx-auto"
        >
          {activeItem.videoSrc ? (
            <VideoPlayer src={activeItem.videoSrc} />
          ) : (
            <VideoPlaceholder item={activeItem} t={t as unknown as (key: string, fallback?: string) => string} />
          )}

          {/* Description below video */}
          <div className="mt-4 text-center">
            <h3 className="text-lg font-semibold text-deep-charcoal mb-1">
              {t(activeItem.titleKey, activeItem.id)}
            </h3>
            <p className="text-sm text-warm-stone font-light max-w-lg mx-auto">
              {t(activeItem.descKey, '')}
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
