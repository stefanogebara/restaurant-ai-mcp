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
 * 1. O texto NÃO convida a responder. O envio funciona; o diálogo de volta
 *    ainda não (a resposta cairia no pipeline normal, que não conhece
 *    restaurantes de demo). Prometer conversa aqui geraria a pior decepção
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

export default function TestarNoMeuWhatsApp({ restaurantId, restaurantName, lang }: Props) {
  const [telefone, setTelefone] = useState('');
  const [estado, setEstado] = useState<Estado>('parado');
  const [recado, setRecado] = useState<string | null>(null);

  const pt = !lang || lang.startsWith('pt');
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
        setRecado(j?.error || (pt ? 'Não conseguimos enviar agora.' : 'We could not send it right now.'));
        setEstado('erro');
        return;
      }
      setEstado('enviado');
    } catch {
      setRecado(pt ? 'Sem conexão. Tente de novo.' : 'No connection. Try again.');
      setEstado('erro');
    }
  }

  if (estado === 'enviado') {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
        <p className="text-sm font-medium text-emerald-900">
          {pt ? 'Enviado! Olhe seu WhatsApp 📲' : 'Sent! Check your WhatsApp 📲'}
        </p>
        <p className="mt-1 text-xs text-emerald-800">
          {pt
            ? 'A mensagem saiu do número da plataforma. É assim que seu cliente vai receber.'
            : 'The message came from the platform number. This is how your guest receives it.'}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-glass-border-input bg-white/60 px-4 py-3">
      <p className="text-sm font-semibold text-deep-charcoal">
        {pt ? 'Ver no seu próprio WhatsApp' : 'See it on your own WhatsApp'}
      </p>
      <p className="mt-0.5 text-xs text-muted-stone">
        {pt
          ? 'Enviamos uma mensagem real para o seu celular, do mesmo número que falaria com seus clientes.'
          : 'We send a real message to your phone, from the same number that talks to your guests.'}
      </p>

      <div className="mt-3 flex gap-2">
        <input
          type="tel"
          inputMode="tel"
          value={telefone}
          onChange={(e) => { setTelefone(e.target.value); if (estado === 'erro') setEstado('parado'); }}
          placeholder={pt ? '+55 11 99999-8888' : '+1 555 123 4567'}
          aria-label={pt ? 'Seu número de WhatsApp' : 'Your WhatsApp number'}
          className="min-w-0 flex-1 rounded-lg border border-glass-border-input bg-white px-3 py-2 text-sm text-deep-charcoal placeholder-muted-stone focus:outline-none focus:ring-2 focus:ring-burgundy"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={!podeEnviar}
          className="shrink-0 rounded-lg bg-[#111827] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {estado === 'enviando' ? (pt ? 'Enviando…' : 'Sending…') : (pt ? 'Enviar' : 'Send')}
        </button>
      </div>

      {recado && <p className="mt-2 text-xs text-amber-700">{recado}</p>}

      <p className="mt-2 text-[11px] text-muted-stone">
        {pt
          ? 'Uma mensagem só, para você conferir. Ainda não respondemos por aqui.'
          : 'A single message, just so you can see it. Replies are not handled here yet.'}
      </p>
    </div>
  );
}
