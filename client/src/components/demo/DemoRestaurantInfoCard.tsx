/**
 * DemoRestaurantInfoCard — shows real restaurant details (address, hours, menu)
 * Only rendered when the preset has an `info` field (e.g. makoto).
 */

import type { DemoPreset } from '../../data/demoPresets';

interface Props {
  info: NonNullable<DemoPreset['info']>;
  lang: string;
}

const LABELS = {
  es: { address: 'Dirección', phone: 'Teléfono', hours: 'Horario', website: 'Web', chef: 'Chef', recognition: 'Reconocimiento', menu: 'Carta destacada' },
  'pt-BR': { address: 'Endereço', phone: 'Telefone', hours: 'Horário', website: 'Site', chef: 'Chef', recognition: 'Reconhecimento', menu: 'Destaques do cardápio' },
  en: { address: 'Address', phone: 'Phone', hours: 'Hours', website: 'Website', chef: 'Chef', recognition: 'Recognition', menu: 'Featured dishes' },
};

function InfoRow({ icon, value }: { icon: React.ReactNode; value: string }) {
  return (
    <div className="flex items-start gap-2.5 text-[13px] text-stone-600">
      <span className="text-stone-400 mt-0.5 flex-shrink-0">{icon}</span>
      <span>{value}</span>
    </div>
  );
}

const PinIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
  </svg>
);
const PhoneIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.1a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 9.91a16 16 0 0 0 6.1 6.1l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
  </svg>
);
const ClockIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);
const GlobeIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);
const StarIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);

export default function DemoRestaurantInfoCard({ info, lang }: Props) {
  const ui = LABELS[lang as keyof typeof LABELS] ?? LABELS.en;

  return (
    <div className="bg-warm-white border border-glass-border-dark rounded-lg p-4 space-y-3">
      {info.address && <InfoRow icon={<PinIcon />} value={info.address} />}
      {info.phone && <InfoRow icon={<PhoneIcon />} value={info.phone} />}
      {info.hours && <InfoRow icon={<ClockIcon />} value={info.hours} />}
      {info.website && <InfoRow icon={<GlobeIcon />} value={info.website} />}
      {info.recognition && <InfoRow icon={<StarIcon />} value={info.recognition} />}

      {info.menu && info.menu.length > 0 && (
        <div className="pt-1 border-t border-glass-border-dark">
          <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2">{ui.menu}</p>
          <div className="flex flex-wrap gap-1.5">
            {info.menu.map((dish) => (
              <span
                key={dish}
                className="text-[11px] px-2 py-0.5 bg-stone-50 border border-stone-200 rounded-full text-stone-600"
              >
                {dish}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
