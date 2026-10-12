import { useState } from 'react';
import { trackWhatsAppTapped } from '../../lib/analytics';

/**
 * "Testar no MEU WhatsApp" — item 7 do plano zero-toque.
 *
 * O simulador ao lado prova a conversa na tela. Isto tira o produto da tela e
 * põe no telefone do dono: ele digita o número, o WhatsApp dele apita.
 *
 * DUAS HONESTIDADES QUE A UI CARREGA:
 *
 * 1. O convite a responder aparece SÓ quando o backend confirma `can_reply` —
 *    ou seja, quando o telefone foi de fato vinculado ao demo. O vínculo é
 *    recusado de propósito quando o número já pertence a um cliente real (não
 *    se rouba a conversa de quem opera de verdade), e nesse caso a promessa de
 *    diálogo seria falsa. Prometer conversa que não acontece é a pior decepção
 *    possível: o dono responde animado e ninguém atende.
 *
 * 2. Cada envio custa dinheiro e o backend impõe três limites (por número, por
 *    IP e um teto diário). Quando um deles bloqueia, a mensagem do servidor é
 *    exibida como está — inventar um texto genérico esconderia do dono que ele
 *    só precisa esperar alguns minutos.
 */

interface Props {
  restaurantId?: string;
  restaurantName: string;
  lang?: string;
}

type Estado = 'parado' | 'enviando' | 'enviado' | 'erro';

const COPY = {
  pt: {
    heading: 'Ver no seu próprio WhatsApp',
    description: 'Enviamos uma mensagem real para o seu celular, do mesmo número que falaria com seus clientes.',
    phoneLabel: 'Seu número de WhatsApp',
    phonePlaceholder: '+55 11 99999-8888',
    send: 'Enviar',
    sending: 'Enviando…',
    requested: 'Mensagem encaminhada. Confira seu WhatsApp em alguns instantes.',
    canReply: 'Se ela chegar, responda por lá: "quero mesa pra 4 sexta" — a IA do seu restaurante atende com seus horários e mesas.',
    cannotReply: 'Ela vem do número da plataforma. É assim que seu cliente receberá as mensagens.',
    oneMessage: 'Uma mensagem só, do número da plataforma.',
    sendFailed: 'Não conseguimos enviar agora.',
    offline: 'Sem conexão. Tente de novo.',
  },
  en: {
    heading: 'See it on your own WhatsApp',
    description: 'We send a real message to your phone, from the same number that talks to your guests.',
    phoneLabel: 'Your WhatsApp number',
    phonePlaceholder: '+1 555 123 4567',
    send: 'Send',
    sending: 'Sending…',
    requested: 'Message submitted. Check your WhatsApp in a moment.',
    canReply: 'If it arrives, reply: "table for 4 on Friday" — your restaurant’s AI answers with your hours and tables.',
    cannotReply: 'It comes from the platform number. This is how your guest will receive messages.',
    oneMessage: 'One message, from the platform number.',
    sendFailed: 'We could not send it right now.',
    offline: 'No connection. Try again.',
  },
  es: {
    heading: 'Pruébalo en tu propio WhatsApp',
    description: 'Enviamos un mensaje real a tu móvil desde el mismo número que hablaría con tus clientes.',
    phoneLabel: 'Tu número de WhatsApp',
    phonePlaceholder: '+34 600 123 456',
    send: 'Enviar',
    sending: 'Enviando…',
    requested: 'Solicitud de envío aceptada. Revisa tu WhatsApp en unos instantes.',
    canReply: 'Si llega, responde: «mesa para 4 el viernes» — la IA de tu restaurante atenderá con tus horarios y mesas.',
    cannotReply: 'Llega desde el número de la plataforma. Así recibirán los mensajes tus clientes.',
    oneMessage: 'Un solo mensaje, desde el número de la plataforma.',
    sendFailed: 'No pudimos enviarlo ahora.',
    offline: 'Sin conexión. Inténtalo de nuevo.',
  },
} as const;

type Language = keyof typeof COPY;

function errorMessage(response: { code?: string; error?: string; retryAfter?: number } | null, language: Language, fallback: string): string {
  if (language === 'pt') return response?.error || fallback;
  const minutes = Math.max(1, Math.ceil(Number(response?.retryAfter || 0) / 60));
  const translated: Record<'en' | 'es', Record<string, string>> = {
    en: {
      INVALID_PHONE: 'Enter a valid WhatsApp number with country and area code.',
      PHONE_COOLDOWN: `A test was requested for this number recently. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      IP_LIMIT: `Too many tests from this connection. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      GLOBAL_LIMIT: 'WhatsApp tests are temporarily unavailable. Please try again later.',
      PROVIDER_UNAVAILABLE: 'WhatsApp tests are unavailable right now.',
      TEST_TEMPLATE_UNAVAILABLE: 'The WhatsApp test is not yet available in your restaurant’s language.',
      SEND_FAILED: 'We could not send it now. Please try again in a few minutes.',
    },
    es: {
      INVALID_PHONE: 'Introduce un número de WhatsApp válido con prefijo internacional y de área.',
      PHONE_COOLDOWN: `Ya se solicitó una prueba para este número. Vuelve a intentarlo en ${minutes} minuto${minutes === 1 ? '' : 's'}.`,
      IP_LIMIT: `Demasiadas pruebas desde esta conexión. Vuelve a intentarlo en ${minutes} minuto${minutes === 1 ? '' : 's'}.`,
      GLOBAL_LIMIT: 'Las pruebas de WhatsApp no están disponibles temporalmente. Inténtalo más tarde.',
      PROVIDER_UNAVAILABLE: 'Las pruebas de WhatsApp no están disponibles ahora.',
      TEST_TEMPLATE_UNAVAILABLE: 'La prueba de WhatsApp aún no está disponible en el idioma de tu restaurante.',
      SEND_FAILED: 'No pudimos enviarlo ahora. Inténtalo de nuevo en unos minutos.',
    },
  };
  return translated[language][response?.code || ''] || response?.error || fallback;
}

export default function TestarNoMeuWhatsApp({ restaurantId, restaurantName, lang }: Props) {
  const [telefone, setTelefone] = useState('');
  const [estado, setEstado] = useState<Estado>('parado');
  const [recado, setRecado] = useState<string | null>(null);
  const [podeResponder, setPodeResponder] = useState(false);

  const language = lang?.toLowerCase().startsWith('es') ? 'es' : lang?.toLowerCase().startsWith('en') ? 'en' : 'pt';
  const copy = COPY[language];
  const digitos = telefone.replace(/\D/g, '');
  const podeEnviar = digitos.length >= 10 && estado !== 'enviando';

  async function enviar() {
    if (!podeEnviar) return;
    setEstado('enviando');
    setRecado(null);
    trackWhatsAppTapped();

    try {
      const r = await fetch('/api/demo-send-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digitos, restaurant_id: restaurantId, restaurant_name: restaurantName }),
      });
      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.success) {
        // A mensagem do servidor é específica (cooldown, teto, provedor fora) e
        // ajuda mais que qualquer texto genérico que eu escrevesse aqui.
        setRecado(errorMessage(j, language, copy.sendFailed));
        setEstado('erro');
        return;
      }
      // Só convida a responder quando o backend confirmou o vínculo. Se o
      // telefone já pertence a um cliente real, o vínculo é recusado de
      // propósito — e aí a promessa de conversa seria falsa.
      setPodeResponder(Boolean(j?.data?.can_reply));
      setEstado('enviado');
    } catch {
      setRecado(copy.offline);
      setEstado('erro');
    }
  }

  if (estado === 'enviado') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
        <p className="text-sm font-medium text-emerald-900">
          {copy.requested}
        </p>
        <p className="mt-1 text-xs text-emerald-800">
          {podeResponder ? copy.canReply : copy.cannotReply}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-glass-border-input bg-white/60 px-4 py-3">
      <p className="text-sm font-semibold text-deep-charcoal">
        {copy.heading}
      </p>
      <p className="mt-0.5 text-xs text-muted-stone">
        {copy.description}
      </p>

      <div className="mt-3 flex gap-2">
        <input
          type="tel"
          inputMode="tel"
          value={telefone}
          onChange={(e) => { setTelefone(e.target.value); if (estado === 'erro') setEstado('parado'); }}
          placeholder={copy.phonePlaceholder}
          aria-label={copy.phoneLabel}
          className="min-w-0 flex-1 rounded-lg border border-glass-border-input bg-white px-3 py-2 text-sm text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={!podeEnviar}
          className="shrink-0 rounded-lg bg-deep-charcoal px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {estado === 'enviando' ? copy.sending : copy.send}
        </button>
      </div>

      {recado && <p className="mt-2 text-xs text-amber-700">{recado}</p>}

      {/* Antes do envio não se promete diálogo: o vínculo pode ser recusado
          (número de cliente real) e só o backend sabe disso. */}
      <p className="mt-2 text-[11px] text-muted-stone">
        {copy.oneMessage}
      </p>
    </div>
  );
}
