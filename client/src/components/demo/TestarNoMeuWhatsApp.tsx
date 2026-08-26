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

export default function TestarNoMeuWhatsApp({ restaurantId, restaurantName, lang }: Props) {
  const [telefone, setTelefone] = useState('');
  const [estado, setEstado] = useState<Estado>('parado');
  const [recado, setRecado] = useState<string | null>(null);
  const [podeResponder, setPodeResponder] = useState(false);

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
      // Só convida a responder quando o backend confirmou o vínculo. Se o
      // telefone já pertence a um cliente real, o vínculo é recusado de
      // propósito — e aí a promessa de conversa seria falsa.
      setPodeResponder(Boolean(j?.data?.can_reply));
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
          {podeResponder
            ? (pt
              ? 'Responda por lá: "quero mesa pra 4 sexta" — a IA do SEU restaurante atende, com seus horários e suas mesas.'
              : 'Reply there: "table for 4 on Friday" — YOUR restaurant\'s AI answers, with your hours and your tables.')
            : (pt
              ? 'A mensagem saiu do número da plataforma. É assim que seu cliente vai receber.'
              : 'The message came from the platform number. This is how your guest receives it.')}
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
          className="shrink-0 rounded-lg bg-[#1C1917] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {estado === 'enviando' ? (pt ? 'Enviando…' : 'Sending…') : (pt ? 'Enviar' : 'Send')}
        </button>
      </div>

      {recado && <p className="mt-2 text-xs text-amber-700">{recado}</p>}

      {/* Antes do envio não se promete diálogo: o vínculo pode ser recusado
          (número de cliente real) e só o backend sabe disso. */}
      <p className="mt-2 text-[11px] text-muted-stone">
        {pt
          ? 'Uma mensagem só, do número da plataforma.'
          : 'A single message, from the platform number.'}
      </p>
    </div>
  );
}
