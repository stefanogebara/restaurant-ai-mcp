import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSSEChat, type ChatMessage } from '../hooks/useSSEChat';

interface RestaurantContext {
  name: string;
  rating: number | null;
  review_count: number;
  phone: string | null;
  address: string | null;
  cuisine_type: string;
  business_hours: Record<string, unknown> | null;
  editorial_summary: string | null;
  top_reviews: Array<{ text: string; rating: number; author: string; time: string }>;
  pain_points?: Array<{ category: string; label: string; match_count: number; quotes: string[] }>;
  hours_text: string[] | null;
  website: string | null;
  google_maps_url: string | null;
  city?: string;
}

export default function DemoConversation() {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') || undefined;
  const query = searchParams.get('q') || undefined;
  // Previously hard-coded "São Paulo" as the default city — a Madrid or
  // Lisbon owner arriving without a city param saw the AI talking about
  // São Paulo. Now we infer a sensible default from the active locale and
  // only override when the URL explicitly provides ?city=.
  const localeDefaultCity = i18n.language?.startsWith('es')
    ? 'Madrid'
    : i18n.language?.startsWith('en')
      ? 'New York'
      : 'São Paulo';
  const city = searchParams.get('city') || localeDefaultCity;

  // Localized suggested prompts. The previous version hardcoded them in
  // pt-BR — pt-BR is the app's default locale, but English- and Spanish-
  // speaking visitors landed on the conversion-critical demo intro page
  // staring at Portuguese suggestions they couldn't read.
  const SUGGESTED_PROMPTS = useMemo(() => [
    t('demo.conversation.suggestedHowItWorks', 'How does the WhatsApp reservation flow work?'),
    t('demo.conversation.suggestedPricing', 'How much does it cost?'),
    t('demo.conversation.suggestedNoShows', 'How do you reduce no-shows?'),
    t('demo.conversation.suggestedMyRestaurant', 'I want to see what it would look like for my restaurant'),
  ], [t]);

  const [context, setContext] = useState<RestaurantContext | null>(null);
  const [isLoadingContext, setIsLoadingContext] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [initSent, setInitSent] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Track the post-success navigation timeout so we can cancel it on unmount —
  // otherwise React warns about setState-on-unmounted-component, and the user
  // gets a ghost navigation if they click Back during the 2s pause.
  const navTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
  }, []);

  // Handle demo creation
  const handleAction = useCallback(async (action: string, data: unknown) => {
    if (action !== 'create_demo' || isConverting) return;
    setIsConverting(true);
    setConvertError(null);

    try {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';
      const ctx = (data || context) as RestaurantContext;

      const res = await fetch(`${apiBase}/demo/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurant_name: ctx?.name || 'Restaurante',
          cuisine_type: ctx?.cuisine_type || 'casual_dining',
          city: ctx?.city || city,
          contact_email: 'demo@seatable.one',
          contact_name: 'Demo',
          country: 'Brazil',
          scraped_data: ctx,
        }),
      });

      const result = await res.json().catch(() => null);
      // Three failure modes the previous code all silently swallowed: !res.ok,
      // res.ok with no demo_token, and res.ok with { success:false }. All left
      // the "Setting up your dashboard…" overlay stuck forever — user abandons.
      if (!res.ok || !result?.demo_token) {
        const message = result?.error || t('demo.conversation.convertError', 'Could not create your demo. Please try again.');
        console.error('[DemoConversation] create_demo failed', { status: res.status, body: result });
        setConvertError(message);
        setIsConverting(false);
        return;
      }
      navTimeoutRef.current = setTimeout(() => {
        navigate(`/demo?token=${result.demo_token}`);
      }, 2000);
    } catch (err) {
      console.error('[DemoConversation] create_demo network error', err);
      setConvertError(t('demo.conversation.convertError', 'Could not create your demo. Please try again.'));
      setIsConverting(false);
    }
  }, [context, city, isConverting, navigate, t]);

  const { messages, isStreaming, sendMessage } = useSSEChat({
    endpoint: '/demo-conversation',
    onAction: handleAction,
  });

  // ─── Load restaurant context ────────────────────────────────────────────

  useEffect(() => {
    async function loadContext() {
      const apiBase = import.meta.env.VITE_API_BASE_URL || '/api';

      try {
        if (token) {
          // Path A: Load from demo session + scrape for reviews
          const sessionRes = await fetch(`${apiBase}/demo/session?token=${encodeURIComponent(token)}`);
          const sessionData = await sessionRes.json();

          if (sessionData.success && sessionData.restaurant) {
            const r = sessionData.restaurant;
            // Also scrape for reviews/rating (not stored in DB)
            let scraped: Partial<RestaurantContext> = {};
            try {
              const scrapeRes = await fetch(`${apiBase}/scrape-restaurant`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: r.restaurant_name, city: r.city || localeDefaultCity }),
              });
              const scrapeData = await scrapeRes.json();
              if (scrapeData.results?.[0]) scraped = scrapeData.results[0];
            } catch { /* scrape failure is non-fatal */ }

            setContext({
              name: r.restaurant_name,
              rating: scraped.rating ?? null,
              review_count: (scraped.review_count as number) ?? 0,
              phone: r.phone || scraped.phone || null,
              address: scraped.address ?? null,
              cuisine_type: scraped.cuisine_type ?? r.restaurant_type ?? 'Restaurante',
              business_hours: r.business_hours,
              editorial_summary: scraped.editorial_summary ?? null,
              top_reviews: (scraped.top_reviews as RestaurantContext['top_reviews']) ?? [],
              hours_text: scraped.hours_text as string[] ?? null,
              website: r.website || scraped.website || null,
              google_maps_url: scraped.google_maps_url ?? null,
              city: r.city || localeDefaultCity,
            });
          } else {
            setLoadError(t('demo.conversation.notFound', 'Demo not found or expired.'));
          }
        } else if (query) {
          // Path B: Scrape on the fly
          const scrapeRes = await fetch(`${apiBase}/scrape-restaurant`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, city }),
          });
          const scrapeData = await scrapeRes.json();
          const r = scrapeData.results?.[0];

          if (r) {
            setContext({
              ...r,
              top_reviews: r.top_reviews || [],
              city,
            });
          } else {
            setLoadError(t('demo.conversation.restaurantNotFound', 'Restaurant not found. Try another name.'));
          }
        } else {
          setLoadError(t('demo.conversation.missingParams', 'Please provide ?token= or ?q= in the URL.'));
        }
      } catch (err) {
        console.error('[DemoConversation] loadContext failed', err);
        setLoadError(t('demo.conversation.loadError', 'Could not load restaurant data.'));
      } finally {
        setIsLoadingContext(false);
      }
    }

    loadContext();
  }, [token, query, city]);

  // ─── Auto-trigger first AI message ──────────────────────────────────────

  useEffect(() => {
    if (context && !initSent && !isLoadingContext) {
      setInitSent(true);
      sendMessage('__init__', {
        restaurant_context: context,
        demo_token: token,
        // Use the active i18n language — the previous hardcoded 'pt-BR' made
        // the AI respond in Portuguese to every visitor regardless of locale.
        lang: i18n.language,
      });
    }
  }, [context, initSent, isLoadingContext, sendMessage, token, i18n.language]);

  // ─── Auto-scroll ────────────────────────────────────────────────────────

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Handlers ───────────────────────────────────────────────────────────

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    sendMessage(text, { lang: i18n.language });
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    if (isStreaming) return;
    sendMessage(prompt, { lang: i18n.language });
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  // Loading state
  if (isLoadingContext) {
    return (
      <div className="min-h-screen bg-warm-white flex flex-col items-center justify-center gap-4">
        <div className="font-serif text-2xl text-deep-charcoal">
          seatable<span className="text-burgundy">.</span>
        </div>
        <div className="w-8 h-8 border-2 border-burgundy border-t-transparent rounded-full animate-spin" />
        <p className="text-warm-stone text-sm">{t('demo.conversation.loading', 'Loading restaurant data...')}</p>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="min-h-screen bg-warm-white flex flex-col items-center justify-center gap-4 p-6">
        <div className="font-serif text-2xl text-deep-charcoal">
          seatable<span className="text-burgundy">.</span>
        </div>
        <p className="text-warm-stone text-sm text-center max-w-md">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-white flex flex-col">
      {/* Top bar */}
      <header className="flex-shrink-0 border-b border-border-gray bg-warm-white px-4 sm:px-6 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="font-serif text-lg font-semibold text-deep-charcoal">
            seatable<span className="text-burgundy">.</span>
          </div>
          {context && (
            <div className="flex items-center gap-2 text-sm text-warm-stone">
              <span className="font-medium text-deep-charcoal">{context.name}</span>
              {context.rating && (
                <span className="text-xs bg-stone-100 px-2 py-0.5 rounded-full">
                  {context.rating} ★
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Conversion overlay */}
      {isConverting && (
        <div className="fixed inset-0 bg-warm-white/90 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="w-10 h-10 border-2 border-burgundy border-t-transparent rounded-full animate-spin" />
          <p className="text-deep-charcoal font-medium">{t('demo.conversation.settingUp', 'Setting up your personalised dashboard...')}</p>
          <p className="text-warm-stone text-sm">{t('demo.conversation.fewSeconds', 'This takes a few seconds')}</p>
        </div>
      )}

      {/* Conversion error banner — surfaces a stuck overlay if the create_demo
          call fails, instead of leaving the user with a perpetual spinner. */}
      {convertError && !isConverting && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-md w-[calc(100%-2rem)] bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {convertError}
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto" role="log" aria-label={t('demo.conversation.ariaChat', 'AI conversation')} aria-live="polite">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} isStreaming={isStreaming && msg === messages[messages.length - 1] && msg.role === 'assistant'} />
          ))}

          {/* Suggested prompts — show only after first AI message and when not streaming */}
          {messages.length === 1 && !isStreaming && (
            <div className="flex flex-wrap gap-2 pt-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => handleSuggestedPrompt(prompt)}
                  className="text-[13px] px-3.5 py-2 border border-border-gray rounded-full text-warm-stone hover:text-deep-charcoal hover:border-deep-charcoal/30 transition-colors bg-warm-white"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-border-gray bg-warm-white px-4 sm:px-6 py-3">
        <div className="max-w-2xl mx-auto flex items-end gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('demo.conversation.placeholder', 'Type your message...')}
            aria-label={t('demo.conversation.placeholder', 'Type your message...')}
            rows={1}
            disabled={isStreaming || isConverting}
            className="flex-1 resize-none rounded-xl border border-border-gray px-4 py-2.5 text-sm text-deep-charcoal placeholder:text-muted-stone focus:outline-none focus:border-burgundy/40 disabled:opacity-50 transition-colors"
            style={{ minHeight: '42px', maxHeight: '120px' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming || isConverting}
            aria-label={t('demo.conversation.send', 'Send message')}
            className="flex-shrink-0 w-10 h-10 rounded-xl bg-burgundy hover:bg-burgundy-dark disabled:opacity-30 text-white flex items-center justify-center transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Message Bubble Component ─────────────────────────────────────────────

function MessageBubble({ message, isStreaming }: { message: ChatMessage; isStreaming: boolean }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-burgundy text-white rounded-br-md'
            : 'bg-stone-100 text-deep-charcoal rounded-bl-md'
        }`}
      >
        {message.content || (isStreaming && (
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 bg-warm-stone rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-warm-stone rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-warm-stone rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        ))}
        {isStreaming && message.content && (
          <span className="inline-block w-0.5 h-4 bg-burgundy/60 animate-pulse ml-0.5 align-text-bottom" />
        )}
      </div>
    </div>
  );
}
