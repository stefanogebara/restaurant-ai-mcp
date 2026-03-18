import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDepositConfig, useUpdateDepositConfig } from '../../hooks/useDepositConfig';

export default function DepositSettingsPanel() {
  const { t } = useTranslation();
  const { data: config, isLoading } = useDepositConfig();
  const updateConfig = useUpdateDepositConfig();

  const [enabled, setEnabled] = useState(false);
  const [type, setType] = useState<'flat' | 'per_person'>('flat');
  const [amount, setAmount] = useState('20');

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setType(config.type || 'flat');
      setAmount(String(config.amount || 20));
    }
  }, [config]);

  const handleSave = () => {
    updateConfig.mutate({
      enabled,
      type: enabled ? type : undefined,
      amount: enabled ? parseFloat(amount) : undefined,
    });
  };

  if (isLoading) {
    return (
      <div className="bg-white border border-border-gray rounded-2xl p-6">
        <div className="h-6 w-40 bg-border-gray rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6">
      <h3 className="text-[15px] font-semibold text-deep-charcoal mb-1">{t('settings.depositTitle')}</h3>
      <p className="text-xs text-warm-stone mb-5">
        {t('settings.depositDesc')}
      </p>

      {/* Enable toggle */}
      <label className="flex items-center gap-3 mb-5 cursor-pointer">
        <div className="relative">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-10 h-6 bg-border-gray rounded-full peer-checked:bg-burgundy transition-colors" />
          <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4" />
        </div>
        <span className="text-sm font-medium text-deep-charcoal">
          {enabled ? t('settings.depositsEnabled') : t('settings.depositsDisabled')}
        </span>
      </label>

      {enabled && (
        <div className="space-y-4 pl-1">
          {/* Deposit type */}
          <div>
            <label className="block text-xs font-semibold tracking-wider text-warm-stone mb-2">
              {t('settings.depositType')}
            </label>
            <div className="flex gap-2">
              {(['flat', 'per_person'] as const).map((dt) => (
                <button
                  key={dt}
                  type="button"
                  onClick={() => setType(dt)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    type === dt
                      ? 'border-burgundy bg-burgundy/[4%] text-burgundy'
                      : 'border-border-gray text-stone-gray hover:border-stone-300'
                  }`}
                >
                  {dt === 'flat' ? t('settings.depositFlat') : t('settings.depositPerPerson')}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold tracking-wider text-warm-stone mb-2">
              {t('settings.depositAmount')}
            </label>
            <div className="relative w-32">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-warm-stone">EUR</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                max="500"
                step="1"
                className="w-full pl-12 pr-3 py-2.5 border border-border-gray rounded-lg text-sm text-deep-charcoal focus:outline-none focus:border-burgundy"
              />
            </div>
            {type === 'per_person' && (
              <p className="text-xs text-muted-stone mt-1">
                {t('settings.depositExample', { total: parseFloat(amount || '0') * 4 })}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Save button */}
      <div className="mt-6 pt-4 border-t border-soft-gray">
        <button
          type="button"
          onClick={handleSave}
          disabled={updateConfig.isPending}
          className="px-5 py-2.5 bg-burgundy hover:bg-burgundy-dark disabled:bg-border-gray text-white font-semibold text-sm rounded-lg transition-colors"
        >
          {updateConfig.isPending ? t('common.loading') : t('settings.saveDepositSettings')}
        </button>
        {updateConfig.isSuccess && (
          <span className="ml-3 text-xs text-rose-600 font-medium">{t('common.saved')}</span>
        )}
        {updateConfig.isError && (
          <span className="ml-3 text-xs text-red-600 font-medium">
            {updateConfig.error.message}
          </span>
        )}
      </div>
    </div>
  );
}
