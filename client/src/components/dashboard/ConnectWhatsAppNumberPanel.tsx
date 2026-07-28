import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../../services/api';

/**
 * Conectar um número WhatsApp ao restaurante — item 4 do plano zero-toque.
 *
 * O dono informa um número que ELE controla (fixo ou celular). A Meta manda o
 * código de verificação NESSE número (SMS ou ligação — ligação é o caminho
 * para o fixo do restaurante), ele digita aqui, e o roteamento multi-tenant
 * passa a apontar pra ele em até 1 minuto. Nenhum passo envolve o fundador.
 *
 * O estado vem do backend (/api/whatsapp-provision) — a máquina real mora lá;
 * este painel é só a janela: nao_iniciado → aguardando_codigo → ativo | erro.
 */

interface EstadoProvisionamento {
  estado: 'nao_iniciado' | 'aguardando_codigo' | 'ativo' | 'erro';
  numero_e164?: string;
  metodo?: string;
  erro?: string | null;
}

const API = '/api/whatsapp-provision';

async function lerEstado(): Promise<EstadoProvisionamento> {
  const r = await authFetch(API);
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.success) throw new Error(j?.error || `HTTP ${r.status}`);
  return j.data;
}

export default function ConnectWhatsAppNumberPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [cc, setCc] = useState('55');
  const [numero, setNumero] = useState('');
  const [metodo, setMetodo] = useState<'sms' | 'voice'>('sms');
  const [codigo, setCodigo] = useState('');
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const { data: estado, isLoading, error: erroLeitura } = useQuery({
    queryKey: ['whatsapp-provision'],
    queryFn: lerEstado,
    staleTime: 30_000,
    retry: 1,
  });

  const acao = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const r = await authFetch(API, { method: 'POST', body: JSON.stringify(body) });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) throw new Error(j?.error || `HTTP ${r.status}`);
      return j.data as EstadoProvisionamento;
    },
    onSuccess: (data) => {
      setErroAcao(null);
      setCodigo('');
      qc.setQueryData(['whatsapp-provision'], data);
    },
    onError: (e: Error) => setErroAcao(e.message),
  });

  const iniciar = () => acao.mutate({ action: 'iniciar', cc, numero, metodo });
  const confirmar = () => acao.mutate({ action: 'confirmar', codigo });

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-5 mb-4">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 className="text-sm font-semibold text-[#111827]">
            {t('whatsappProvision.title', 'Connect your WhatsApp number')}
          </h3>
          <p className="text-xs text-[#6B7280] mt-1">
            {t('whatsappProvision.subtitle', 'Your AI answers on a number you own. Meta sends a verification code to that number — by SMS or phone call (use the call for a landline).')}
          </p>
        </div>
        {estado?.estado === 'ativo' && (
          <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {t('whatsappProvision.activeBadge', 'Active')}
          </span>
        )}
      </div>

      {isLoading && (
        <p className="text-xs text-[#9CA3AF] mt-3">{t('common.loading', 'Loading...')}</p>
      )}

      {/* Falha de leitura é honesta — sem esconder atrás de formulário vazio */}
      {!isLoading && erroLeitura && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
          {(erroLeitura as Error).message}
        </p>
      )}

      {!isLoading && !erroLeitura && (estado?.estado === 'nao_iniciado' || estado?.estado === 'erro') && (
        <div className="mt-4 space-y-3">
          {estado?.estado === 'erro' && estado.erro && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{estado.erro}</p>
          )}
          <div className="flex gap-2">
            <div className="w-20">
              <label className="block text-[11px] text-[#6B7280] mb-1">{t('whatsappProvision.cc', 'Country')}</label>
              <div className="flex items-center gap-1 border border-[#E5E7EB] rounded-lg px-2 py-2 text-sm">
                <span className="text-[#9CA3AF]">+</span>
                <input
                  value={cc}
                  onChange={(e) => setCc(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  className="w-full outline-none text-[#111827]"
                  aria-label={t('whatsappProvision.cc', 'Country')}
                />
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-[11px] text-[#6B7280] mb-1">{t('whatsappProvision.number', 'Number (area code + number)')}</label>
              <input
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="11 3456-7890"
                className="w-full border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#111827]/30 text-[#111827]"
              />
            </div>
          </div>
          <div>
            <span className="block text-[11px] text-[#6B7280] mb-1.5">{t('whatsappProvision.method', 'Where should Meta send the code?')}</span>
            <div className="flex gap-2">
              {(['sms', 'voice'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetodo(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    metodo === m
                      ? 'bg-[#111827] text-white border-[#111827]'
                      : 'bg-white text-[#374151] border-[#E5E7EB] hover:border-[#9CA3AF]'
                  }`}
                >
                  {m === 'sms'
                    ? t('whatsappProvision.methodSms', 'SMS')
                    : t('whatsappProvision.methodVoice', 'Phone call (landline)')}
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={iniciar}
            disabled={acao.isPending || numero.replace(/\D/g, '').length < 8}
            className="w-full bg-[#111827] text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40 transition-opacity"
          >
            {acao.isPending
              ? t('whatsappProvision.sending', 'Requesting code...')
              : t('whatsappProvision.start', 'Receive verification code')}
          </button>
        </div>
      )}

      {!isLoading && estado?.estado === 'aguardando_codigo' && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-[#374151] bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg px-3 py-2">
            {t('whatsappProvision.codeSentTo', 'Meta sent a code to')}{' '}
            <span className="font-semibold">{estado.numero_e164}</span>
            {estado.metodo === 'VOICE'
              ? ` ${t('whatsappProvision.byCall', 'by phone call')}`
              : ' SMS'}
          </p>
          <div className="flex gap-2">
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="123456"
              inputMode="numeric"
              className="flex-1 border border-[#E5E7EB] rounded-lg px-3 py-2 text-sm tracking-[0.3em] font-mono outline-none focus:border-[#111827]/30 text-[#111827]"
              aria-label={t('whatsappProvision.code', 'Verification code')}
            />
            <button
              type="button"
              onClick={confirmar}
              disabled={acao.isPending || codigo.length < 4}
              className="bg-[#111827] text-white rounded-lg px-4 text-sm font-medium disabled:opacity-40"
            >
              {acao.isPending ? '...' : t('whatsappProvision.confirm', 'Confirm')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => qc.setQueryData(['whatsapp-provision'], { estado: 'nao_iniciado' })}
            className="text-[11px] text-[#6B7280] underline"
          >
            {t('whatsappProvision.restart', 'Use a different number')}
          </button>
        </div>
      )}

      {!isLoading && estado?.estado === 'ativo' && (
        <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <p className="text-sm font-medium text-emerald-800">
            {estado.numero_e164 || t('whatsappProvision.activeBadge', 'Active')}
          </p>
          <p className="text-xs text-emerald-700 mt-1">
            {t('whatsappProvision.activeNote', 'Your AI now answers this number. New messages route to it within a minute.')}
          </p>
        </div>
      )}

      {erroAcao && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{erroAcao}</p>
      )}
    </div>
  );
}
