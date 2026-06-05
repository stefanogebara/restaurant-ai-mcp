/**
 * SofiaV2 — implementation of the Claude Design "WhatsApp + Voice Agent"
 * mockup. Merges what currently lives split across WhatsAppSettingsPage and
 * VoiceSettingsPage into one unified "Sofia" agent page.
 *
 * Mounted at /host-dashboard/sofia/v2 alongside the existing routes. Nothing
 * in WhatsAppSettingsPage / VoiceSettingsPage is touched.
 *
 * Sections (matching the mockup):
 *   - Agent header with avatar, online status, live counters, master toggle
 *   - Tab nav: Agente / Conversas / Treinamento / Integrações
 *   - "Canais" — WhatsApp Business + Voice channel cards
 *   - "Personalidade" — 4 trait cards
 *   - "Formalidade" — slider
 *   - Right column: live WhatsApp chat preview
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useVoicePersona, useSaveVoicePersona, VoicePersonaForbiddenError } from '../hooks/useVoicePersona';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useToast } from '../contexts/ToastContext';
import SidebarV2, { getManagerName } from '../components/v2/SidebarV2';

type TabKey = 'agent' | 'conversations' | 'training' | 'integrations';
type Personality = 'warm' | 'concise' | 'formal' | 'suggestive';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'agent',          label: 'Agente' },
  { key: 'conversations',  label: 'Conversas' },
  { key: 'training',       label: 'Treinamento' },
  { key: 'integrations',   label: 'Integrações' },
];

const PERSONALITIES: { key: Personality; title: string; body: string }[] = [
  { key: 'warm',       title: 'Calorosa',  body: 'Acolhedora, próxima. Pergunta nome, lembra preferências.' },
  { key: 'concise',    title: 'Concisa',   body: 'Direta ao ponto. Confirma rápido. Sem rodeios.' },
  { key: 'formal',     title: 'Formal',    body: 'Trato senhor/senhora. Voz pausada. Tom institucional.' },
  { key: 'suggestive', title: 'Sugestiva', body: 'Oferece especiais. Sugere mesa, horário, prato.' },
];

// ─── Header ─────────────────────────────────────────────────────────────────

// AgentHeader. Pause toggle + live counters were in the mock but neither
// has a backend yet — pausing Sofia requires a settings.is_active flag and
// the WhatsApp/voice routers would have to honour it, and the counters
// need a metrics endpoint. Both removed until they're real.
function AgentHeader() {
  return (
    <header className="bg-white border border-[#E5E7EB] rounded-xl px-6 py-5 flex items-center gap-5">
      <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#D97706] to-[#9F1239] flex items-center justify-center text-white text-xl font-semibold">
        S
      </div>
      <div className="flex-1 min-w-0">
        <h1
          className="text-[24px] font-semibold tracking-tight text-[#1C1917] leading-none"
          style={{ fontFamily: '"Playfair Display", Inter, serif' }}
        >
          Sofia
        </h1>
        <p className="text-[13px] text-[#706A65] mt-1">
          Sua atendente virtual, atende no WhatsApp e chamadas de voz.
        </p>
        <div className="flex items-center gap-2 mt-2.5 text-[12px]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-pulse" />
          <span className="text-[#16A34A] font-medium">Sofia online</span>
        </div>
      </div>
    </header>
  );
}

// ─── Channels ───────────────────────────────────────────────────────────────

function ChannelCard({
  title,
  status,
  configured,
  onConfigure,
}: {
  title: string;
  status: string;
  configured: boolean;
  onConfigure: () => void;
}) {
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-md flex items-center justify-center text-lg ${
        configured ? 'bg-[#16A34A]/[0.1] text-[#16A34A]' : 'bg-[#F5F0EB] text-[#706A65]'
      }`}>
        {title.includes('Whats') ? '💬' : '📞'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-medium text-[#1C1917]">{title}</div>
        <div className="text-[12px] text-[#706A65]">{status}</div>
      </div>
      <button
        type="button"
        onClick={onConfigure}
        className="text-[12px] text-[#9F1239] hover:underline"
      >
        {configured ? 'Editar' : 'Configurar'}
      </button>
    </div>
  );
}

// ─── Personality picker ─────────────────────────────────────────────────────

function PersonalityGrid({
  selected,
  onSelect,
}: {
  selected: Personality;
  onSelect: (p: Personality) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {PERSONALITIES.map(p => {
        const active = selected === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onSelect(p.key)}
            aria-pressed={active}
            className={`text-left p-4 rounded-xl border transition-colors ${
              active
                ? 'border-[#9F1239] bg-[#9F1239]/[0.04]'
                : 'border-[#E5E7EB] bg-white hover:border-[#706A65]'
            }`}
          >
            <div className={`text-[14px] font-semibold ${active ? 'text-[#9F1239]' : 'text-[#1C1917]'}`}>
              {p.title}
            </div>
            <div className="text-[12px] text-[#706A65] mt-1 leading-relaxed">{p.body}</div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Test chat preview (right column) ────────────────────────────────────────

interface ChatMsg { id: string; from: 'them' | 'us'; text: string; time: string; }

const SAMPLE_CHAT: ChatMsg[] = [
  { id: '1', from: 'them', text: 'Oi! Tem mesa pra 4 hoje às 21h?', time: '20:34' },
  { id: '2', from: 'us',   text: 'Oi! Sim, temos mesa pra 4 às 21h. Posso confirmar no seu nome?', time: '20:34' },
  { id: '3', from: 'them', text: 'Sim, Carlos. (11) 98765-4321.', time: '20:35' },
  { id: '4', from: 'us',   text: 'Reservado, Carlos ✅ Mesa pra 4, hoje 21h. Até logo!', time: '20:35' },
];

function ChatPreview() {
  const [input, setInput] = useState('');
  return (
    <aside className="bg-white border border-[#E5E7EB] rounded-xl flex flex-col h-full min-h-[420px]">
      <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#16A34A] animate-pulse" />
        <span className="text-[13px] font-medium text-[#1C1917]">Teste rápido · WhatsApp</span>
      </div>
      <div className="flex-1 px-4 py-3 space-y-2 bg-[#ECE5DD] overflow-y-auto">
        {SAMPLE_CHAT.map(m => (
          <div
            key={m.id}
            className={`max-w-[78%] px-3 py-1.5 rounded-lg text-[13px] leading-relaxed ${
              m.from === 'them'
                ? 'bg-white text-[#1C1917] rounded-bl-sm'
                : 'bg-[#DCF8C6] text-[#1C1917] rounded-br-sm ml-auto'
            }`}
          >
            {m.text}
            <span className="block text-[10px] text-[#667781] mt-0.5 text-right">{m.time}</span>
          </div>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // Preview only — does not actually send.
          setInput('');
        }}
        className="px-3 py-2 border-t border-[#E5E7EB] flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Escreva uma mensagem…"
          className="flex-1 h-9 px-3 rounded-md border border-glass-border-input bg-[#FAFAF9] text-[13px] focus:outline-none focus:border-[#9F1239] focus:bg-white transition-colors"
        />
        <button
          type="submit"
          className="h-9 px-3 rounded-md bg-[#9F1239] text-white text-[13px] font-medium hover:bg-[#7F0F2D] transition-colors disabled:opacity-50"
          disabled={!input.trim()}
        >
          Enviar
        </button>
      </form>
    </aside>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SofiaV2() {
  useDocumentTitle('Sofia · seatable');
  const { user } = useAuth();
  const managerName = useMemo(() => getManagerName(user?.email), [user]);
  const { success, error } = useToast();
  const [tab, setTab] = useState<TabKey>('agent');
  // Personality + formalidade live in local state only — there's no backend
  // column for them yet. Labels below make this explicit so users don't
  // configure things that quietly disappear on reload.
  const [personality, setPersonality] = useState<Personality>('warm');
  const [formalidade, setFormalidade] = useState(30); // 0 = casual, 100 = formal

  const { data: persona, error: personaError } = useVoicePersona();
  const save = useSaveVoicePersona();
  const [agentName, setAgentName] = useState('Sofia');
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    if (persona) {
      setAgentName(persona.agent_name || 'Sofia');
      setGreeting(persona.agent_greeting || '');
    }
  }, [persona]);

  const onSavePersona = () => {
    save.mutate(
      { agent_name: agentName, agent_greeting: greeting },
      {
        onSuccess: () => success('Sofia atualizada'),
        onError: (e) => error(e instanceof Error ? e.message : 'Falha ao salvar'),
      }
    );
  };

  // Account lacks the paid plan with `voice_ai`. Surface a clear upsell card
  // in place of the Identity form instead of silently falling back to
  // default values — the previous behavior left users wondering why their
  // changes never persisted.
  const personaLocked = personaError instanceof VoicePersonaForbiddenError;
  const upgradeUrl = personaLocked ? (personaError.upgradeUrl || '/subscription/manage') : null;

  return (
    <div className="min-h-screen bg-[#FAFAF9] flex">
      <SidebarV2 managerName={managerName} />

      <main className="flex-1 min-w-0">
        {/* Top bar — no /api/search yet, so the mocked input is dropped. */}
        <div className="h-14 border-b border-[#E5E7EB] bg-white px-8 flex items-center">
          <nav aria-label="Breadcrumb" className="text-[12px] text-[#706A65]">
            <Link to="/host-dashboard/v2" className="hover:text-[#1C1917] transition-colors">Início</Link>
            <span className="mx-2">›</span>
            <span className="text-[#1C1917] font-medium">Sofia</span>
          </nav>
        </div>

        <div className="max-w-[1400px] mx-auto px-8 py-7">
          <AgentHeader />

          {/* Tab nav */}
          <nav className="mt-6 border-b border-[#E5E7EB] flex gap-1" role="tablist">
            {TABS.map(t => {
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={isActive}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2.5 text-[13px] -mb-px border-b-2 transition-colors ${
                    isActive
                      ? 'border-[#9F1239] text-[#9F1239] font-medium'
                      : 'border-transparent text-[#706A65] hover:text-[#1C1917]'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>

          {tab === 'agent' && (
            <div className="grid grid-cols-[1fr_360px] gap-6 mt-6">
              {/* Left: agent config */}
              <div className="space-y-6">
                {/* Identity — gated behind a paid plan via personaLocked */}
                {personaLocked ? (
                  <section className="bg-white border border-[#E5E7EB] rounded-xl p-6">
                    <div className="flex items-start gap-4">
                      <span className="w-10 h-10 rounded-full bg-[#9F1239]/[0.1] text-[#9F1239] flex items-center justify-center text-lg shrink-0">
                        🔒
                      </span>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-[14px] font-semibold text-[#1C1917]">
                          Personalizar Sofia requer plano Profissional
                        </h3>
                        <p className="text-[12px] text-[#706A65] mt-1.5">
                          A Sofia trabalha no plano gratuito com configurações padrão. Para escolher
                          nome, saudação e personalidade, ative o plano Profissional (14 dias grátis).
                        </p>
                        <a
                          href={upgradeUrl || '/subscription/manage'}
                          className="inline-flex items-center mt-4 h-9 px-4 rounded-md bg-[#9F1239] text-white text-[13px] font-medium hover:bg-[#7F0F2D] transition-colors"
                        >
                          Começar teste grátis
                        </a>
                      </div>
                    </div>
                  </section>
                ) : (
                  <section className="bg-white border border-[#E5E7EB] rounded-xl p-5">
                    <h3 className="text-[14px] font-semibold text-[#1C1917]">Identidade da Sofia</h3>
                    <p className="text-[12px] text-[#706A65] mt-1 mb-4">
                      Personalize o nome e a saudação. Aparece no WhatsApp e na ligação de voz.
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[12px] font-medium text-[#706A65] mb-1.5">Nome</label>
                        <input
                          type="text"
                          value={agentName}
                          onChange={e => setAgentName(e.target.value)}
                          className="w-full h-9 px-3 rounded-md border border-glass-border-input bg-white text-[14px] focus:outline-none focus:border-[#9F1239]"
                        />
                      </div>
                      <div>
                        <label className="block text-[12px] font-medium text-[#706A65] mb-1.5">Saudação</label>
                        <input
                          type="text"
                          value={greeting}
                          onChange={e => setGreeting(e.target.value)}
                          placeholder="Oi, sou a Sofia do [restaurante]!"
                          className="w-full h-9 px-3 rounded-md border border-glass-border-input bg-white text-[14px] focus:outline-none focus:border-[#9F1239]"
                        />
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={onSavePersona}
                        disabled={save.isPending}
                        className="h-9 px-4 rounded-md bg-[#9F1239] text-white text-[13px] font-medium hover:bg-[#7F0F2D] disabled:opacity-50 transition-colors"
                      >
                        {save.isPending ? 'Salvando…' : 'Salvar identidade'}
                      </button>
                    </div>
                  </section>
                )}

                {/* Channels */}
                <section>
                  <h3 className="text-[14px] font-semibold text-[#1C1917] mb-3">Canais</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <ChannelCard
                      title="WhatsApp Business"
                      status="Conectado · responde em <3s"
                      configured={true}
                      onConfigure={() => window.location.assign('/host-dashboard/whatsapp')}
                    />
                    <ChannelCard
                      title="Atendimento por voz"
                      status="Atende ligações 24h"
                      configured={true}
                      onConfigure={() => window.location.assign('/host-dashboard/voice-settings')}
                    />
                  </div>
                </section>

                {/* Personality */}
                <section>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[14px] font-semibold text-[#1C1917]">Personalidade</h3>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#F5F0EB] text-[#706A65]">prévia</span>
                    </div>
                    <span className="text-[11px] text-[#706A65]">Não salva ainda — em breve</span>
                  </div>
                  <PersonalityGrid selected={personality} onSelect={setPersonality} />
                </section>

                {/* Formality slider */}
                <section className="bg-white border border-[#E5E7EB] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[14px] font-semibold text-[#1C1917]">Formalidade</h3>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#F5F0EB] text-[#706A65]">prévia</span>
                    </div>
                    <span className="text-[12px] text-[#706A65]">
                      {formalidade < 25 ? 'Bem informal' : formalidade < 50 ? 'Casual' : formalidade < 75 ? 'Cordial' : 'Formal'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={formalidade}
                    onChange={e => setFormalidade(Number(e.target.value))}
                    className="w-full accent-[#9F1239]"
                    aria-label="Nível de formalidade"
                  />
                  <div className="flex justify-between text-[10px] text-[#706A65] mt-1.5">
                    <span>Oi, tudo bem?</span>
                    <span>Olá, em que posso ajudá-lo(a)?</span>
                  </div>
                </section>
              </div>

              {/* Right: chat preview */}
              <ChatPreview />
            </div>
          )}

          {tab === 'conversations' && (
            <section className="bg-white border border-[#E5E7EB] rounded-xl px-6 py-12 text-center mt-6">
              <h3 className="text-[15px] font-semibold text-[#1C1917]">Conversas</h3>
              <p className="text-[13px] text-[#706A65] mt-2 max-w-sm mx-auto">
                Histórico de conversas da Sofia chega em breve. Por enquanto, veja a aba Reservas para ver bookings criados pela IA.
              </p>
            </section>
          )}

          {tab === 'training' && (
            <section className="bg-white border border-[#E5E7EB] rounded-xl px-6 py-12 text-center mt-6">
              <h3 className="text-[15px] font-semibold text-[#1C1917]">Treinamento</h3>
              <p className="text-[13px] text-[#706A65] mt-2 max-w-sm mx-auto">
                Ensine Sofia sobre seu cardápio, regras e estilo. Em breve nesta tela; por hora, use a aba "Ensine sua IA" no onboarding.
              </p>
            </section>
          )}

          {tab === 'integrations' && (
            <section className="bg-white border border-[#E5E7EB] rounded-xl px-6 py-12 text-center mt-6">
              <h3 className="text-[15px] font-semibold text-[#1C1917]">Integrações</h3>
              <p className="text-[13px] text-[#706A65] mt-2 max-w-sm mx-auto">
                Conecte sua agenda Google, sistema POS e ferramentas externas. Em breve.
              </p>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
