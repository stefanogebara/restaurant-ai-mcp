import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../../services/api';
import { useWhatsAppProvision, type WhatsAppProvision as EstadoProvisionamento } from '../../hooks/useWhatsAppProvision';

/**
 * Conectar um número WhatsApp ao restaurante — item 4 do plano zero-toque.
 *
 * O dono informa um número que controla. A confirmação do código da Meta
 * registra o número; o recebimento de mensagens e a criação de reservas
 * ainda precisam de teste real separado antes de divulgar o canal.
 *
 * O estado vem do backend (/api/whatsapp-provision) — a máquina real mora lá;
 * este painel é só a janela: nao_iniciado → aguardando_codigo → ativo | erro.
 */

const API = '/api/whatsapp-provision';

export default function ConnectWhatsAppNumberPanel() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [cc, setCc] = useState('55');
  const [numero, setNumero] = useState('');
  const [metodo, setMetodo] = useState<'sms' | 'voice'>('sms');
  const [codigo, setCodigo] = useState('');
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [changingNumber, setChangingNumber] = useState(false);

  const { data: estado, isLoading, error: erroLeitura, refetch } = useWhatsAppProvision();

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
      setChangingNumber(false);
      qc.setQueryData(['whatsapp-provision'], data);
      if (data.estado === 'ativo') {
        void qc.invalidateQueries({ queryKey: ['whatsappStatus'] });
        void qc.invalidateQueries({ queryKey: ['whatsapp-status'] });
      }
    },
    onError: (e: Error) => setErroAcao(e.message),
  });

  const iniciar = () => acao.mutate({ action: 'iniciar', cc, numero, metodo });
  const confirmar = () => acao.mutate({ action: 'confirmar', codigo });

  return (
    <div className="min-w-0 rounded-[22px] border border-brand-line bg-brand-paper/60 p-5 sm:p-7">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="font-brand text-[17px] font-medium text-brand-ink">
            {t('whatsappProvision.title', 'Connect your WhatsApp number')}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-brand-muted">
            {t('whatsappProvision.subtitle', 'Register a number you control. Meta sends a verification code by SMS or phone call; test incoming bookings separately.')}
          </p>
        </div>
        {estado?.estado === 'ativo' && (
          <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {t('whatsappProvision.activeBadge', 'Registered')}
          </span>
        )}
      </div>

      {isLoading && (
        <p className="mt-3 text-[13px] text-brand-muted">{t('common.loading', 'Loading...')}</p>
      )}

      {/* Falha de leitura é honesta — sem esconder atrás de formulário vazio */}
      {!isLoading && erroLeitura && (
        <div role="alert" className="text-sm text-red-700 mt-3">
          {(erroLeitura as Error).message}
          <button type="button" onClick={() => void refetch()} className="mt-2 block text-brand-action underline">{t('common.retry', 'Try again')}</button>
        </div>
      )}

      {!isLoading && !erroLeitura && (changingNumber || estado?.estado === 'nao_iniciado' || estado?.estado === 'erro') && (
        <div className="mt-4 space-y-3">
          {estado?.estado === 'erro' && estado.erro && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{estado.erro}</p>
          )}
          <div className="flex min-w-0 gap-2">
            <div className="w-[76px] shrink-0">
              <label htmlFor="whatsapp-country-code" className="mb-1 block text-[12px] text-brand-muted">{t('whatsappProvision.cc', 'Country')}</label>
              <div className="flex items-center gap-1 rounded-lg border border-brand-line bg-brand-paper px-2 py-2.5 text-sm">
                <span className="text-brand-muted">+</span>
                <input
                  id="whatsapp-country-code"
                  inputMode="numeric"
                  value={cc}
                  onChange={(e) => setCc(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  className="w-full bg-transparent text-brand-ink outline-none"
                  aria-label={t('whatsappProvision.cc', 'Country')}
                />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor="whatsapp-connect-number" className="mb-1 block text-[12px] text-brand-muted">{t('whatsappProvision.number', 'Number (area code + number)')}</label>
              <input
                id="whatsapp-connect-number"
                type="tel"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="11 3456-7890"
                className="w-full rounded-lg border border-brand-line bg-brand-paper px-3 py-2.5 text-sm text-brand-ink outline-none focus:border-brand-action"
              />
            </div>
          </div>
          <div>
            <span className="mb-2 block text-[12px] text-brand-muted">{t('whatsappProvision.method', 'Where should Meta send the code?')}</span>
            <div className="flex gap-2">
              {(['sms', 'voice'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={metodo === m}
                  onClick={() => setMetodo(m)}
                  className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                    metodo === m
                      ? 'border-brand-action bg-brand-action text-brand-paper'
                      : 'border-brand-line bg-brand-paper text-brand-ink hover:border-brand-action'
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
            disabled={acao.isPending || !cc || numero.replace(/\D/g, '').length < 8 || cc.length + numero.replace(/\D/g, '').length > 15}
            className="w-full rounded-full bg-brand-action py-3 text-sm font-medium text-brand-paper transition-opacity disabled:opacity-40"
          >
            {acao.isPending
              ? t('whatsappProvision.sending', 'Requesting code...')
              : t('whatsappProvision.start', 'Receive verification code')}
          </button>
        </div>
      )}

      {!isLoading && !changingNumber && estado?.estado === 'aguardando_codigo' && (
        <div className="mt-4 space-y-3">
          <p className="break-words border-y border-brand-line py-3 text-[13px] leading-relaxed text-brand-muted">
            {t('whatsappProvision.codeSentTo', 'Meta sent a code to')}{' '}
            <span className="break-all font-semibold text-brand-ink">{estado.numero_e164}</span>
            {estado.metodo === 'VOICE'
              ? ` ${t('whatsappProvision.byCall', 'by phone call')}`
              : ' SMS'}
          </p>
          <div className="flex min-w-0 gap-2">
            <input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="min-w-0 flex-1 rounded-lg border border-brand-line bg-brand-paper px-3 py-2 text-sm font-mono tracking-[0.22em] text-brand-ink outline-none focus:border-brand-action"
              aria-label={t('whatsappProvision.code', 'Verification code')}
            />
            <button
              type="button"
              onClick={confirmar}
              disabled={acao.isPending || codigo.length < 4}
              className="shrink-0 rounded-full bg-brand-action px-4 text-sm font-medium text-brand-paper disabled:opacity-40"
            >
              {acao.isPending ? '...' : t('whatsappProvision.confirm', 'Confirm')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setChangingNumber(true); setErroAcao(null); }}
            className="text-[13px] text-brand-action underline underline-offset-4"
          >
            {t('whatsappProvision.restart', 'Use a different number')}
          </button>
        </div>
      )}

      {!isLoading && estado?.estado === 'ativo' && (
        <div className="mt-4 border-t border-brand-line pt-4">
          <p className="text-sm font-medium text-emerald-800">
            {estado.numero_e164 || t('whatsappProvision.activeBadge', 'Active')}
          </p>
          <p className="text-xs text-emerald-700 mt-1">
            {t('whatsappProvision.activeNote', 'Registration is complete. Test an incoming conversation and booking before sharing the number.')}
          </p>
        </div>
      )}

      {erroAcao && (
        <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{erroAcao}</p>
      )}
    </div>
  );
}
