import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import DemoWhatsAppSim from '../components/demo/DemoWhatsAppSim';
import PreviaBlindSpots from '../components/previa/PreviaBlindSpots';
import { useDemoSession } from '../hooks/useDemoSession';
import type { ScrapedRestaurantData } from '../components/demo/RealRestaurantCard';

/**
 * A Prévia — a página que a Olímpia oferece no WhatsApp durante a prospecção.
 *
 * Gerada por lead, aberta no celular no meio do serviço. Dois atos:
 *   1. O WhatsApp da casa atendendo sozinho (o "uau, é o MEU restaurante").
 *   2. Os pontos cegos do negócio (no-show, nota) — só com dado público
 *      verificável e estimativa honesta.
 * Fecho: um único gesto de custo zero — voltar pro WhatsApp. Sem formulário,
 * sem login, sem contador de urgência.
 *
 * Desenhada por dois estudos (72 conversas reais + 6 frentes de pesquisa),
 * fiel ao design system Warm Glass. É pt-BR-only de propósito: a prospecção
 * da Olímpia é BR. A tool criar_demo (P4) gera o /previa/:token real; até lá,
 * /previa (sem token) mostra o exemplo Bar do Zé para preview interno.
 */

interface PreviaData {
  name: string;
  rating: number | null;
  reviewCount: number;
  address: string | null;
  topReview: { text: string; author: string } | null;
  photoRef: string | null;
}

const EXAMPLE: PreviaData = {
  name: 'Bar do Zé',
  rating: 4.6,
  reviewCount: 142,
  address: 'R. Butantã, 200 - Butantã, São Paulo',
  topReview: { text: 'Melhor picanha do Butantã, atendimento nota 10.', author: 'Marcos' },
  photoRef: null,
};

function fromScraped(s: ScrapedRestaurantData): PreviaData {
  const r = Array.isArray(s.top_reviews) ? s.top_reviews.find((rv) => rv && rv.text) : null;
  return {
    name: s.name || 'seu restaurante',
    rating: typeof s.rating === 'number' ? s.rating : null,
    reviewCount: s.review_count || 0,
    address: s.address || null,
    topReview: r && r.text ? { text: r.text, author: r.author || 'um cliente' } : null,
    photoRef: s.photo_ref || null,
  };
}

// P3 beacon — best-effort POST so the cockpit sees the open / CTA tap (and
// Olímpia can react). keepalive lets the CTA tap's beacon survive the navigation
// to WhatsApp. Never blocks or throws into the page.
function sendPreviaBeacon(token: string, event: 'opened' | 'cta_tapped') {
  try {
    void fetch('/api/previa-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, event }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* best-effort beacon */
  }
}

function HeroPhoto({ photoRef, name }: { photoRef: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!photoRef || failed) {
    return (
      <div className="mt-4 h-[150px] rounded-2xl overflow-hidden relative bg-gradient-to-br from-amber-200 via-amber-500/70 to-amber-900/70">
        <span className="absolute left-3 bottom-2 text-[10px] text-white/90 bg-black/25 px-2 py-0.5 rounded-full">
          {name}
        </span>
      </div>
    );
  }
  return (
    <div className="mt-4 h-[150px] rounded-2xl overflow-hidden relative bg-soft-gray">
      <img
        src={`/api/places-photo?ref=${encodeURIComponent(photoRef)}&maxWidth=1200`}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="absolute inset-0 w-full h-full object-cover"
      />
    </div>
  );
}

export default function PreviaPage() {
  const { token } = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();
  const { data: session, isLoading, isError } = useDemoSession(token);

  // Validate the ?wa= number before it reaches the wa.me href — digits only,
  // 8–15 long (E.164 range). A malformed value falls back to a number-less
  // wa.me, never an injected path/query. (review finding)
  const rawWa = (searchParams.get('wa') || (import.meta.env.VITE_OLIMPIA_WA_NUMBER as string | undefined) || '').replace(/\D/g, '');
  const waNumber = /^[0-9]{8,15}$/.test(rawWa) ? rawWa : '';

  const data: PreviaData | null = useMemo(() => {
    if (!token) return EXAMPLE;
    const scraped = session?.restaurant?.scraped_data;
    return scraped ? fromScraped(scraped) : null;
  }, [token, session]);

  // Fire the "opened" beacon once, only for a real (tokened) prévia that loaded —
  // never the internal EXAMPLE preview.
  const beaconedOpen = useRef(false);
  useEffect(() => {
    if (!token || !session || beaconedOpen.current) return;
    beaconedOpen.current = true;
    sendPreviaBeacon(token, 'opened');
  }, [token, session]);

  // Loading / error states (only when a token was actually provided)
  if (token && isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="glass-card px-6 py-5 text-muted-stone text-sm">carregando a prévia…</div>
      </div>
    );
  }
  if (token && (isError || !data)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="glass-panel px-6 py-6 max-w-sm text-center">
          <div className="font-serif text-2xl text-deep-charcoal mb-2">Esse link expirou</div>
          <p className="text-sm text-muted-stone">Chama a Olímpia no WhatsApp que ela monta uma prévia nova rapidinho.</p>
        </div>
      </div>
    );
  }

  const d = data as PreviaData;
  const ratingLabel = d.rating != null ? d.rating.toLocaleString('pt-BR', { minimumFractionDigits: 1 }) : null;
  const waText = encodeURIComponent(`Oi! Vi a prévia do ${d.name} 👀`);
  const waHref = waNumber ? `https://wa.me/${waNumber}?text=${waText}` : `https://wa.me/?text=${waText}`;

  return (
    <div className="min-h-screen px-5 pb-16 pt-6">
      <div className="max-w-md mx-auto">

        {/* ATO 0 — abertura: mata o golpe em 3s com dado real */}
        <section>
          {ratingLabel && (
            <span className="glass-pill inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[12.5px] text-charcoal-dark">
              <span className="text-amber-600 font-bold">★ {ratingLabel}</span>
              {d.reviewCount > 0 && <span className="text-muted-stone">· {d.reviewCount} avaliações no Google</span>}
            </span>
          )}
          <h1 className="font-serif text-[40px] leading-[1.02] text-deep-charcoal mt-3 mb-1">{d.name}</h1>
          {d.address && <p className="text-[12.5px] text-muted-stone">{d.address}</p>}

          {d.topReview && (
            <div className="glass-card p-4 mt-4">
              <p className="text-[15px] leading-relaxed text-charcoal-dark">“{d.topReview.text}”</p>
              <p className="text-[12.5px] text-muted-stone mt-2">— {d.topReview.author} · no Google</p>
            </div>
          )}

          <HeroPhoto photoRef={d.photoRef} name={d.name} />

          <div className="inline-flex items-center gap-1.5 mt-4 text-[11.5px] text-emerald-600 bg-emerald-500/10 rounded-full px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 previa-pulse" />
            puxado do seu Google agora
          </div>
          <p className="text-[11.5px] text-muted-stone mt-3">
            prévia feita pela Olímpia, assistente virtual da Seatable · seatable.one
          </p>
        </section>

        {/* ATO 1 — o zap atendendo sozinho */}
        <section className="mt-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-burgundy mb-2">
            Ato 1 · seu zap atendendo sozinho
          </p>
          <h2 className="font-serif text-xl text-deep-charcoal mb-3">O WhatsApp do {d.name}, respondendo sozinho</h2>
          <DemoWhatsAppSim restaurantName={d.name} lang="pt-BR" />
          <p className="text-[12px] text-charcoal-dark mt-3 leading-relaxed">
            E na sexta ela confirma sozinha — <b>quem some você descobre antes</b> da mesa ficar vazia.
          </p>
        </section>

        {/* ATO 2 — pontos cegos */}
        <PreviaBlindSpots restaurantName={d.name} rating={d.rating} />

        {/* FECHO — o gesto de menor atrito */}
        <section className="mt-6">
          <div className="glass-panel p-6 text-center">
            <p className="font-serif text-[21px] leading-tight text-deep-charcoal mb-4">
              Quer ver isso rodando no zap do {d.name}?
            </p>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => { if (token) sendPreviaBeacon(token, 'cta_tapped'); }}
              className="inline-flex items-center gap-2 bg-burgundy text-white rounded-full px-6 py-3 text-[15px] font-semibold shadow-lg shadow-burgundy/25 active:translate-y-px transition-transform"
            >
              Me chama aqui →
            </a>
          </div>
        </section>

      </div>
    </div>
  );
}
