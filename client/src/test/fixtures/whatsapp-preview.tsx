// Local visual fixture. No authentication bypass, real API calls or sends.
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import '../../index.css';
import '../../i18n/config';
import { WhatsAppWorkspace } from '../../pages/WhatsAppSettingsPage';

if (import.meta.env.DEV) {
  const state = new URLSearchParams(location.search).get('state') || 'disconnected';
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = String(input);
    if (!url.startsWith('/api/')) return originalFetch(input, init);
    // Never send API requests from this fixture, including mutations.
    return new Response(JSON.stringify({ success: false, error: 'Prévia local: envio desativado.' }), { status: 503 });
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
  client.setQueryData(['whatsappStatus'], { enabled: false, api_configured: true, phone_number: null });
  client.setQueryData(['whatsapp-provision'], state === 'active' ? { estado: 'ativo', numero_e164: '+5511999990000' }
    : state === 'pending' ? { estado: 'aguardando_codigo', numero_e164: '+5511999990000', metodo: 'SMS' }
      : state === 'error' ? { estado: 'erro', erro: 'A verificação anterior não foi concluída.' }
        : { estado: 'nao_iniciado' });
  createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><MemoryRouter><div className="min-h-screen bg-brand-paper">
    <div className="border-b border-brand-line bg-brand-paper"><p className="mx-auto max-w-5xl px-4 py-2 text-[12px] text-brand-muted sm:px-8">Prévia local · dados simulados · nenhum envio real</p></div>
    <WhatsAppWorkspace />
  </div></MemoryRouter></QueryClientProvider>);
}
