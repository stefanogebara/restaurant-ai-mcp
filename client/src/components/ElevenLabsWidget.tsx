import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface ElevenLabsWidgetProps {
  agentId: string;
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

export default function ElevenLabsWidget({ agentId }: ElevenLabsWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { i18n } = useTranslation();

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !agentId || agentId === 'YOUR_AGENT_ID_HERE') return;

    const lang = i18n.language || 'en';
    const widgetLang = LANG_MAP[lang] || lang.split('-')[0] || 'en';

    // Create the custom element programmatically
    const widget = document.createElement('elevenlabs-convai') as HTMLElement & { destroy?: () => void };
    widget.setAttribute('agent-id', agentId);
    widget.setAttribute('language', widgetLang);

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
  }, [agentId, i18n.language]);

  return <div ref={containerRef} className="elevenlabs-widget-container" />;
}
