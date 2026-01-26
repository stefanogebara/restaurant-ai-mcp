/**
 * Manual Revenue Entry Modal
 *
 * Allows staff to manually enter revenue data for customers
 * when POS integration is not available.
 */

import { useState, useEffect } from 'react';
import { X, DollarSign, User, Phone, Calendar, Users, Search, Loader2 } from 'lucide-react';

interface Customer {
  customer_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
}

interface ManualRevenueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  language?: 'en' | 'es';
}

export default function ManualRevenueModal({
  isOpen,
  onClose,
  onSuccess,
  language = 'en'
}: ManualRevenueModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form fields
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [totalRevenue, setTotalRevenue] = useState('');
  const [tipAmount, setTipAmount] = useState('');
  const [partySize, setPartySize] = useState('2');
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [serviceTime, setServiceTime] = useState('');
  const [notes, setNotes] = useState('');

  // Customer search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const translations = {
    en: {
      title: 'Add Revenue Entry',
      customerSearch: 'Search Customer',
      searchPlaceholder: 'Search by phone or name...',
      customerPhone: 'Customer Phone',
      customerName: 'Customer Name',
      customerEmail: 'Email (optional)',
      totalRevenue: 'Total Revenue',
      tipAmount: 'Tip Amount (optional)',
      partySize: 'Party Size',
      serviceDate: 'Service Date',
      serviceTime: 'Service Time (optional)',
      notes: 'Notes (optional)',
      cancel: 'Cancel',
      save: 'Save Revenue',
      saving: 'Saving...',
      success: 'Revenue entry saved successfully',
      errorRequired: 'Please enter a phone number or email and total revenue',
      errorSave: 'Failed to save revenue entry'
    },
    es: {
      title: 'Agregar Entrada de Ingresos',
      customerSearch: 'Buscar Cliente',
      searchPlaceholder: 'Buscar por teléfono o nombre...',
      customerPhone: 'Teléfono del Cliente',
      customerName: 'Nombre del Cliente',
      customerEmail: 'Email (opcional)',
      totalRevenue: 'Ingresos Totales',
      tipAmount: 'Propina (opcional)',
      partySize: 'Tamaño del Grupo',
      serviceDate: 'Fecha del Servicio',
      serviceTime: 'Hora del Servicio (opcional)',
      notes: 'Notas (opcional)',
      cancel: 'Cancelar',
      save: 'Guardar Ingresos',
      saving: 'Guardando...',
      success: 'Entrada de ingresos guardada exitosamente',
      errorRequired: 'Por favor ingrese un teléfono o email y los ingresos totales',
      errorSave: 'Error al guardar la entrada de ingresos'
    }
  };

  const t = translations[language];

  // Search customers when query changes
  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const searchTimeout = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(
          `/api/revenue?action=customer-search&q=${encodeURIComponent(searchQuery)}`
        );
        const data = await response.json();
        if (data.success) {
          setSearchResults(data.data.customers || []);
        }
      } catch (err) {
        console.error('Customer search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [searchQuery]);

  // Select a customer from search results
  const selectCustomer = (customer: Customer) => {
    setCustomerPhone(customer.customer_phone || '');
    setCustomerName(customer.customer_name || '');
    setCustomerEmail(customer.customer_email || '');
    setSearchQuery('');
    setSearchResults([]);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if ((!customerPhone && !customerEmail) || !totalRevenue) {
      setError(t.errorRequired);
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/revenue?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_phone: customerPhone || undefined,
          customer_name: customerName || undefined,
          customer_email: customerEmail || undefined,
          total_revenue: parseFloat(totalRevenue),
          tip_amount: tipAmount ? parseFloat(tipAmount) : 0,
          party_size: parseInt(partySize),
          service_date: serviceDate,
          service_time: serviceTime || undefined,
          notes: notes || undefined
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || t.errorSave);
      }

      // Success - reset form and close
      resetForm();
      onSuccess?.();
      onClose();

    } catch (err) {
      console.error('Error saving revenue:', err);
      setError(err instanceof Error ? err.message : t.errorSave);
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setCustomerPhone('');
    setCustomerName('');
    setCustomerEmail('');
    setTotalRevenue('');
    setTipAmount('');
    setPartySize('2');
    setServiceDate(new Date().toISOString().split('T')[0]);
    setServiceTime('');
    setNotes('');
    setSearchQuery('');
    setSearchResults([]);
    setError(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white px-6 py-4 border-b border-[#E7E5E4] flex items-center justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#16a34a]/10 rounded-lg">
              <DollarSign className="w-5 h-5 text-[#16a34a]" />
            </div>
            <h2 className="text-xl font-bold text-[#1C1917]">{t.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#F5F5F4] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#57534E]" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Customer Search */}
          <div className="relative">
            <label className="block text-sm font-medium text-[#1C1917] mb-1">
              {t.customerSearch}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#57534E]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full pl-10 pr-4 py-2 border border-[#E7E5E4] rounded-lg focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239] transition-colors"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#57534E] animate-spin" />
              )}
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-[#E7E5E4] rounded-lg shadow-lg max-h-40 overflow-y-auto">
                {searchResults.map((customer) => (
                  <button
                    key={customer.customer_id}
                    type="button"
                    onClick={() => selectCustomer(customer)}
                    className="w-full px-4 py-2 text-left hover:bg-[#F5F5F4] transition-colors flex items-center gap-3"
                  >
                    <User className="w-4 h-4 text-[#57534E]" />
                    <div>
                      <div className="font-medium text-[#1C1917]">
                        {customer.customer_name || customer.customer_phone || customer.customer_email}
                      </div>
                      {customer.customer_phone && (
                        <div className="text-xs text-[#57534E]">{customer.customer_phone}</div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Customer Details */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1C1917] mb-1">
                <Phone className="w-4 h-4 inline mr-1" />
                {t.customerPhone}
              </label>
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+34 612 345 678"
                className="w-full px-4 py-2 border border-[#E7E5E4] rounded-lg focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239] transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1C1917] mb-1">
                <User className="w-4 h-4 inline mr-1" />
                {t.customerName}
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Maria Garcia"
                className="w-full px-4 py-2 border border-[#E7E5E4] rounded-lg focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239] transition-colors"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-[#1C1917] mb-1">
              {t.customerEmail}
            </label>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="maria@example.com"
              className="w-full px-4 py-2 border border-[#E7E5E4] rounded-lg focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239] transition-colors"
            />
          </div>

          {/* Revenue & Tip */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1C1917] mb-1">
                <DollarSign className="w-4 h-4 inline mr-1" />
                {t.totalRevenue} *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#57534E]">€</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={totalRevenue}
                  onChange={(e) => setTotalRevenue(e.target.value)}
                  placeholder="85.50"
                  required
                  className="w-full pl-8 pr-4 py-2 border border-[#E7E5E4] rounded-lg focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239] transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1C1917] mb-1">
                {t.tipAmount}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#57534E]">€</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  placeholder="10.00"
                  className="w-full pl-8 pr-4 py-2 border border-[#E7E5E4] rounded-lg focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239] transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Date, Time, Party Size */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1C1917] mb-1">
                <Calendar className="w-4 h-4 inline mr-1" />
                {t.serviceDate} *
              </label>
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                required
                className="w-full px-4 py-2 border border-[#E7E5E4] rounded-lg focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239] transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1C1917] mb-1">
                {t.serviceTime}
              </label>
              <input
                type="time"
                value={serviceTime}
                onChange={(e) => setServiceTime(e.target.value)}
                className="w-full px-4 py-2 border border-[#E7E5E4] rounded-lg focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239] transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1C1917] mb-1">
                <Users className="w-4 h-4 inline mr-1" />
                {t.partySize}
              </label>
              <select
                value={partySize}
                onChange={(e) => setPartySize(e.target.value)}
                className="w-full px-4 py-2 border border-[#E7E5E4] rounded-lg focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239] transition-colors"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-[#1C1917] mb-1">
              {t.notes}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anniversary dinner, special menu..."
              rows={2}
              className="w-full px-4 py-2 border border-[#E7E5E4] rounded-lg focus:ring-2 focus:ring-[#9F1239]/20 focus:border-[#9F1239] transition-colors resize-none"
            />
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-3 border border-[#E7E5E4] rounded-xl text-[#57534E] font-medium hover:bg-[#F5F5F4] transition-colors disabled:opacity-50"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-3 bg-[#16a34a] hover:bg-[#15803d] text-white font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t.saving}
                </>
              ) : (
                <>
                  <DollarSign className="w-4 h-4" />
                  {t.save}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
