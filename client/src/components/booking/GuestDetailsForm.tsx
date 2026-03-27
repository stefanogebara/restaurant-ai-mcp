import { useTranslation } from 'react-i18next';

interface GuestDetailsFormProps {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  specialRequests: string;
  phoneError?: string;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onPhoneBlur?: () => void;
  onEmailChange: (value: string) => void;
  onSpecialRequestsChange: (value: string) => void;
}

export default function GuestDetailsForm({
  customerName,
  customerPhone,
  customerEmail,
  specialRequests,
  phoneError,
  onNameChange,
  onPhoneChange,
  onPhoneBlur,
  onEmailChange,
  onSpecialRequestsChange,
}: GuestDetailsFormProps) {
  const { t } = useTranslation();
  return (
    <div className="mb-8">
      <div className="text-xs font-semibold tracking-wider uppercase text-warm-stone mb-3">
        {t('booking.yourDetails')}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-3.5">
        <div>
          <label className="block text-[13px] font-medium text-stone-gray mb-1.5">{t('booking.name')}</label>
          <input
            type="text"
            value={customerName}
            onChange={e => onNameChange(e.target.value)}
            placeholder={t('booking.namePlaceholder')}
            className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%]"
          />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-stone-gray mb-1.5">{t('booking.phone')}</label>
          <input
            type="tel"
            value={customerPhone}
            onChange={e => onPhoneChange(e.target.value)}
            onBlur={onPhoneBlur}
            placeholder={t('booking.phonePlaceholder')}
            className={`w-full px-4 py-3 border rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:ring-[3px] ${
              phoneError
                ? 'border-red-500 focus:border-red-500 focus:ring-red-500/[6%]'
                : 'border-border-gray focus:border-burgundy focus:ring-burgundy/[6%]'
            }`}
          />
          {phoneError && (
            <p className="text-xs text-red-600 mt-1">{phoneError}</p>
          )}
        </div>
      </div>
      <div className="mb-3.5">
        <label className="block text-[13px] font-medium text-stone-gray mb-1.5">
          {t('booking.email')} <span className="text-muted-stone font-normal">({t('booking.optional')})</span>
        </label>
        <input
          type="email"
          value={customerEmail}
          onChange={e => onEmailChange(e.target.value)}
          placeholder={t('booking.emailPlaceholder')}
          className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%]"
        />
      </div>
      <div>
        <label className="block text-[13px] font-medium text-stone-gray mb-1.5">
          {t('booking.specialRequests')} <span className="text-muted-stone font-normal">({t('booking.optional')})</span>
        </label>
        <textarea
          value={specialRequests}
          onChange={e => onSpecialRequestsChange(e.target.value)}
          placeholder={t('booking.specialRequestsPlaceholder')}
          rows={3}
          className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%] resize-none"
        />
      </div>
    </div>
  );
}
