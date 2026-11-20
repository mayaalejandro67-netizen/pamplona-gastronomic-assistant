import { useEffect, useState } from "react";
import {
  BookOpen,
  Check,
  Euro,
  Filter,
  MapPin,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Utensils,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { FilterState, Language, PriceTier } from "@/types";

interface FiltersSidebarProps {
  language: Language;
  categories: string[];
  locations: string[];
  totalRestaurants: number;
  visibleCount: number;
  applied: FilterState;
  onApply: (next: FilterState) => void;
  onClear: () => void;
  hasChatCitations: boolean;
}

const PRICE_TIERS: PriceTier[] = ["€", "€€", "€€€"];

export function FiltersSidebar({
  language,
  categories,
  locations,
  totalRestaurants,
  visibleCount,
  applied,
  onApply,
  onClear,
  hasChatCitations,
}: FiltersSidebarProps) {
  const t = getCopy(language);
  const [draft, setDraft] = useState<FilterState>(applied);

  useEffect(() => {
    setDraft(applied);
  }, [applied]);

  const toggleCategory = (cat: string) => {
    setDraft((prev) => {
      const exists = prev.categories.includes(cat);
      const nextCategories = exists
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat];
      const next = { ...prev, categories: nextCategories };
      onApply(next);
      return next;
    });
  };

  const togglePrice = (tier: PriceTier) => {
    setDraft((prev) => {
      const next = { ...prev, priceTier: prev.priceTier === tier ? null : tier };
      onApply(next);
      return next;
    });
  };

  const handleZoneChange = (loc: string) => {
    setDraft((prev) => {
      const next = { ...prev, location: loc };
      onApply(next);
      return next;
    });
  };

  const handleOnlyChatToggle = () => {
    setDraft((prev) => {
      const next = { ...prev, onlyChatResults: !prev.onlyChatResults };
      onApply(next);
      return next;
    });
  };

  const hasActiveFilters =
    draft.categories.length > 0 ||
    draft.priceTier !== null ||
    draft.location !== "all" ||
    draft.searchQuery.trim().length > 0 ||
    draft.onlyChatResults;

  return (
    <aside className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-xs transition-colors lg:h-[calc(100vh-92px)] lg:overflow-y-auto">
      <div className="mb-4 flex items-center justify-between border-b border-[var(--border-soft)] pb-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-[var(--accent-sage)]" />
          <h2 className="font-editorial text-lg font-bold text-[var(--fg)]">
            {t.filters.title}
          </h2>
        </div>
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-semibold text-[var(--accent-coral)] hover:underline cursor-pointer"
          >
            {t.filters.clear}
          </button>
        ) : null}
      </div>

      {/* Quick search */}
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--fg-muted)]" />
        <input
          type="text"
          value={draft.searchQuery}
          onChange={(e) => {
            const next = { ...draft, searchQuery: e.target.value };
            setDraft(next);
            onApply(next);
          }}
          placeholder={t.filters.searchPlaceholder}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] py-2.5 pl-9 pr-3 text-[13px] text-[var(--fg)] placeholder:text-[var(--fg-subtle)] focus:border-[var(--accent-sage)] focus:outline-none"
        />
      </div>

      {/* Cuisine pills */}
      <div className="mb-5">
        <div className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-[var(--fg)]">
          <Utensils className="h-4 w-4 text-[var(--fg-muted)]" />
          <span>{t.filters.cuisine}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => {
            const active = draft.categories.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCategory(cat)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all cursor-pointer",
                  active
                    ? "bg-[var(--accent-cta-bg)] text-[var(--accent-cta-fg)] shadow-xs"
                    : "border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--fg)] hover:bg-[var(--bg-hover)]",
                )}
              >
                {active && <Check className="h-3.5 w-3.5" />}
                <span>{cat}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Price tier */}
      <div className="mb-5">
        <div className="mb-2.5 flex items-center gap-1.5 text-sm font-bold text-[var(--fg)]">
          <Euro className="h-4 w-4 text-[var(--fg-muted)]" />
          <span>{t.filters.price}</span>
          <span className="text-xs font-normal text-[var(--fg-muted)]">
            {t.filters.priceHint}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1">
          {PRICE_TIERS.map((tier) => {
            const active = draft.priceTier === tier;
            return (
              <button
                key={tier}
                type="button"
                onClick={() => togglePrice(tier)}
                className={cn(
                  "rounded-lg py-2 text-[13px] font-bold transition-colors cursor-pointer",
                  active
                    ? "bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] shadow-xs"
                    : "text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]",
                )}
              >
                {tier}
              </button>
            );
          })}
        </div>
      </div>

      {/* Only chat-cited toggle */}
      <div className="mb-5 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] px-3.5 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--accent-sage)]" />
          <span className="text-[13px] font-semibold text-[var(--fg)]">
            {t.filters.onlyChat}
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={draft.onlyChatResults}
          disabled={!hasChatCitations && !draft.onlyChatResults}
          onClick={handleOnlyChatToggle}
          className={cn(
            "relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors cursor-pointer disabled:opacity-40",
            draft.onlyChatResults ? "bg-[var(--accent-sage)]" : "bg-[var(--border)]",
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 rounded-full bg-white shadow-xs transition-transform",
              draft.onlyChatResults ? "translate-x-5" : "translate-x-1",
            )}
          />
        </button>
      </div>

      {/* Zone dropdown */}
      <div className="mb-5">
        <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--fg)]">
          <MapPin className="h-4 w-4 text-[var(--fg-muted)]" />
          <span>{t.filters.zone}</span>
        </div>
        <select
          value={draft.location}
          onChange={(e) => handleZoneChange(e.target.value)}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] px-3 py-2.5 text-[13px] font-medium text-[var(--fg)] focus:border-[var(--accent-sage)] focus:outline-none cursor-pointer"
        >
          <option value="all">{t.filters.anyZone}</option>
          {locations.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>
      </div>

      {/* Grounded guide summary card */}
      <div className="mt-auto mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] p-3.5">
        <div className="flex items-center gap-2 text-xs font-bold text-[var(--accent-sage-text)]">
          <BookOpen className="h-4 w-4 text-[var(--accent-sage)]" />
          <span>
            {language === "es" ? "Base de conocimiento PDF" : "PDF Knowledge Base"}
          </span>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--fg-muted)]">
          {language === "es"
            ? `Mostrando ${visibleCount} de ${totalRestaurants} locales · ${locations.length} zonas de Navarra.`
            : `Showing ${visibleCount} of ${totalRestaurants} venues · ${locations.length} areas in Navarra.`}
        </p>
      </div>

      {/* Footer actions */}
      <div className="flex flex-col gap-2">
        <Button
          variant="olive"
          className="w-full text-[13px] font-semibold"
          onClick={() => onApply(draft)}
        >
          <Filter className="h-4 w-4" />
          {t.filters.apply}
        </Button>
        <Button
          variant="outline"
          className="w-full text-[13px] font-semibold"
          onClick={onClear}
        >
          <RotateCcw className="h-4 w-4" />
          {t.filters.clear}
        </Button>
      </div>
    </aside>
  );
}
