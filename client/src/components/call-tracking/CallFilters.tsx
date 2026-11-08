import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { CallFilter } from "./callTrackingTypes";

interface Props {
  filter: CallFilter;
  onChange: (filter: CallFilter) => void;
}

export default function CallFilters({ filter, onChange }: Props) {
  const { t } = useTranslation();
  const [searchInput, setSearchInput] = useState(filter.search || "");
  const [showMore, setShowMore] = useState(false);
  const activeMoreCount =
    Number(Boolean(filter.search)) +
    Number(filter.outcome !== "all") +
    Number(Boolean(filter.sentiment && filter.sentiment !== "all")) +
    Number(filter.language !== "all");

  // Hold the latest filter in a ref so the debounced search merges into the
  // *freshest* filter. The previous version closed over `filter` from when the
  // effect ran — changing the period/outcome during the 300ms debounce window
  // would get silently reverted when the stale-closure timer fired.
  const filterRef = useRef(filter);
  filterRef.current = filter;

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== (filterRef.current.search || "")) {
        onChange({ ...filterRef.current, search: searchInput || undefined });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, onChange]);

  const PERIOD_OPTIONS = [
    { value: "1d", label: t("callTracking.twentyFourHours") },
    { value: "7d", label: t("callTracking.sevenDays") },
    { value: "30d", label: t("callTracking.thirtyDays") },
    { value: "90d", label: t("callTracking.ninetyDays") },
  ] as const;

  return (
    <div className="border-b border-glass-border-dark">
      <div className="flex flex-col gap-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1 sm:gap-2">
          <span className="mr-1 text-xs font-medium text-muted-stone">
            {t("callTracking.period")}
          </span>
          {PERIOD_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.value}
              onClick={() => onChange({ ...filter, period: opt.value })}
              aria-pressed={filter.period === opt.value}
              className={`rounded-xl px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 ${
                filter.period === opt.value
                  ? "bg-soft-gray text-deep-charcoal"
                  : "text-muted-stone hover:text-stone-gray"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-controls="call-more-filters"
          aria-expanded={showMore}
          onClick={() => setShowMore((value) => !value)}
          className="self-start rounded-full border border-glass-border-dark bg-white/50 px-4 py-2 text-xs font-medium text-deep-charcoal sm:hidden"
        >
          {t("callTracking.moreFilters")}
          {activeMoreCount > 0 ? ` (${activeMoreCount})` : ""}
        </button>

        <div
          id="call-more-filters"
          className={`${
            showMore ? "flex" : "hidden"
          } flex-wrap items-center gap-4 pb-2 sm:flex sm:gap-6 sm:pb-0`}
        >
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder={t(
                "callTracking.searchPlaceholder",
                "Search calls..."
              )}
              aria-label={t(
                "callTracking.searchPlaceholder",
                "Search calls..."
              )}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="text-xs font-medium px-3 py-1.5 bg-soft-gray border-0 rounded-xl text-deep-charcoal placeholder-muted-stone w-40 focus:outline-none focus:ring-2 focus:ring-burgundy/20"
            />
          </div>

          {/* Outcome */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-stone">
              {t("callTracking.outcome")}
            </span>
            <select
              aria-label={t("callTracking.outcome")}
              value={filter.outcome}
              onChange={(e) => onChange({ ...filter, outcome: e.target.value })}
              className="text-xs font-medium px-3 py-1.5 bg-soft-gray border-0 rounded-xl text-deep-charcoal cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy/20"
            >
              <option value="all">{t("callTracking.outcomeAll")}</option>
              <option value="reservation_created">
                {t("callTracking.outcomeBooked")}
              </option>
              <option value="information_only">
                {t("callTracking.outcomeInfo")}
              </option>
              <option value="error">{t("callTracking.outcomeErrors")}</option>
              <option value="abandoned">
                {t("callTracking.outcomeAbandoned")}
              </option>
            </select>
          </div>

          {/* Sentiment */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-stone">
              {t("callTracking.sentiment", "Sentiment")}
            </span>
            <select
              aria-label={t("callTracking.sentiment", "Sentiment")}
              value={filter.sentiment || "all"}
              onChange={(e) =>
                onChange({
                  ...filter,
                  sentiment:
                    e.target.value === "all" ? undefined : e.target.value,
                })
              }
              className="text-xs font-medium px-3 py-1.5 bg-soft-gray border-0 rounded-xl text-deep-charcoal cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy/20"
            >
              <option value="all">{t("callTracking.outcomeAll")}</option>
              <option value="positive">
                {t("callTracking.sentimentPositive", "Positive")}
              </option>
              <option value="neutral">
                {t("callTracking.sentimentNeutral", "Neutral")}
              </option>
              <option value="negative">
                {t("callTracking.sentimentNegative", "Negative")}
              </option>
            </select>
          </div>

          {/* Language */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-stone">
              {t("callTracking.language")}
            </span>
            <select
              aria-label={t("callTracking.language")}
              value={filter.language}
              onChange={(e) =>
                onChange({ ...filter, language: e.target.value })
              }
              className="text-xs font-medium px-3 py-1.5 bg-soft-gray border-0 rounded-xl text-deep-charcoal cursor-pointer focus:outline-none focus:ring-2 focus:ring-burgundy/20"
            >
              <option value="all">{t("callTracking.outcomeAll")}</option>
              <option value="en">EN</option>
              <option value="es">ES</option>
              <option value="pt">PT</option>
              <option value="fr">FR</option>
              <option value="it">IT</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
