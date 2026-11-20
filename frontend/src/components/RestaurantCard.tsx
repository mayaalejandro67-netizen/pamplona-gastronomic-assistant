import { ArrowRight, Check, FileText, Heart, MapPin, Scale, Utensils } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatPriceRange, getRestaurantVisual } from "@/lib/visuals";
import type { Language, Restaurant } from "@/types";

interface RestaurantCardProps {
  restaurant: Restaurant;
  language: Language;
  isFavorite: boolean;
  isCompared?: boolean;
  compareDisabled?: boolean;
  isHighlighted?: boolean;
  compact?: boolean;
  indexBadge?: number;
  onToggleFavorite: (id: string) => void;
  onToggleCompare?: (id: string) => void;
  onSelect: (restaurant: Restaurant) => void;
  onLocate?: (restaurant: Restaurant) => void;
  onHover?: (id: string | null) => void;
}

export function RestaurantCard({
  restaurant,
  language,
  isFavorite,
  isCompared = false,
  compareDisabled = false,
  isHighlighted = false,
  compact = false,
  indexBadge,
  onToggleFavorite,
  onToggleCompare,
  onSelect,
  onLocate,
  onHover,
}: RestaurantCardProps) {
  const t = getCopy(language);
  const visual = getRestaurantVisual(restaurant.id, restaurant.category, restaurant.photos);
  const priceRange = formatPriceRange(restaurant.min_price, restaurant.max_price);

  if (compact) {
    return (
      <article
        onMouseEnter={() => onHover?.(restaurant.id)}
        onMouseLeave={() => onHover?.(null)}
        className={cn(
          "group flex flex-col overflow-hidden rounded-2xl border bg-[var(--bg-card)] transition-all",
          isHighlighted || isCompared
            ? "border-[var(--accent-coral)] ring-2 ring-[var(--accent-coral)]/25 shadow-md"
            : "border-[var(--border)] hover:border-[var(--accent-sage)]/60 hover:shadow-sm",
        )}
      >
        <div
          className={cn(
            "relative h-32 w-full overflow-hidden bg-gradient-to-br",
            visual.gradient,
          )}
        >
          {visual.image ? (
            <img
              src={visual.image}
              alt={restaurant.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center text-white/95">
              <Utensils className="h-7 w-7 opacity-85" />
              <span className="mt-1 text-xs font-semibold uppercase tracking-wider opacity-90">
                {visual.tag}
              </span>
            </div>
          )}

          {indexBadge !== undefined ? (
            <span className="absolute left-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-brand)] text-xs font-bold text-white ring-2 ring-white shadow-sm">
              {indexBadge}
            </span>
          ) : null}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(restaurant.id);
            }}
            aria-label="Favorite"
            className={cn(
              "absolute right-2.5 top-2.5 flex h-8 w-8 items-center justify-center rounded-full border shadow-sm backdrop-blur-xs transition-colors cursor-pointer",
              isFavorite
                ? "border-white/70 bg-[var(--accent-brand)] text-white"
                : "border-white/60 bg-[#14191D]/65 text-white hover:bg-[#14191D]/85",
            )}
          >
            <Heart className={cn("h-4 w-4", isFavorite && "fill-current")} />
          </button>

          <span className="absolute bottom-2 right-2 rounded-full bg-[#14191D]/80 px-2.5 py-0.5 text-[11px] font-bold text-[#F2F1EE] backdrop-blur-xs">
            {restaurant.price_tier}
            {priceRange ? ` · ${priceRange}` : ""}
          </span>
        </div>

        <div className="flex flex-1 flex-col justify-between gap-2.5 p-3.5">
          <div>
            <h3 className="font-editorial truncate text-base font-bold text-[var(--fg)]">
              {restaurant.name}
            </h3>
            <p className="truncate text-xs font-semibold text-[var(--fg-muted)]">
              {restaurant.category} · {restaurant.neighborhood}
            </p>
            <p className="mt-1 text-xs font-bold text-[var(--accent-coral)]">
              {priceRange || restaurant.price_tier}
            </p>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--fg-muted)]">
              {restaurant.summary}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Button
              variant="terracotta"
              size="sm"
              className="flex-1 text-xs"
              onClick={() => onSelect(restaurant)}
            >
              <span>{t.chat.viewDetails}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            {onLocate ? (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 shrink-0"
                title={language === "es" ? "Ver ubicación" : "Locate on map"}
                onClick={() => onLocate(restaurant)}
              >
                <MapPin className="h-3.5 w-3.5 text-[var(--accent-sage)]" />
              </Button>
            ) : null}
            {onToggleCompare ? (
              <Button
                variant={isCompared ? "olive" : "outline"}
                size="icon"
                disabled={compareDisabled && !isCompared}
                className="h-8 w-8 shrink-0"
                title={language === "es" ? "Comparar" : "Compare"}
                onClick={() => onToggleCompare(restaurant.id)}
              >
                {isCompared ? <Check className="h-3.5 w-3.5" /> : <Scale className="h-3.5 w-3.5" />}
              </Button>
            ) : null}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      onMouseEnter={() => onHover?.(restaurant.id)}
      onMouseLeave={() => onHover?.(null)}
      className={cn(
        "group flex flex-col gap-3.5 rounded-2xl border bg-[var(--bg-card)] p-4 transition-all sm:flex-row sm:items-stretch",
        isHighlighted || isCompared
          ? "border-[var(--accent-coral)] ring-2 ring-[var(--accent-coral)]/25 shadow-md"
          : "border-[var(--border)] hover:border-[var(--accent-sage)]/60 hover:shadow-sm",
      )}
    >
      <div
        className={cn(
          "relative h-36 w-full shrink-0 overflow-hidden rounded-xl bg-gradient-to-br sm:h-auto sm:w-36",
          visual.gradient,
        )}
      >
        {visual.image ? (
          <img
            src={visual.image}
            alt={restaurant.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center text-white/95">
            <Utensils className="h-7 w-7 opacity-85" />
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-wider opacity-90">
              {visual.tag}
            </span>
          </div>
        )}
        {indexBadge !== undefined ? (
          <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-brand)] text-xs font-bold text-white ring-2 ring-white shadow-sm">
            {indexBadge}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-editorial truncate text-lg font-bold text-[var(--fg)]">
              {restaurant.name}
            </h3>
            <p className="text-[13px] font-semibold text-[var(--fg-muted)]">
              {restaurant.category} · {restaurant.neighborhood}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(restaurant.id);
            }}
            aria-label="Favorite"
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border transition-colors cursor-pointer",
              isFavorite
                ? "border-[var(--accent-coral)]/40 bg-[var(--accent-coral)]/15 text-[var(--accent-coral)]"
                : "border-[var(--border)] bg-[var(--bg-soft)] text-[var(--fg-muted)] hover:border-[var(--accent-coral)] hover:text-[var(--accent-coral)]",
            )}
          >
            <Heart className={cn("h-4 w-4", isFavorite && "fill-current")} />
          </button>
        </div>

        <p className="line-clamp-2 text-[13px] leading-relaxed text-[var(--fg-muted)]">
          {restaurant.summary}
        </p>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="cream" className="text-[12px]">
            <MapPin className="h-3 w-3 text-[var(--accent-sage)]" />
            {restaurant.location}
          </Badge>
          <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-0.5 text-[12px] font-bold text-[var(--accent-coral)]">
            {restaurant.price_tier}
            {priceRange ? ` · ${priceRange}` : ""}
          </span>
          <Badge variant="cream" className="text-[12px]">
            <Utensils className="h-3 w-3 text-[var(--fg-muted)]" />
            {t.chat.dishesCount(restaurant.dish_count)}
          </Badge>
          <Badge variant="olive" className="text-[12px]">
            <FileText className="h-3 w-3" />
            {t.chat.guideBadge}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <Button
            variant="terracotta"
            size="sm"
            className="text-[13px]"
            onClick={() => onSelect(restaurant)}
          >
            <span>{t.chat.viewDetails}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
          {onLocate ? (
            <Button
              variant="outline"
              size="sm"
              className="text-[13px]"
              onClick={() => onLocate(restaurant)}
            >
              <MapPin className="h-3.5 w-3.5 text-[var(--accent-sage)]" />
              <span>{language === "es" ? "Ver ubicación" : "Locate"}</span>
            </Button>
          ) : null}
          {onToggleCompare ? (
            <Button
              variant={isCompared ? "olive" : "outline"}
              size="sm"
              disabled={compareDisabled && !isCompared}
              className="text-[13px]"
              onClick={() => onToggleCompare(restaurant.id)}
            >
              {isCompared ? <Check className="h-3.5 w-3.5" /> : <Scale className="h-3.5 w-3.5" />}
              <span>
                {isCompared
                  ? language === "es"
                    ? "En comparador"
                    : "Comparing"
                  : language === "es"
                    ? "Comparar"
                    : "Compare"}
              </span>
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
