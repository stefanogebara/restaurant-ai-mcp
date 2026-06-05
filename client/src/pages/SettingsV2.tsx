/**
 * SettingsV2 — implementation of the Claude Design "Configurações" mockup.
 *
 * Mounted at /host-dashboard/settings/v2 alongside the existing
 * /host-dashboard/settings (RestaurantSettingsPage). Existing route is
 * untouched. Reuses useRestaurantSettings + useUpdateRestaurantSettings
 * so saves write to the same /api/restaurant-settings endpoint.
 *
 * Layout:
 *   - SidebarV2 (shared)
 *   - Top bar with breadcrumb
 *   - Title + subtitle
 *   - 2-col: left vertical tab nav, right section card
 *   - Sections: Perfil do restaurante (forms), Horário de funcionamento (toggle rows)
 */

import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useRestaurantSettings, useUpdateRestaurantSettings } from '../hooks/useRestaurantSettings';
import type { BusinessHours } from '../hooks/useRestaurantSettings';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useToast } from '../contexts/ToastContext';
import SidebarV2, { getManagerName } from '../components/v2/SidebarV2';

type TabKey = 'profile' | 'hours' | 'plan' | 'team' | 'account';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'profile', label: 'Perfil do restaurante' },
  { key: 'hours',   label: 'Horário de funcionamento' },
  { key: 'plan',    label: 'Plano e pagamentos' },
  { key: 'team',    label: 'Equipe' },
  { key: 'account', label: 'Conta' },
];

const DAYS_PT: { key: string; label: string }[] = [
  { key: 'monday',    label: 'Segunda' },
  { key: 'tuesday',   label: 'Terça' },
  { key: 'wednesday', label: 'Quarta' },
  { key: 'thursday',  label: 'Quinta' },
  { key: 'friday',    label: 'Sexta' },
  { key: 'saturday',  label: 'Sábado' },
  { key: 'sunday',    label: 'Domingo' },
];

// ─── Field ──────────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  span?: 1 | 2;
}

function Field({ label, value, onChange, type = 'text', placeholder, span = 1 }: FieldProps) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label className="block text-[12px] font-medium text-[#706A65] mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 px-3 rounded-md border border-glass-border-input bg-white text-[14px] text-[#1C1917] focus:outline-none focus:border-[#9F1239] transition-colors"
      />
    </div>
  );
}

// ─── Profile section ────────────────────────────────────────────────────────

function ProfileSection() {
  const { data: settings } = useRestaurantSettings();
  const update = useUpdateRestaurantSettings();
  const { success, error } = useToast();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');

  useEffect(() => {
    if (settings) {
      setName(settings.restaurant_name || '');
      setPhone(settings.phone || '');
      setEmail(settings.email || '');
      setCity(settings.city || '');
      setCountry(settings.country || '');
    }
  }, [settings]);

  const onSave = () => {
    update.mutate(
      { restaurant_name: name, phone, email, city, country },
      {
        onSuccess: () => success('Perfil atualizado'),
        onError: (e) => error(e?.message || 'Falha ao salvar'),
      }
    );
  };

  return (
    <section className="bg-white border border-[#E5E7EB] rounded-xl">
      <header className="px-6 py-5 border-b border-[#E5E7EB] flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#D97706] to-[#9F1239] flex items-center justify-center text-white text-lg font-semibold">
          {name?.[0]?.toUpperCase() || 'R'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-[#1C1917] truncate">{name || 'Seu Restaurante'}</div>
          <div className="flex gap-1.5 mt-1">
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-[#9F1239] text-[#9F1239]">Reservas IA</span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-[#E5E7EB] text-[#706A65]">Cardápio</span>
          </div>
        </div>
        <button type="button" className="text-[13px] text-[#9F1239] hover:underline">Alterar foto</button>
      </header>

      <div className="px-6 py-6">
        <h3 className="text-[15px] font-semibold text-[#1C1917]">Perfil do restaurante</h3>
        <p className="text-[13px] text-[#706A65] mt-1 mb-5">
          Mantenha as informações do seu restaurante atualizadas — elas aparecem para clientes na reserva e na confirmação.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nome do restaurante" value={name} onChange={setName} />
          <Field label="Telefone" value={phone} onChange={setPhone} type="tel" />
          <Field label="E-mail" value={email} onChange={setEmail} type="email" span={2} />
          <Field label="Cidade" value={city} onChange={setCity} />
          <Field label="País" value={country} onChange={setCountry} />
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onSave}
            disabled={update.isPending}
            className="h-9 px-4 rounded-md bg-[#9F1239] text-white text-[13px] font-medium hover:bg-[#7F0F2D] disabled:opacity-50 transition-colors"
          >
            {update.isPending ? 'Salvando…' : 'Salvar perfil'}
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── Hours section ──────────────────────────────────────────────────────────

function HoursSection() {
  const { data: settings } = useRestaurantSettings();
  const update = useUpdateRestaurantSettings();
  const { success, error } = useToast();
  const [hours, setHours] = useState<BusinessHours>({});

  useEffect(() => {
    if (settings?.business_hours) setHours(settings.business_hours);
  }, [settings]);

  const setDay = (day: string, patch: Partial<BusinessHours[string]>) => {
    setHours(prev => {
      // Defaults seed any missing day before the existing values + patch
      // overwrite them — `...prev[day]` first would lose the seed for new
      // days, but the literal-key form duplicated the keys ts noticed.
      const existing = prev[day] || { is_open: false, open_time: '12:00', close_time: '23:00' };
      return { ...prev, [day]: { ...existing, ...patch } };
    });
  };

  const onSave = () => {
    update.mutate(
      { business_hours: hours },
      {
        onSuccess: () => success('Horário atualizado'),
        onError: (e) => error(e?.message || 'Falha ao salvar'),
      }
    );
  };

  return (
    <section className="bg-white border border-[#E5E7EB] rounded-xl">
      <div className="px-6 py-6">
        <h3 className="text-[15px] font-semibold text-[#1C1917]">Horário de funcionamento</h3>
        <p className="text-[13px] text-[#706A65] mt-1 mb-5">
          Defina os horários em que seu restaurante recebe reservas. Dias fechados não aparecem para os clientes.
        </p>
        <div className="space-y-2">
          {DAYS_PT.map(d => {
            const day = hours[d.key] || { is_open: false, open_time: '12:00', close_time: '23:00' };
            return (
              <div key={d.key} className="flex items-center gap-4 py-2 border-b border-[#F5F0EB] last:border-0">
                <button
                  type="button"
                  onClick={() => setDay(d.key, { is_open: !day.is_open })}
                  className={`relative w-9 h-5 rounded-full transition-colors ${day.is_open ? 'bg-[#9F1239]' : 'bg-[#E5E7EB]'}`}
                  aria-pressed={day.is_open}
                  aria-label={`${d.label} ${day.is_open ? 'aberto' : 'fechado'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${day.is_open ? 'left-[18px]' : 'left-0.5'}`} />
                </button>
                <span className="text-[13px] font-medium text-[#1C1917] w-24">{d.label}</span>
                {day.is_open ? (
                  <div className="flex items-center gap-2 text-[13px]">
                    <input
                      type="time"
                      value={day.open_time || '12:00'}
                      onChange={e => setDay(d.key, { open_time: e.target.value })}
                      className="h-8 px-2 rounded border border-[#E5E7EB] bg-white"
                    />
                    <span className="text-[#706A65]">—</span>
                    <input
                      type="time"
                      value={day.close_time || '23:00'}
                      onChange={e => setDay(d.key, { close_time: e.target.value })}
                      className="h-8 px-2 rounded border border-[#E5E7EB] bg-white"
                    />
                  </div>
                ) : (
                  <span className="text-[12px] text-[#706A65]">Fechado</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onSave}
            disabled={update.isPending}
            className="h-9 px-4 rounded-md bg-[#9F1239] text-white text-[13px] font-medium hover:bg-[#7F0F2D] disabled:opacity-50 transition-colors"
          >
            {update.isPending ? 'Salvando…' : 'Salvar horário'}
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── Placeholder sections ───────────────────────────────────────────────────

function PlaceholderSection({ title, message }: { title: string; message: string }) {
  return (
    <section className="bg-white border border-[#E5E7EB] rounded-xl px-6 py-12 text-center">
      <h3 className="text-[15px] font-semibold text-[#1C1917]">{title}</h3>
      <p className="text-[13px] text-[#706A65] mt-2 max-w-sm mx-auto">{message}</p>
    </section>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function SettingsV2() {
  useDocumentTitle('Configurações · seatable');
  const { user } = useAuth();
  const managerName = useMemo(() => getManagerName(user?.email), [user]);
  const [tab, setTab] = useState<TabKey>('profile');

  return (
    <div className="min-h-screen bg-[#FAFAF9] flex">
      <SidebarV2 managerName={managerName} />

      <main className="flex-1 min-w-0">
        {/* Top bar — no /api/search yet, so the mocked input is dropped. */}
        <div className="h-14 border-b border-[#E5E7EB] bg-white px-8 flex items-center">
          <nav aria-label="Breadcrumb" className="text-[12px] text-[#706A65]">
            <Link to="/host-dashboard/v2" className="hover:text-[#1C1917] transition-colors">Início</Link>
            <span className="mx-2">›</span>
            <span className="text-[#1C1917] font-medium">Configurações</span>
          </nav>
        </div>

        <div className="max-w-[1200px] mx-auto px-8 py-8">
          <header className="mb-8">
            <h1
              className="text-[28px] font-semibold tracking-tight text-[#1C1917]"
              style={{ fontFamily: '"Playfair Display", Inter, serif' }}
            >
              Configurações
            </h1>
            <p className="text-[14px] text-[#706A65] mt-1">
              Gerencie o perfil do restaurante, plano e integrações.
            </p>
          </header>

          <div className="grid grid-cols-[200px_1fr] gap-8">
            {/* Left tab nav */}
            <nav className="space-y-0.5" role="tablist" aria-orientation="vertical">
              {TABS.map(t => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    role="tab"
                    aria-selected={active}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={`w-full text-left px-3 py-2 rounded-md text-[13px] transition-colors ${
                      active
                        ? 'text-[#9F1239] font-medium bg-[#9F1239]/[0.06]'
                        : 'text-[#706A65] hover:text-[#1C1917] hover:bg-[#F5F0EB]'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </nav>

            {/* Right section */}
            <div>
              {tab === 'profile' && <ProfileSection />}
              {tab === 'hours' && <HoursSection />}
              {tab === 'plan' && (
                <PlaceholderSection
                  title="Plano e pagamentos"
                  message="Veja seu plano atual e gerencie a assinatura em /subscription/manage. (Vai migrar para esta tela em breve.)"
                />
              )}
              {tab === 'team' && (
                <PlaceholderSection
                  title="Equipe"
                  message="Convide membros da equipe, defina permissões e gerencie acessos. Em breve."
                />
              )}
              {tab === 'account' && (
                <PlaceholderSection
                  title="Conta"
                  message="Altere sua senha, e-mail e preferências de notificação. Em breve."
                />
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
