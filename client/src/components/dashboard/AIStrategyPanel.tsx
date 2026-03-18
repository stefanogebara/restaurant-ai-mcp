/**
 * AIStrategyPanel
 *
 * Implements the Karpathy autoresearch loop for restaurant operations:
 *   1. Owner writes their strategy doc (hypotheses about what will improve the business)
 *   2. Manager AI + Voice Agent use the strategy doc as context
 *   3. Nightly briefing includes strategy suggestions based on real metrics
 *   4. Owner updates the strategy → repeat
 *
 * The strategy doc acts as "program.md" — the human's instruction to the AI agent.
 */

import { useState } from 'react';
import { BookOpen, Sparkles, Save, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAIStrategy, useSaveAIStrategy, useGenerateStrategySuggestions } from '../../hooks/useAIStrategy';
import { useToast } from '../../contexts/ToastContext';
import Spinner from '../common/Spinner';

const PLACEHOLDERS: Record<string, string> = {
  en: `Example strategy for your AI agents:

FOCUS AREAS:
- Increase average bill by upselling wine pairings and desserts
- Reduce no-shows: prioritise guests who've cancelled before when confirming

TONE & EXPERIENCE:
- Weekend calls: emphasise the tasting menu (signature experience)
- Weekday calls: promote lunch business menu (value positioning)

PROMOTIONS:
- Tuesday–Thursday: offer complimentary amuse-bouche for parties of 4+
- Mention the private dining room for groups of 8+

GOALS:
- Target no-show rate below 5%
- Increase average revenue per cover`,
  'pt-BR': `Exemplo de estratégia para seus agentes de IA:

ÁREAS DE FOCO:
- Aumentar ticket médio sugerindo harmonizações de vinho e sobremesas
- Reduzir no-shows: priorizar confirmação de clientes que já cancelaram

TOM E EXPERIÊNCIA:
- Chamadas de fim de semana: destacar o menu degustação (experiência exclusiva)
- Chamadas durante a semana: promover o menu executivo (valor acessível)

PROMOÇÕES:
- Terça a quinta: oferecer cortesia para mesas de 4+ pessoas
- Mencionar a sala privativa para grupos de 8+

METAS:
- Taxa de no-show abaixo de 5%
- Aumentar receita média por couvert`,
  es: `Ejemplo de estrategia para sus agentes de IA:

ÁREAS DE ENFOQUE:
- Aumentar cuenta promedio sugiriendo maridajes y postres
- Reducir no-shows: priorizar confirmación de clientes que ya cancelaron

TONO Y EXPERIENCIA:
- Llamadas de fin de semana: destacar el menú degustación (experiencia exclusiva)
- Llamadas entre semana: promover el menú ejecutivo (propuesta de valor)

PROMOCIONES:
- Martes a jueves: ofrecer cortesía para mesas de 4+ personas
- Mencionar el salón privado para grupos de 8+

METAS:
- Tasa de no-show por debajo del 5%
- Aumentar ingreso promedio por cubierto`,
};

export default function AIStrategyPanel() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { data, isLoading } = useAIStrategy();
  const saveMutation = useSaveAIStrategy();
  const suggestMutation = useGenerateStrategySuggestions();

  const [doc, setDoc] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string | null>(null);

  // Use local state if editing, otherwise use server value
  const currentDoc = doc !== null ? doc : (data?.strategy_doc ?? '');

  const isDirty = doc !== null && doc !== (data?.strategy_doc ?? '');

  async function handleSave() {
    try {
      await saveMutation.mutateAsync(currentDoc);
      setDoc(null); // reset dirty state
      toast.success(t('strategy.saved', 'Strategy saved — AI agents will use this on their next run'));
    } catch {
      toast.error(t('strategy.saveFailed', 'Failed to save strategy'));
    }
  }

  async function handleSuggest() {
    try {
      const result = await suggestMutation.mutateAsync();
      setSuggestions(result);
    } catch {
      toast.error(t('strategy.suggestFailed', 'Failed to generate suggestions'));
    }
  }

  function handleApplySuggestions() {
    if (!suggestions) return;
    const newDoc = currentDoc
      ? currentDoc + '\n\n--- AI SUGGESTIONS ---\n' + suggestions
      : suggestions;
    setDoc(newDoc);
    setSuggestions(null);
    toast.info(t('strategy.suggestionsAdded', 'Suggestions added to your strategy — review and save when ready'));
  }

  const updatedAt = data?.updated_at
    ? new Date(data.updated_at).toLocaleDateString(i18n.language, {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
      })
    : null;

  return (
    <div className="bg-white border border-border-gray rounded-2xl p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-burgundy/10 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-4.5 h-4.5 text-burgundy" />
          </div>
          <div>
            <h3 className="font-semibold text-deep-charcoal text-sm">{t('strategy.title', 'AI Strategy Document')}</h3>
            <p className="text-xs text-muted-stone mt-0.5">
              {t('strategy.subtitle', 'Your instructions to the AI — applied by Manager AI & Voice Agent')}
            </p>
          </div>
        </div>
        {updatedAt && (
          <div className="flex items-center gap-1 text-xs text-muted-stone">
            <Clock className="w-3.5 h-3.5" />
            <span>{t('strategy.savedAt', 'Saved {{date}}', { date: updatedAt })}</span>
          </div>
        )}
      </div>

      {/* How it works pill */}
      <div className="flex items-center gap-1.5 text-xs text-burgundy bg-burgundy/5 border border-burgundy/15 rounded-lg px-3 py-2 mb-4">
        <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
        <span>
          {t('strategy.howItWorks', 'The AI reads this every night — suggest it updates, then you edit and save. Repeat.')}
        </span>
      </div>

      {/* Textarea */}
      {isLoading ? (
        <div className="h-48 flex items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <textarea
          value={currentDoc}
          onChange={e => setDoc(e.target.value)}
          placeholder={PLACEHOLDERS[i18n.language] || PLACEHOLDERS.en}
          rows={12}
          className="w-full text-sm font-mono text-deep-charcoal bg-warm-white border border-border-gray rounded-xl px-4 py-3 resize-y focus:outline-none focus:ring-2 focus:ring-burgundy/30 focus:border-burgundy/40 transition-colors placeholder:text-muted-stone/60"
        />
      )}

      {/* AI suggestions output */}
      {suggestions && (
        <div className="mt-4 p-4 bg-burgundy/5 border border-burgundy/20 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-burgundy uppercase tracking-wide">
              {t('strategy.suggestions', 'AI Strategy Suggestions')}
            </span>
            <button
              onClick={() => setSuggestions(null)}
              className="text-xs text-muted-stone hover:text-deep-charcoal cursor-pointer"
            >
              {t('common.dismiss', 'Dismiss')}
            </button>
          </div>
          <pre className="text-sm text-deep-charcoal whitespace-pre-wrap font-sans leading-relaxed">
            {suggestions}
          </pre>
          <button
            onClick={handleApplySuggestions}
            className="mt-3 text-xs font-medium text-burgundy hover:text-burgundy-dark cursor-pointer underline underline-offset-2"
          >
            {t('strategy.addToDoc', 'Add to strategy document')}
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={handleSave}
          disabled={!isDirty || saveMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-burgundy hover:bg-burgundy-dark disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
        >
          {saveMutation.isPending ? (
            <Spinner size="sm" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          {t('strategy.saveApply', 'Save & Apply')}
        </button>

        <button
          onClick={handleSuggest}
          disabled={suggestMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 border border-border-gray hover:border-burgundy/40 hover:bg-burgundy/5 disabled:opacity-40 disabled:cursor-not-allowed text-deep-charcoal text-sm font-medium rounded-lg transition-colors cursor-pointer"
        >
          {suggestMutation.isPending ? (
            <Spinner size="sm" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          {t('strategy.generate', 'Generate from your data')}
        </button>

        {isDirty && (
          <button
            onClick={() => setDoc(null)}
            className="text-sm text-muted-stone hover:text-deep-charcoal cursor-pointer"
          >
            {t('common.discard', 'Discard')}
          </button>
        )}
      </div>

      {/* Info footer */}
      <p className="text-xs text-muted-stone mt-4 leading-relaxed">
        {t('strategy.footer', 'Write what you want the AI to prioritise, how to position your restaurant, what promotions to mention. The AI applies this context every time it speaks with guests or advises you.')}
      </p>
    </div>
  );
}
