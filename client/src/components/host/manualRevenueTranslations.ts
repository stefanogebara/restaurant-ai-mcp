export interface ManualRevenueTranslations {
  title: string;
  customerSearch: string;
  searchPlaceholder: string;
  customerPhone: string;
  customerName: string;
  customerEmail: string;
  totalRevenue: string;
  tipAmount: string;
  partySize: string;
  serviceDate: string;
  serviceTime: string;
  notes: string;
  cancel: string;
  save: string;
  saving: string;
  success: string;
  errorRequired: string;
  errorSave: string;
}

const translations: Record<'en' | 'es', ManualRevenueTranslations> = {
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
    errorSave: 'Failed to save revenue entry',
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
    errorSave: 'Error al guardar la entrada de ingresos',
  },
};

export function getManualRevenueTranslations(language: string): ManualRevenueTranslations {
  return translations[language as keyof typeof translations] || translations.en;
}
