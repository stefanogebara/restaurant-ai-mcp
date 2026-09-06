import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '../../services/api';
import { useWhatsAppProvision, type WhatsAppProvision as EstadoProvisionamento } from '../../hooks/useWhatsAppProvision';

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
    <div className="liquid-capsule p-5 sm:p-7">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div>
          <h2 className="font-sans text-base font-medium text-deep-charcoal">
            {t('whatsappProvision.title', 'Connect your WhatsApp number')}
          </h2>
          <p className="text-xs text-muted-stone mt-1">
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
        <p className="text-xs text-muted-stone mt-3">{t('common.loading', 'Loading...')}</p>
      )}

      {/* Falha de leitura é honesta — sem esconder atrás de formulário vazio */}
      {!isLoading && erroLeitura && (
        <div role="alert" className="text-sm text-red-700 mt-3">
          {(erroLeitura as Error).message}
          <button type="button" onClick={() => void refetch()} className="block mt-2 text-burgundy underline">{t('common.retry', 'Try again')}</button>
        </div>
      )}

      {!isLoading && !erroLeitura && (changingNumber || estado?.estado === 'nao_iniciado' || estado?.estado === 'erro') && (
        <div className="mt-4 space-y-3">
          {estado?.estado === 'erro' && estado.erro && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{estado.erro}</p>
          )}
          <div className="flex gap-2">
            <div className="w-20">
              <label htmlFor="whatsapp-country-code" className="block text-xs text-muted-stone mb-1">{t('whatsappProvision.cc', 'Country')}</label>
              <div className="flex items-center gap-1 border border-glass-border-input rounded-lg px-2 py-2 text-sm">
                <span className="text-muted-stone">+</span>
                <input
                  id="whatsapp-country-code"
                  inputMode="numeric"
                  value={cc}
                  onChange={(e) => setCc(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  className="w-full outline-none text-deep-charcoal"
                  aria-label={t('whatsappProvision.cc', 'Country')}
                />
              </div>
            </div>
            <div className="flex-1">
              <label htmlFor="whatsapp-connect-number" className="block text-[11px] text-muted-stone mb-1">{t('whatsappProvision.number', 'Number (area code + number)')}</label>
              <input
                id="whatsapp-connect-number"
                type="tel"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
                placeholder="11 3456-7890"
                className="w-full border border-glass-border-input rounded-lg px-3 py-2 text-sm outline-none focus:border-deep-charcoal/30 text-deep-charcoal"
              />
            </div>
          </div>
          <div>
            <span className="block text-[11px] text-muted-stone mb-1.5">{t('whatsappProvision.method', 'Where should Meta send the code?')}</span>
            <div className="flex gap-2">
              {(['sms', 'voice'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={metodo === m}
                  onClick={() => setMetodo(m)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    metodo === m
                      ? 'bg-deep-charcoal text-white border-deep-charcoal'
                      : 'bg-white text-stone-gray border-glass-border-input hover:border-muted-stone'
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
            className="w-full bg-burgundy text-white rounded-full py-3 text-sm font-medium disabled:opacity-40 transition-opacity"
          >
            {acao.isPending
              ? t('whatsappProvision.sending', 'Requesting code...')
              : t('whatsappProvision.start', 'Receive verification code')}
          </button>
        </div>
      )}

      {!isLoading && !changingNumber && estado?.estado === 'aguardando_codigo' && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-stone-gray bg-soft-gray border border-glass-border-input rounded-lg px-3 py-2">
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
              autoComplete="one-time-code"
              className="flex-1 border border-glass-border-input rounded-lg px-3 py-2 text-sm tracking-[0.3em] font-mono outline-none focus:border-deep-charcoal/30 text-deep-charcoal"
              aria-label={t('whatsappProvision.code', 'Verification code')}
            />
            <button
              type="button"
              onClick={confirmar}
              disabled={acao.isPending || codigo.length < 4}
              className="bg-burgundy text-white rounded-full px-4 text-sm font-medium disabled:opacity-40"
            >
              {acao.isPending ? '...' : t('whatsappProvision.confirm', 'Confirm')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => { setChangingNumber(true); setErroAcao(null); }}
            className="text-[11px] text-muted-stone underline"
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
        <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{erroAcao}</p>
      )}
    </div>
  );
}
