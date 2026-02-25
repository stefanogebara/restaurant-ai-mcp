/**
 * ManagerNotesPanel
 *
 * Dashboard panel for managers to teach the AI about guests and policies.
 * Supports adding notes about specific guests (VIP instructions) and
 * general restaurant policies that the AI should follow.
 */

import { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/api';
import ThiingsIcon from '../common/ThiingsIcon';

interface ManagerNote {
  id: string;
  content: string;
  guest_phone: string | null;
  importance: number;
  is_policy: boolean;
  created_at: string;
}

const translations = {
  en: {
    title: 'AI Memory & Manager Notes',
    subtitle: 'Teach the AI about your guests and policies',
    addNote: 'Add Note',
    guestPhone: 'Guest Phone (optional)',
    guestPhonePlaceholder: '+34 612 345 678',
    noteContent: 'Note',
    noteContentPlaceholder: 'e.g., "Always comp dessert for Mr. Rodriguez" or "No large parties near the kitchen"',
    typeLabel: 'Note Type',
    typeVip: 'VIP Guest Instruction',
    typePolicy: 'General Policy',
    typePreference: 'Guest Preference',
    saving: 'Saving...',
    save: 'Save Note',
    loading: 'Loading notes...',
    noNotes: 'No manager notes yet. Add notes to teach the AI about your guests and policies.',
    deleteConfirm: 'Delete this note?',
    policy: 'Policy',
    guest: 'Guest',
    errorLoad: 'Failed to load notes',
    errorSave: 'Failed to save note',
    errorDelete: 'Failed to delete note'
  },
  es: {
    title: 'Memoria IA & Notas del Gerente',
    subtitle: 'Enseña a la IA sobre tus clientes y politicas',
    addNote: 'Agregar Nota',
    guestPhone: 'Telefono del Cliente (opcional)',
    guestPhonePlaceholder: '+34 612 345 678',
    noteContent: 'Nota',
    noteContentPlaceholder: 'ej., "Siempre ofrecer postre cortesia al Sr. Rodriguez" o "No sentar grupos grandes cerca de la cocina"',
    typeLabel: 'Tipo de Nota',
    typeVip: 'Instruccion VIP',
    typePolicy: 'Politica General',
    typePreference: 'Preferencia del Cliente',
    saving: 'Guardando...',
    save: 'Guardar Nota',
    loading: 'Cargando notas...',
    noNotes: 'No hay notas aun. Agrega notas para ensenar a la IA sobre tus clientes y politicas.',
    deleteConfirm: 'Eliminar esta nota?',
    policy: 'Politica',
    guest: 'Cliente',
    errorLoad: 'Error al cargar notas',
    errorSave: 'Error al guardar nota',
    errorDelete: 'Error al eliminar nota'
  }
};

interface ManagerNotesPanelProps {
  language?: 'en' | 'es';
}

export default function ManagerNotesPanel({ language = 'en' }: ManagerNotesPanelProps) {
  const t = translations[language] || translations.en;

  const [notes, setNotes] = useState<ManagerNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [guestPhone, setGuestPhone] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState<'vip_instruction' | 'general_policy' | 'guest_preference'>('vip_instruction');

  const apiUrl = import.meta.env.VITE_API_URL || '';

  const loadNotes = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await authFetch(`${apiUrl}/api/manager-notes`);
      const data = await response.json();

      if (data.success) {
        setNotes(data.notes);
      }
      setError(null);
    } catch {
      setError(t.errorLoad);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, t.errorLoad]);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const handleSave = async () => {
    if (!noteContent.trim()) return;

    setIsSaving(true);
    try {
      const response = await authFetch(`${apiUrl}/api/manager-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guest_phone: guestPhone.trim() || undefined,
          content: noteContent.trim(),
          note_type: noteType
        })
      });

      const data = await response.json();
      if (data.success) {
        setNotes(prev => [data.note, ...prev]);
        setNoteContent('');
        setGuestPhone('');
        setShowForm(false);
      } else {
        setError(t.errorSave);
      }
    } catch {
      setError(t.errorSave);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm(t.deleteConfirm)) return;

    try {
      const response = await authFetch(`${apiUrl}/api/manager-notes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: noteId })
      });

      const data = await response.json();
      if (data.success) {
        setNotes(prev => prev.filter(n => n.id !== noteId));
      }
    } catch {
      setError(t.errorDelete);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-border-gray p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold text-deep-charcoal tracking-tight">
            {t.title}
          </h3>
          <p className="text-xs text-muted-stone mt-0.5">{t.subtitle}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-3 py-1.5 rounded-xl bg-burgundy text-white font-medium hover:bg-burgundy-dark transition-colors"
        >
          {t.addNote}
        </button>
      </div>

      {error && (
        <div className="mb-3 p-2 rounded-xl bg-red-50 text-red-700 text-xs rounded-xl">
          {error}
        </div>
      )}

      {showForm && (
        <div className="mb-4 p-4 rounded-xl bg-warm-white border border-border-gray space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-gray mb-1">
              {t.typeLabel}
            </label>
            <select
              value={noteType}
              onChange={(e) => setNoteType(e.target.value as typeof noteType)}
              className="w-full text-sm border border-border-gray rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy"
            >
              <option value="vip_instruction">{t.typeVip}</option>
              <option value="general_policy">{t.typePolicy}</option>
              <option value="guest_preference">{t.typePreference}</option>
            </select>
          </div>

          {noteType !== 'general_policy' && (
            <div>
              <label className="block text-xs font-medium text-stone-gray mb-1">
                {t.guestPhone}
              </label>
              <input
                type="tel"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
                placeholder={t.guestPhonePlaceholder}
                className="w-full text-sm border border-border-gray rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-stone-gray mb-1">
              {t.noteContent}
            </label>
            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder={t.noteContentPlaceholder}
              rows={3}
              className="w-full text-sm border border-border-gray rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-burgundy/20 focus:border-burgundy resize-none"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving || !noteContent.trim()}
            className="w-full text-sm px-4 py-2 rounded-xl bg-burgundy text-white font-medium hover:bg-burgundy-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? t.saving : t.save}
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-border-gray rounded w-3/4" />
          <div className="h-4 bg-border-gray rounded w-1/2" />
        </div>
      ) : notes.length === 0 ? (
        <div className="text-center py-8 px-4">
          <div className="w-12 h-12 rounded-2xl bg-soft-gray flex items-center justify-center mb-3 mx-auto">
            <ThiingsIcon name="lightbulb" pxSize={20} />
          </div>
          <p className="text-sm font-semibold text-deep-charcoal mb-1">No notes yet</p>
          <p className="text-xs text-muted-stone">{t.noNotes}</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {notes.map((note) => (
            <div
              key={note.id}
              className="flex items-start gap-2 p-4 rounded-xl bg-warm-white border border-border-gray group"
            >
              <span
                className={`shrink-0 mt-0.5 text-xs px-2 py-0.5 rounded-lg font-medium ${
                  note.is_policy
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-amber-100 text-amber-700'
                }`}
              >
                {note.is_policy ? t.policy : t.guest}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-deep-charcoal">{note.content}</p>
                {note.guest_phone && (
                  <p className="text-xs text-muted-stone mt-0.5">{note.guest_phone}</p>
                )}
              </div>
              <button
                onClick={() => handleDelete(note.id)}
                aria-label="Delete note"
                className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-stone hover:text-red-500 transition-all p-1.5 rounded-lg"
              >
                <ThiingsIcon name="close" pxSize={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
