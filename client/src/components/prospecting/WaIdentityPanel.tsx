import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { GlassPanel } from '../common/glass';
import { useToast } from '../../contexts/ToastContext';
import { apiError } from './types';

/**
 * Identidade do WhatsApp + linha do tempo de contato (management plane).
 *
 * Mostra em linguagem simples como a Olímpia aparece para os restaurantes
 * (foto, nome, saúde do número) e o que sai automaticamente em cada momento
 * da sequência — com o status de aprovação de cada modelo na Meta.
 */

interface MetaTemplate {
  name: string; language: string; status: string;
  quality: string | null; body_text: string | null; has_url_button: boolean;
}
interface RegistryRow {
  touch_number: number; variant_label: string; meta_template_name: string;
  template_lang: string; active: boolean;
}
interface WaIdentity {
  identity: {
    display_phone_number: string | null;
    verified_name: string | null;
    name_status: string | null;
    quality_rating: string | null;
    profile: {
      about: string | null; description: string | null;
      profile_picture_url: string | null; websites: string[]; email: string | null;
    };
  };
  meta_templates: MetaTemplate[];
  registry: RegistryRow[];
}

const NAME_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: 'Nome aprovado', cls: 'bg-emerald-100 text-emerald-800' },
  PENDING_REVIEW: { label: 'Nome em análise pela Meta', cls: 'bg-amber-100 text-amber-800' },
  AVAILABLE_WITHOUT_REVIEW: { label: 'Nome aprovado', cls: 'bg-emerald-100 text-emerald-800' },
  DECLINED: { label: 'Nome recusado pela Meta', cls: 'bg-rose-100 text-rose-800' },
};

const QUALITY_LABEL: Record<string, { label: string; cls: string }> = {
  GREEN: { label: 'Número saudável', cls: 'bg-emerald-100 text-emerald-800' },
  YELLOW: { label: 'Número em atenção — reduza envios', cls: 'bg-amber-100 text-amber-800' },
  RED: { label: 'Número em risco — pare os envios', cls: 'bg-rose-100 text-rose-800' },
};

const TPL_STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  APPROVED: { label: 'aprovado', cls: 'bg-emerald-100 text-emerald-800' },
  PENDING: { label: 'em análise', cls: 'bg-amber-100 text-amber-800' },
  IN_APPEAL: { label: 'em análise', cls: 'bg-amber-100 text-amber-800' },
  REJECTED: { label: 'recusado', cls: 'bg-rose-100 text-rose-800' },
  PAUSED: { label: 'pausado pela Meta', cls: 'bg-rose-100 text-rose-800' },
};

/** Passos da sequência em linguagem de operador (touch → o que acontece). */
const SEQUENCE_STEPS: Array<{ touch: number | null; when: string; what: string }> = [
  { touch: 1, when: 'Dia 0', what: 'Primeira mensagem (abre a conversa)' },
  { touch: 2, when: '3 dias sem resposta', what: 'Lembrete com um dado novo' },
  { touch: 3, when: '8 dias sem resposta', what: 'Última tentativa (despedida educada)' },
  { touch: null, when: '~23h de silêncio numa conversa', what: 'Cutucada natural da Olímpia (texto livre, automática)' },
  { touch: 4, when: 'Conversa esfriou há 3 dias', what: 'Mensagem de resgate (reabre a conversa)' },
];

function StatusChip({ map, value, fallback }: { map: Record<string, { label: string; cls: string }>; value: string | null; fallback: string }) {
  const hit = value ? map[value] : null;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${hit ? hit.cls : 'bg-stone-100 text-stone-600'}`}>
      {hit ? hit.label : fallback}
    </span>
  );
}

export default function WaIdentityPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState('');
  const [about, setAbout] = useState('');
  const [website, setWebsite] = useState('');
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplTouch, setTplTouch] = useState('1');
  const [tplVariant, setTplVariant] = useState('A');
  const [tplBody, setTplBody] = useState('');
  const [tplButtonUrl, setTplButtonUrl] = useState('https://seatable.one');

  const q = useQuery({
    queryKey: ['prospect-admin', 'wa-identity'],
    queryFn: async () => (await api.get<{ data: WaIdentity }>('/prospect-admin?action=wa-identity')).data.data,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const tplMut = useMutation({
    mutationFn: async (body: {
      name: string; touch_number: number; variant_label: string;
      body_text: string; button_url?: string; example_param: string;
    }) => (await api.post('/prospect-admin?action=template-create', body)).data,
    onSuccess: () => {
      toast.success('Modelo enviado para aprovação da Meta — costuma sair em algumas horas');
      setTplName(''); setTplBody(''); setTplOpen(false);
      qc.invalidateQueries({ queryKey: ['prospect-admin', 'wa-identity'] });
    },
    onError: (err) => toast.error(apiError(err) ?? 'Não foi possível criar o modelo'),
  });

  const profileMut = useMutation({
    mutationFn: async (body: { image_url?: string; about?: string; website?: string }) =>
      (await api.post('/prospect-admin?action=wa-profile', body)).data,
    onSuccess: () => {
      toast.success('Perfil do WhatsApp atualizado');
      setPhotoUrl(''); setAbout(''); setWebsite('');
      qc.invalidateQueries({ queryKey: ['prospect-admin', 'wa-identity'] });
    },
    onError: (err) => toast.error(apiError(err) ?? 'Não foi possível atualizar o perfil'),
  });

  const d = q.data;
  const metaByName = new Map((d?.meta_templates ?? []).map((t) => [t.name, t]));

  function templatesForTouch(touch: number): RegistryRow[] {
    return (d?.registry ?? []).filter((r) => r.touch_number === touch);
  }

  return (
    <GlassPanel className="p-4">
      <button type="button" className="w-full flex items-center justify-between" onClick={() => setOpen(!open)}>
        <div className="text-left">
          <h2 className="font-medium">Identidade do WhatsApp</h2>
          <p className="text-xs text-stone-500">Como a Olímpia aparece para os restaurantes — foto, nome e o que sai automaticamente em cada momento</p>
        </div>
        <span className="text-stone-400 text-sm">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-5">
          {q.isLoading && <p className="text-sm text-stone-500">Carregando identidade…</p>}
          {q.isError && <p className="text-sm text-rose-700">Não foi possível ler a identidade do número (token ou permissão da Meta).</p>}

          {d && (
            <>
              <div className="flex flex-wrap items-center gap-4">
                {d.identity.profile.profile_picture_url ? (
                  <img
                    src={d.identity.profile.profile_picture_url}
                    alt="Foto de perfil da Olímpia"
                    className="w-16 h-16 rounded-full object-cover border border-stone-200"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-stone-200 flex items-center justify-center text-stone-500 text-xs text-center px-1">
                    sem foto
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-sm font-medium text-stone-800">
                    {d.identity.verified_name ?? '—'}
                    <span className="ml-2 text-stone-400 font-normal">{d.identity.display_phone_number ?? ''}</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusChip map={NAME_STATUS_LABEL} value={d.identity.name_status} fallback="Status do nome desconhecido" />
                    <StatusChip map={QUALITY_LABEL} value={d.identity.quality_rating} fallback="Saúde do número desconhecida" />
                  </div>
                  {d.identity.profile.about && <p className="text-xs text-stone-500">“{d.identity.profile.about}”</p>}
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-2">
                <input
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  placeholder="URL da nova foto (jpg/png)"
                  className="px-3 py-1.5 rounded-xl border border-stone-200 bg-white/70 text-sm"
                />
                <input
                  value={about}
                  onChange={(e) => setAbout(e.target.value)}
                  placeholder="Recado curto (ex.: IA para restaurantes)"
                  maxLength={139}
                  className="px-3 py-1.5 rounded-xl border border-stone-200 bg-white/70 text-sm"
                />
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="Site (https://seatable.one)"
                  className="px-3 py-1.5 rounded-xl border border-stone-200 bg-white/70 text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={profileMut.isPending || (!photoUrl && !about && !website)}
                  onClick={() => profileMut.mutate({
                    ...(photoUrl ? { image_url: photoUrl.trim() } : {}),
                    ...(about ? { about: about.trim() } : {}),
                    ...(website ? { website: website.trim() } : {}),
                  })}
                  className="px-3 py-1.5 rounded-xl bg-stone-800 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {profileMut.isPending ? 'Salvando…' : 'Salvar perfil'}
                </button>
                <p className="text-[11px] text-stone-400">
                  O nome exibido ("{d.identity.verified_name ?? '—'}") muda no WhatsApp Manager da Meta e passa por aprovação.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-stone-700 mb-2">O que sai automaticamente, e quando</h3>
                <ul className="space-y-1.5">
                  {SEQUENCE_STEPS.map((step) => {
                    const rows = step.touch ? templatesForTouch(step.touch) : [];
                    const active = rows.filter((r) => r.active);
                    return (
                      <li key={`${step.touch}-${step.when}`} className="flex flex-wrap items-center gap-2 text-sm text-stone-700">
                        <span className="w-44 shrink-0 text-stone-500 text-xs">{step.when}</span>
                        <span>{step.what}</span>
                        {step.touch === null ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800">automática</span>
                        ) : rows.length === 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-stone-100 text-stone-500">sem modelo — este passo não acontece</span>
                        ) : (
                          rows.map((r) => {
                            const meta = metaByName.get(r.meta_template_name);
                            const st = meta ? TPL_STATUS_LABEL[meta.status] : null;
                            return (
                              <span key={r.meta_template_name} className="flex items-center gap-1">
                                <span className="text-xs text-stone-500">{r.meta_template_name}</span>
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${st ? st.cls : 'bg-stone-100 text-stone-500'}`}>
                                  {st ? st.label : 'não existe na Meta'}
                                </span>
                                {!r.active && <span className="text-[10px] text-stone-400">(desligado)</span>}
                              </span>
                            );
                          })
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="text-[11px] text-stone-400 mt-2">
                  Fora da janela de 24h do WhatsApp, só mensagens de modelo aprovado pela Meta podem ser enviadas —
                  por isso cada passo acima precisa de um modelo aprovado e ligado.
                </p>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setTplOpen(!tplOpen)}
                  className="text-sm text-burgundy underline"
                >
                  {tplOpen ? 'Fechar criação de modelo' : '+ Criar novo modelo de mensagem'}
                </button>
                {tplOpen && (
                  <div className="mt-3 space-y-2">
                    <div className="grid sm:grid-cols-3 gap-2">
                      <input
                        value={tplName}
                        onChange={(e) => setTplName(e.target.value)}
                        placeholder="nome_do_modelo (sem espaços)"
                        className="px-3 py-1.5 rounded-xl border border-stone-200 bg-white/70 text-sm"
                      />
                      <select
                        value={tplTouch}
                        onChange={(e) => setTplTouch(e.target.value)}
                        className="px-3 py-1.5 rounded-xl border border-stone-200 bg-white/70 text-sm"
                      >
                        <option value="1">Passo: primeira mensagem</option>
                        <option value="2">Passo: lembrete (3 dias)</option>
                        <option value="3">Passo: despedida (8 dias)</option>
                        <option value="4">Passo: resgate de conversa</option>
                      </select>
                      <input
                        value={tplVariant}
                        onChange={(e) => setTplVariant(e.target.value.toUpperCase().slice(0, 1))}
                        placeholder="Abordagem (A, B, C…)"
                        className="px-3 py-1.5 rounded-xl border border-stone-200 bg-white/70 text-sm"
                      />
                    </div>
                    <textarea
                      value={tplBody}
                      onChange={(e) => setTplBody(e.target.value)}
                      rows={5}
                      maxLength={1024}
                      placeholder={'Texto da mensagem. Use {{1}} onde o nome do restaurante deve entrar.'}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-white/70 text-sm"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={tplButtonUrl}
                        onChange={(e) => setTplButtonUrl(e.target.value)}
                        placeholder="Link do botão (vazio = sem botão)"
                        className="flex-1 min-w-48 px-3 py-1.5 rounded-xl border border-stone-200 bg-white/70 text-sm"
                      />
                      <button
                        type="button"
                        disabled={tplMut.isPending || !tplName.trim() || !tplBody.trim()}
                        onClick={() => tplMut.mutate({
                          name: tplName.trim(),
                          touch_number: parseInt(tplTouch, 10),
                          variant_label: tplVariant || 'A',
                          body_text: tplBody,
                          example_param: 'Cantina Bella',
                          ...(tplButtonUrl.trim() ? { button_url: tplButtonUrl.trim() } : {}),
                        })}
                        className="px-3 py-1.5 rounded-xl bg-stone-800 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        {tplMut.isPending ? 'Enviando…' : 'Enviar para aprovação da Meta'}
                      </button>
                    </div>
                    <p className="text-[11px] text-stone-400">
                      O modelo nasce desligado. Quando a Meta aprovar (status muda aqui no painel), ligue-o no painel de Abordagens.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </GlassPanel>
  );
}
