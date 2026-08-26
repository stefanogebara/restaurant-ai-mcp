import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import DashboardLayout from '../components/layout/DashboardLayout';
import ThiingsIcon from '../components/common/ThiingsIcon';
import { useEventList, useCreateEvent, useDeactivateEvent } from '../hooks/useEvents';
import type { EventItem } from '../hooks/useEvents';
import EventBookingsPanel from '../components/events/EventBookingsPanel';

function getStatusBadge(event: EventItem, t: (key: string, fallback: string) => string) {
  if (!event.is_active) {
    return { label: t('events.statusInactive', 'Inactive'), color: 'bg-stone-100 text-stone-600' };
  }

  const now = new Date();
  const eventDateTime = new Date(`${event.event_date}T${event.event_time}`);

  if (eventDateTime < now) {
    return { label: t('events.statusPast', 'Past'), color: 'bg-stone-100 text-stone-600' };
  }
  if (event.current_bookings >= event.max_capacity) {
    return { label: t('events.statusFull', 'Full'), color: 'bg-yellow-50 text-yellow-700' };
  }
  return { label: t('events.statusUpcoming', 'Upcoming'), color: 'bg-green-50 text-green-700' };
}

function formatPrice(price: number): string {
  return `R$ ${Number(price).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(timeStr: string): string {
  return timeStr.substring(0, 5);
}

function EventCreateForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const createMutation = useCreateEvent();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('120');
  const [maxCapacity, setMaxCapacity] = useState('');
  const [price, setPrice] = useState('');
  const [refundPolicy, setRefundPolicy] = useState('full');
  const [menuDescription, setMenuDescription] = useState('');
  const [formError, setFormError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!title.trim()) {
      setFormError(t('events.errorTitleRequired', 'Title is required'));
      return;
    }
    if (!eventDate) {
      setFormError(t('events.errorDateRequired', 'Date is required'));
      return;
    }
    if (!eventTime) {
      setFormError(t('events.errorTimeRequired', 'Time is required'));
      return;
    }

    const parsedCapacity = parseInt(maxCapacity, 10);
    if (!maxCapacity || isNaN(parsedCapacity) || parsedCapacity < 1) {
      setFormError(t('events.errorCapacityRequired', 'Capacity must be at least 1'));
      return;
    }

    const parsedPrice = parseFloat(price);
    if (price === '' || isNaN(parsedPrice) || parsedPrice < 0) {
      setFormError(t('events.errorPriceRequired', 'Price must be 0 or greater'));
      return;
    }

    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        event_date: eventDate,
        event_time: eventTime,
        duration_minutes: parseInt(durationMinutes, 10) || 120,
        max_capacity: parsedCapacity,
        price: parsedPrice,
        refund_policy: refundPolicy,
        menu_description: menuDescription.trim() || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      onCreated();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to create event';
      const axiosError = err as { response?: { data?: { error?: string } } };
      setFormError(axiosError?.response?.data?.error || errorMsg);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-panel p-5 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-deep-charcoal">{t('events.newEvent', 'New Event')}</h3>
        <button type="button" onClick={onCancel} className="text-stone-gray hover:text-deep-charcoal transition-colors">
          <ThiingsIcon name={"x" as any} size="xs" />
        </button>
      </div>

      {formError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-stone-gray mb-1">{t('events.title', 'Title')}</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('events.titlePlaceholder', 'e.g. Wine Tasting Evening')}
            maxLength={120}
            required
            className="w-full px-3 py-2 border border-glass-border-input bg-white/60 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239]"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-stone-gray mb-1">
            {t('events.description', 'Description')} <span className="text-stone-gray/60">({t('events.optional', 'optional')})</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('events.descriptionPlaceholder', 'Describe the experience...')}
            maxLength={1000}
            rows={2}
            className="w-full px-3 py-2 border border-glass-border-input bg-white/60 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239] resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-gray mb-1">{t('events.date', 'Date')}</label>
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required
            className="w-full px-3 py-2 border border-glass-border-input bg-white/60 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239]" />
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-gray mb-1">{t('events.time', 'Time')}</label>
          <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} required
            className="w-full px-3 py-2 border border-glass-border-input bg-white/60 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239]" />
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-gray mb-1">{t('events.duration', 'Duration (min)')}</label>
          <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)}
            placeholder="120" min="15" max="720" required
            className="w-full px-3 py-2 border border-glass-border-input bg-white/60 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239]" />
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-gray mb-1">{t('events.capacity', 'Capacity')}</label>
          <input type="number" value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)}
            placeholder="20" min="1" required
            className="w-full px-3 py-2 border border-glass-border-input bg-white/60 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239]" />
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-gray mb-1">{t('events.price', 'Price (R$)')}</label>
          <input type="number" value={price} onChange={(e) => setPrice(e.target.value)}
            placeholder="150.00" min="0" step="0.01" required
            className="w-full px-3 py-2 border border-glass-border-input bg-white/60 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239]" />
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-gray mb-1">{t('events.refundPolicy', 'Refund Policy')}</label>
          <select value={refundPolicy} onChange={(e) => setRefundPolicy(e.target.value)}
            className="w-full px-3 py-2 border border-glass-border-input bg-white/60 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239] bg-white">
            <option value="full">{t('events.refundFull', 'Full refund')}</option>
            <option value="partial">{t('events.refundPartial', '50% refund')}</option>
            <option value="none">{t('events.refundNone', 'No refund')}</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-stone-gray mb-1">
            {t('events.menuDescription', 'Menu / Experience Details')} <span className="text-stone-gray/60">({t('events.optional', 'optional')})</span>
          </label>
          <textarea
            value={menuDescription}
            onChange={(e) => setMenuDescription(e.target.value)}
            placeholder={t('events.menuPlaceholder', 'Describe the menu or experience highlights...')}
            maxLength={2000}
            rows={3}
            className="w-full px-3 py-2 border border-glass-border-input bg-white/60 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#9F1239] resize-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="px-4 py-2 text-sm font-medium text-stone-gray hover:text-deep-charcoal transition-colors">
          {t('events.cancel', 'Cancel')}
        </button>
        <button type="submit" disabled={createMutation.isPending}
          className="px-4 py-2 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-full text-sm transition-colors disabled:opacity-50">
          {createMutation.isPending ? t('events.creating', 'Creating...') : t('events.createEvent', 'Create Event')}
        </button>
      </div>
    </form>
  );
}

function EventCard({ event }: { event: EventItem }) {
  const { t } = useTranslation();
  const deactivateMutation = useDeactivateEvent();
  const [showBookings, setShowBookings] = useState(false);
  const badge = getStatusBadge(event, t);

  const handleDeactivate = () => {
    if (window.confirm(t('events.confirmDeactivate', 'Deactivate this event?'))) {
      deactivateMutation.mutate(event.id);
    }
  };

  const spotsLeft = event.max_capacity - event.current_bookings;

  return (
    <div className="glass-card p-4 hover:bg-white/85 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold text-deep-charcoal leading-tight">{event.title}</h3>
        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${badge.color}`}>
          {badge.label}
        </span>
      </div>

      {event.description && (
        <p className="text-xs text-stone-gray mb-3 line-clamp-2">{event.description}</p>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs mb-3">
        <div className="text-stone-gray">
          {t('events.date', 'Date')}: <span className="text-deep-charcoal font-medium">{formatDate(event.event_date)}</span>
        </div>
        <div className="text-stone-gray">
          {t('events.time', 'Time')}: <span className="text-deep-charcoal font-medium">{formatTime(event.event_time)}</span>
        </div>
        <div className="text-stone-gray">
          {t('events.duration', 'Duration')}: <span className="text-deep-charcoal font-medium">{event.duration_minutes} min</span>
        </div>
        <div className="text-stone-gray">
          {t('events.price', 'Price')}: <span className="text-deep-charcoal font-medium">{formatPrice(event.price)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-glass-border-dark">
        <div className="text-xs text-stone-gray">
          <span className="font-semibold text-deep-charcoal">{event.current_bookings}/{event.max_capacity}</span>{' '}
          {t('events.booked', 'booked')}
          {spotsLeft > 0 && event.is_active && (
            <span className="text-green-600 ml-1">({spotsLeft} {t('events.spotsLeft', 'left')})</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {event.current_bookings > 0 && (
            <button
              type="button"
              onClick={() => setShowBookings(!showBookings)}
              className="text-xs text-[#9F1239] hover:text-[#881337] font-medium transition-colors"
            >
              {showBookings ? t('events.hideBookings', 'Hide') : t('events.viewBookings', 'View Bookings')}
            </button>
          )}
          {event.is_active && (
            <button
              type="button"
              onClick={handleDeactivate}
              disabled={deactivateMutation.isPending}
              className="text-xs text-red-600 hover:text-red-800 font-medium transition-colors disabled:opacity-50"
            >
              {t('events.deactivate', 'Deactivate')}
            </button>
          )}
        </div>
      </div>

      {showBookings && <EventBookingsPanel eventId={event.id} />}
    </div>
  );
}

export default function EventsPage() {
  const { t } = useTranslation();
  const [showForm, setShowForm] = useState(false);
  const { data: events, isLoading, error } = useEventList();

  const totalEvents = events?.length ?? 0;
  const upcomingEvents = events?.filter((e) => {
    const now = new Date();
    const eventDateTime = new Date(`${e.event_date}T${e.event_time}`);
    return e.is_active && eventDateTime >= now && e.current_bookings < e.max_capacity;
  }).length ?? 0;
  const totalBookings = events?.reduce((sum, e) => sum + e.current_bookings, 0) ?? 0;
  const totalRevenue = events?.reduce((sum, e) => sum + (e.current_bookings * e.price), 0) ?? 0;

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-deep-charcoal">
            {t('events.pageTitle', 'Events & Experiences')}
          </h1>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#9F1239] hover:bg-[#881337] text-white font-semibold rounded-full text-sm transition-colors"
            >
              <ThiingsIcon name="plus" size="xs" />
              {t('events.newEvent', 'New Event')}
            </button>
          )}
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-bold text-deep-charcoal">{totalEvents}</div>
            <div className="text-xs text-stone-gray mt-1">{t('events.totalEvents', 'Total')}</div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{upcomingEvents}</div>
            <div className="text-xs text-stone-gray mt-1">{t('events.upcomingEvents', 'Upcoming')}</div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-bold text-[#9F1239]">{totalBookings}</div>
            <div className="text-xs text-stone-gray mt-1">{t('events.totalBookings', 'Bookings')}</div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-bold text-deep-charcoal">{formatPrice(totalRevenue)}</div>
            <div className="text-xs text-stone-gray mt-1">{t('events.estimatedRevenue', 'Est. Revenue')}</div>
          </div>
        </div>

        {/* Create form (collapsible) */}
        {showForm && (
          <div className="mb-6">
            <EventCreateForm
              onCreated={() => setShowForm(false)}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        {/* Event list */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#E5E7EB] border-t-[#9F1239]" />
          </div>
        )}

        {error && (
          <div className="text-center py-12 text-red-600 text-sm">
            {t('events.errorLoading', 'Error loading events')}
          </div>
        )}

        {!isLoading && !error && events && events.length === 0 && (
          <div className="glass-panel text-center py-12">
            <p className="text-sm font-medium text-deep-charcoal">{t('events.noEvents', 'No events yet')}</p>
            <p className="text-xs text-stone-gray mt-1">{t('events.noEventsHint', 'Create your first event to offer unique experiences')}</p>
          </div>
        )}

        {!isLoading && !error && events && events.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
