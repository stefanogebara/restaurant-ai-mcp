import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { authFetch } from '../services/api';

interface ElevenLabsWidgetProps {
  agentId: string;
  useSignedUrl?: boolean;
}

/** Map i18n language codes to BCP-47 codes the ElevenLabs widget understands */
const LANG_MAP: Record<string, string> = {
  'pt-BR': 'pt',
  es: 'es',
  en: 'en',
};

/** Provide a localised call-to-action so the bubble is not always English */
const CTA_MAP: Record<string, string> = {
  'pt-BR': 'Precisa de ajuda?',
  es: '\u00bfNecesitas ayuda?',
  en: 'Need help?',
};

export default function ElevenLabsWidget({ agentId, useSignedUrl = true }: ElevenLabsWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { i18n } = useTranslation();
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [signedUrlFailed, setSignedUrlFailed] = useState(false);
  const [loading, setLoading] = useState(useSignedUrl);

  const fetchSignedUrl = useCallback(async () => {
    try {
      const response = await authFetch('/api/elevenlabs-signed-url');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      if (data.signed_url) {
        setSignedUrl(data.signed_url);
      } else {
        throw new Error('No signed_url in response');
      }
    } catch (err) {
      console.warn('Failed to fetch ElevenLabs signed URL, falling back to agent-id:', err);
      setSignedUrlFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (useSignedUrl) {
      fetchSignedUrl();
    }
  }, [useSignedUrl, fetchSignedUrl]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !agentId || agentId === 'YOUR_AGENT_ID_HERE') return;

    // Wait for signed URL fetch to complete when useSignedUrl is enabled
    if (useSignedUrl && loading) return;

    const lang = i18n.language || 'en';
    const widgetLang = LANG_MAP[lang] || lang.split('-')[0] || 'en';

    // Create the custom element programmatically
    const widget = document.createElement('elevenlabs-convai') as HTMLElement & { destroy?: () => void };

    // Use signed URL when available, fall back to agent-id
    if (useSignedUrl && signedUrl && !signedUrlFailed) {
      widget.setAttribute('signed-url', signedUrl);
    } else {
      widget.setAttribute('agent-id', agentId);
    }

    widget.setAttribute('language', widgetLang);
    widget.setAttribute('use-rtc', 'true');

    // Override the default English "Need help?" bubble text
    const ctaText = CTA_MAP[lang] || CTA_MAP.en;
    widget.setAttribute('avatar-text', ctaText);

    // Remove any previous widget children safely
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(widget);

    return () => {
      widget.destroy?.();
      if (container.contains(widget)) container.removeChild(widget);
    };
  }, [agentId, i18n.language, signedUrl, signedUrlFailed, loading, useSignedUrl]);

  if (loading) {
    return (
      <div ref={containerRef} className="elevenlabs-widget-container">
        <div className="flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-burgundy border-t-transparent" />
        </div>
      </div>
    );
  }

  return <div ref={containerRef} className="elevenlabs-widget-container" />;
}
