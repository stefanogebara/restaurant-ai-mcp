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
    videoSrc: null, // Replace with '/videos/whatsapp-demo.mp4' when available
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  {
    id: 'voice',
    icon: <Phone className="w-5 h-5" />,
    titleKey: 'landing.showcase.voiceTitle',
    descKey: 'landing.showcase.voiceDesc',
    videoSrc: null, // Replace with '/videos/voice-demo.mp4' when available
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  {
    id: 'dashboard',
    icon: <LayoutDashboard className="w-5 h-5" />,
    titleKey: 'landing.showcase.dashboardTitle',
    descKey: 'landing.showcase.dashboardDesc',
    videoSrc: null, // Replace with '/videos/dashboard-demo.mp4' when available
    color: 'text-burgundy',
    bgColor: 'bg-burgundy/5',
  },
];

function VideoPlaceholder({ item }: { item: ShowcaseItem }) {
  const { t } = useTranslation();

  return (
    <div className={`relative aspect-[16/10] rounded-xl ${item.bgColor} flex flex-col items-center justify-center gap-3 overflow-hidden`}>
      {/* Animated grid dots background */}
      <div className="absolute inset-0 opacity-10">
        <div className="w-full h-full" style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }} />
      </div>

      <div className={`relative w-16 h-16 rounded-2xl ${item.bgColor} border-2 border-current/20 ${item.color} flex items-center justify-center`}>
        <Play className="w-7 h-7" />
      </div>
      <p className={`relative text-sm font-medium ${item.color}`}>
        {t('landing.showcase.comingSoon', 'Video coming soon')}
      </p>
    </div>
  );
}

function VideoPlayer({ src }: { src: string }) {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-black">
      <video
        className="w-full h-full object-cover"
        src={src}
        muted
        loop
        playsInline
        autoPlay={isPlaying}
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
      />
      {!isPlaying && (
        <button
          type="button"
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
              <span className="hidden sm:inline">{t(item.titleKey, item.id)}</span>
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
            <VideoPlaceholder item={activeItem} />
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
