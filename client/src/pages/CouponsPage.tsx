import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '../components/layout/DashboardLayout';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { useCouponList, useCreateCoupon, useDeactivateCoupon } from '../hooks/useCoupons';
import type { Coupon } from '../hooks/useCoupons';

function getStatusBadge(coupon: Coupon, t: any) {
  const now = new Date();

  if (!coupon.is_active) {
    return { label: t('coupons.statusInactive', 'Inativo'), color: 'bg-gray-100 text-gray-600' };
  }
  if (coupon.valid_until && new Date(coupon.valid_until) < now) {
    return { label: t('coupons.statusExpired', 'Expirado'), color: 'bg-red-50 text-red-700' };
  }
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return { label: t('coupons.statusExhausted', 'Esgotado'), color: 'bg-yellow-50 text-yellow-700' };
  }
  return { label: t('coupons.statusActive', 'Ativo'), color: 'bg-green-50 text-green-700' };
}

function formatDiscount(coupon: Coupon): string {
  if (coupon.discount_type === 'percentage') {
    return `${Number(coupon.discount_value)}%`;
  }
  return `R$ ${Number(coupon.discount_value).toFixed(2)}`;
}

function CouponCreateForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const createMutation = useCreateCoupon();

  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const parsedValue = parseFloat(discountValue);
    if (!discountValue || isNaN(parsedValue) || parsedValue <= 0) {
      setFormError(t('coupons.errorValueRequired', 'Discount value is required and must be greater than 0'));
      return;
    }

    if (discountType === 'percentage' && parsedValue > 100) {
      setFormError(t('coupons.errorPercentageMax', 'Percentage discount cannot exceed 100'));
      return;
    }

    try {
      await createMutation.mutateAsync({
        code: code.trim() || undefined,
        description: description.trim() || undefined,
        discount_type: discountType,
        discount_value: parsedValue,
        min_order: minOrder ? parseFloat(minOrder) : undefined,
        max_uses: maxUses ? parseInt(maxUses, 10) : null,
        valid_from: validFrom || undefined,
        valid_until: validUntil || null,
      });
      onCreated();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create coupon';
      const axiosError = err as { response?: { data?: { error?: string } } };
      setFormError(axiosError?.response?.data?.error || errorMsg);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-[#E5E7EB] rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-deep-charcoal">{t('coupons.newCoupon', 'Novo Cupom')}</h3>
        <button type="button" onClick={onCancel} className="text-stone-gray hover:text-deep-charcoal transition-colors">
          <ThiingsIcon name={"x" as any} size="xs" />
        </button>
      </div>

      {formError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Code (optional) */}
        <div>
          <label className="block text-xs font-medium text-stone-gray mb-1">{t('coupons.code', 'Codigo')} <span className="text-stone-gray/60">({t('coupons.optional', 'opcional')})</span></label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="SAVE20AB"
            maxLength={20}
            className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239] font-mono"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-xs font-medium text-stone-gray mb-1">{t('coupons.description', 'Descricao')}</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('coupons.descriptionPlaceholder', 'ex. Desconto de fim de semana')}
            maxLength={200}
            className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239]"
          />
        </div>

        {/* Discount type */}
        <div>
          <label className="block text-xs font-medium text-stone-gray mb-1">{t('coupons.discountType', 'Tipo de desconto')}</label>
          <select
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value as 'percentage' | 'fixed')}
            className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239] bg-white"
          >
            <option value="percentage">{t('coupons.typePercentage', 'Porcentagem (%)')}</option>
            <option value="fixed">{t('coupons.typeFixed', 'Valor fixo (R$)')}</option>
          </select>
        </div>

        {/* Discount value */}
        <div>
          <label className="block text-xs font-medium text-stone-gray mb-1">{t('coupons.discountValue', 'Valor do desconto')}</label>
          <input
            type="number"
            value={discountValue}
            onChange={(e) => setDiscountValue(e.target.value)}
            placeholder={discountType === 'percentage' ? '20' : '15.00'}
            min="0.01"
            step="0.01"
            required
            className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239]"
          />
        </div>

        {/* Min order */}
        <div>
          <label className="block text-xs font-medium text-stone-gray mb-1">{t('coupons.minOrder', 'Pedido minimo (R$)')}</label>
          <input
            type="number"
            value={minOrder}
            onChange={(e) => setMinOrder(e.target.value)}
            placeholder="0"
            min="0"
            step="0.01"
            className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239]"
          />
        </div>

        {/* Max uses */}
        <div>
          <label className="block text-xs font-medium text-stone-gray mb-1">{t('coupons.maxUses', 'Maximo de usos')}</label>
          <input
            type="number"
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder={t('coupons.unlimited', 'Ilimitado')}
            min="1"
            step="1"
            className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239]"
          />
        </div>

        {/* Valid from */}
        <div>
          <label className="block text-xs font-medium text-stone-gray mb-1">{t('coupons.validFrom', 'Valido a partir de')}</label>
          <input
            type="datetime-local"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239]"
          />
        </div>

        {/* Valid until */}
        <div>
          <label className="block text-xs font-medium text-stone-gray mb-1">{t('coupons.validUntil', 'Valido ate')}</label>
          <input
            type="datetime-local"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239]"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors"
        >
          {t('coupons.cancel', 'Cancelar')}
        </button>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="px-4 py-2 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-full text-sm transition-colors disabled:opacity-50"
        >
          {createMutation.isPending ? t('coupons.creating', 'Criando...') : t('coupons.createCoupon', 'Criar Cupom')}
        </button>
      </div>
    </form>
  );
}

function CouponRow({ coupon }: { coupon: Coupon }) {
  const { t } = useTranslation();
  const deactivateMutation = useDeactivateCoupon();
  const badge = getStatusBadge(coupon, t);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available
    }
  };

  const handleDeactivate = () => {
    if (window.confirm(t('coupons.confirmDeactivate', 'Desativar este cupom?'))) {
      deactivateMutation.mutate(coupon.id);
    }
  };

  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-[#E5E7EB] last:border-b-0 hover:bg-gray-50/50 transition-colors">
      {/* Code + copy */}
      <div className="flex items-center gap-2 min-w-[120px]">
        <span className="font-mono text-sm font-bold text-deep-charcoal">{coupon.code}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-stone-gray hover:text-[#9F1239] transition-colors"
          title={t('coupons.copyCode', 'Copiar codigo')}
        >
          <ThiingsIcon name={(copied ? 'check' : 'copy') as any} pxSize={14} />
        </button>
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <span className="text-sm text-stone-gray truncate block">{coupon.description || '—'}</span>
      </div>

      {/* Discount */}
      <div className="text-sm font-semibold text-deep-charcoal whitespace-nowrap">
        {formatDiscount(coupon)}
      </div>

      {/* Status badge */}
      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${badge.color}`}>
        {badge.label}
      </span>

      {/* Usage */}
      <div className="text-xs text-stone-gray whitespace-nowrap">
        {coupon.used_count}{coupon.max_uses !== null ? `/${coupon.max_uses}` : ''} {t('coupons.uses', 'usos')}
      </div>

      {/* Deactivate */}
      {coupon.is_active && (
        <button
          type="button"
          onClick={handleDeactivate}
          disabled={deactivateMutation.isPending}
          className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors disabled:opacity-50"
        >
          {t('coupons.deactivate', 'Desativar')}
        </button>
      )}
    </div>
  );
}

export default function CouponsPage() {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const { data: coupons, isLoading, error } = useCouponList();

  const totalCoupons = coupons?.length ?? 0;
  const activeCoupons = coupons?.filter((c) => {
    const now = new Date();
    return c.is_active && (!c.valid_until || new Date(c.valid_until) >= now) && (c.max_uses === null || c.used_count < c.max_uses);
  }).length ?? 0;
  const totalRedemptions = coupons?.reduce((sum, c) => sum + c.used_count, 0) ?? 0;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-deep-charcoal">
            {t('coupons.title', 'Cupons e Promocoes')}
          </h1>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-full text-sm transition-colors"
            >
              <ThiingsIcon name="plus" size="xs" />
              {t('coupons.newCoupon', 'Novo Cupom')}
            </button>
          )}
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-deep-charcoal">{totalCoupons}</div>
            <div className="text-xs text-stone-gray mt-1">{t('coupons.totalCoupons', 'Total')}</div>
          </div>
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{activeCoupons}</div>
            <div className="text-xs text-stone-gray mt-1">{t('coupons.activeCoupons', 'Ativos')}</div>
          </div>
          <div className="bg-white border border-[#E5E7EB] rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-[#9F1239]">{totalRedemptions}</div>
            <div className="text-xs text-stone-gray mt-1">{t('coupons.totalRedemptions', 'Resgates')}</div>
          </div>
        </div>

        {/* Create form (collapsible) */}
        {showForm && (
          <div className="mb-6">
            <CouponCreateForm
              onCreated={() => setShowForm(false)}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* Coupon list */}
        <div className="bg-white border border-[#E5E7EB] rounded-xl overflow-hidden">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#E5E7EB] border-t-[#9F1239]" />
            </div>
          )}

          {error && (
            <div className="text-center py-12 text-red-600 text-sm">
              {t('coupons.errorLoading', 'Erro ao carregar cupons')}
            </div>
          )}

          {!isLoading && !error && coupons && coupons.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm font-medium text-deep-charcoal">{t('coupons.noCoupons', 'Nenhum cupom ainda')}</p>
              <p className="text-xs text-stone-gray mt-1">{t('coupons.noCouponsHint', 'Crie seu primeiro cupom para atrair mais clientes')}</p>
            </div>
          )}

          {!isLoading && !error && coupons && coupons.length > 0 && (
            <div>
              {/* Table header */}
              <div className="flex items-center gap-4 px-4 py-2 border-b border-[#E5E7EB] bg-gray-50/50 text-xs font-medium text-stone-gray uppercase tracking-wide">
                <div className="min-w-[120px]">{t('coupons.code', 'Codigo')}</div>
                <div className="flex-1">{t('coupons.description', 'Descricao')}</div>
                <div>{t('coupons.discount', 'Desconto')}</div>
                <div>{t('coupons.status', 'Status')}</div>
                <div>{t('coupons.usage', 'Uso')}</div>
                <div></div>
              </div>
              {coupons.map((coupon) => (
                <CouponRow key={coupon.id} coupon={coupon} />
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
