interface GuestDetailsFormProps {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  specialRequests: string;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onSpecialRequestsChange: (value: string) => void;
}

export default function GuestDetailsForm({
  customerName,
  customerPhone,
  customerEmail,
  specialRequests,
  onNameChange,
  onPhoneChange,
  onEmailChange,
  onSpecialRequestsChange,
}: GuestDetailsFormProps) {
  return (
    <div className="mb-8">
      <div className="text-xs font-semibold tracking-wider uppercase text-warm-stone mb-3">
        Your Details
      </div>
      <div className="grid grid-cols-2 gap-3.5 mb-3.5">
        <div>
          <label className="block text-[13px] font-medium text-stone-gray mb-1.5">Name</label>
          <input
            type="text"
            value={customerName}
            onChange={e => onNameChange(e.target.value)}
            placeholder="Your full name"
            className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%]"
          />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-stone-gray mb-1.5">Phone</label>
          <input
            type="tel"
            value={customerPhone}
            onChange={e => onPhoneChange(e.target.value)}
            placeholder="+34 612 345 678"
            className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%]"
          />
        </div>
      </div>
      <div className="mb-3.5">
        <label className="block text-[13px] font-medium text-stone-gray mb-1.5">
          Email <span className="text-muted-stone font-normal">(optional)</span>
        </label>
        <input
          type="email"
          value={customerEmail}
          onChange={e => onEmailChange(e.target.value)}
          placeholder="your@email.com"
          className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%]"
        />
      </div>
      <div>
        <label className="block text-[13px] font-medium text-stone-gray mb-1.5">
          Special requests <span className="text-muted-stone font-normal">(optional)</span>
        </label>
        <textarea
          value={specialRequests}
          onChange={e => onSpecialRequestsChange(e.target.value)}
          placeholder="Allergies, celebrations, seating preferences..."
          rows={3}
          className="w-full px-4 py-3 border border-border-gray rounded-[10px] text-sm bg-white text-deep-charcoal placeholder:text-stone-300 focus:outline-none focus:border-burgundy focus:ring-[3px] focus:ring-burgundy/[6%] resize-none"
        />
      </div>
    </div>
  );
}
