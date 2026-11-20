import {
  FileText,
  MapPin,
  MessageSquareText,
  Scale,
  Sparkles,
  Utensils,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatPriceRange, getRestaurantVisual } from "@/lib/visuals";
import type { Language, Restaurant } from "@/types";

interface CompareModalProps {
  restaurants: Restaurant[];
  open: boolean;
  language: Language;
  onClose: () => void;
  onRemove: (id: string) => void;
  onSelectDetails: (restaurant: Restaurant) => void;
  onAskCompare: (restaurants: Restaurant[]) => void;
}

export function CompareModal({
  restaurants,
  open,
  language,
  onClose,
  onRemove,
  onSelectDetails,
  onAskCompare,
}: CompareModalProps) {
  if (!open || restaurants.length < 2) return null;

  const lowestMin = Math.min(
    ...restaurants.map((r) => r.min_price ?? Number.POSITIVE_INFINITY),
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-5xl">
        <div className="shrink-0 border-b border-[var(--border-soft)] bg-[var(--bg-card)] px-6 py-4 pr-14">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 text-[var(--accent-coral)]" />
            <DialogTitle className="text-xl sm:text-2xl">
              {language === "es"
                ? `Comparador de restaurantes (${restaurants.length})`
                : `Restaurant comparison (${restaurants.length})`}
            </DialogTitle>
          </div>
          <DialogDescription className="mt-0.5 text-[13px]">
            {language === "es"
              ? "Comparativa lado a lado basada exclusivamente en los documentos PDF de tu guía."
              : "Side-by-side comparison grounded strictly in your PDF guides."}
          </DialogDescription>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div
            className={cn(
              "grid gap-4",
              restaurants.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3",
            )}
          >
            {restaurants.map((r) => {
              const visual = getRestaurantVisual(r.id, r.category, r.photos);
              const priceRange = formatPriceRange(r.min_price, r.max_price);
              const isCheapestOption = r.min_price !== null && r.min_price === lowestMin;
              const cheapestDish = [...r.dishes]
                .filter((d) => d.price_value !== null)
                .sort((a, b) => (a.price_value ?? 999) - (b.price_value ?? 999))[0];

              return (
                <div
                  key={r.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-soft)]"
                >
                  <div
                    className={cn(
                      "relative h-36 w-full overflow-hidden bg-gradient-to-br",
                      visual.gradient,
                    )}
                  >
                    {visual.image ? (
                      <img
                        src={visual.image}
                        alt={r.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-white/90 font-editorial text-lg font-bold">
                        {r.name}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemove(r.id)}
                      aria-label="Remove"
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                    {isCheapestOption ? (
                      <span className="absolute left-2 top-2 rounded-full bg-[var(--accent-sage)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--accent-sage-fg)] shadow-xs">
                        {language === "es" ? "Entrada más económica" : "Lowest entry price"}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-1 flex-col gap-3 p-4">
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onSelectDetails(r);
                        }}
                        className="font-editorial text-left text-lg font-bold text-[var(--fg)] hover:text-[var(--accent-coral)] cursor-pointer"
                      >
                        {r.name}
                      </button>
                      <p className="text-xs font-semibold text-[var(--accent-coral)]">
                        {r.category}
                      </p>
                    </div>

                    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--fg-muted)]">
                        {language === "es" ? "Ubicación" : "Location"}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[13px] font-medium text-[var(--fg)]">
                        <MapPin className="h-3.5 w-3.5 text-[var(--accent-sage)]" />
                        {r.neighborhood}, {r.location}
                      </p>
                    </div>

                    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--fg-muted)]">
                        {language === "es" ? "Precio (según carta PDF)" : "Price (PDF menu)"}
                      </p>
                      <p className="mt-0.5 text-[13px] font-bold text-[var(--accent-coral)]">
                        {r.price_tier}
                        {priceRange ? ` · ${priceRange}` : ""}
                      </p>
                      {cheapestDish ? (
                        <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
                          {language === "es" ? "Desde" : "From"}: {cheapestDish.name} ({cheapestDish.price})
                        </p>
                      ) : null}
                    </div>

                    <div className="rounded-xl border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2">
                      <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-[var(--fg-muted)]">
                        <Sparkles className="h-3 w-3 text-[var(--accent-coral)]" />
                        {language === "es" ? "Tipo de cocina" : "Cuisine style"}
                      </p>
                      <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-[var(--fg-muted)]">
                        {r.cuisine_proposal || r.summary}
                      </p>
                    </div>

                    <div className="flex-1 rounded-xl border border-[var(--border-soft)] bg-[var(--bg-card)] px-3 py-2.5">
                      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-[var(--fg-muted)]">
                        <Utensils className="h-3 w-3 text-[var(--accent-sage)]" />
                        {language === "es"
                          ? `Platos destacados (${r.dish_count})`
                          : `Featured dishes (${r.dish_count})`}
                      </p>
                      <ul className="space-y-1.5">
                        {r.dishes.slice(0, 4).map((d) => (
                          <li
                            key={d.name}
                            className="flex items-baseline justify-between gap-2 text-xs"
                          >
                            <span className="truncate font-medium text-[var(--fg)]">
                              {d.name}
                            </span>
                            <span className="shrink-0 font-bold text-[var(--accent-sage-text)]">
                              {d.price}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <Badge variant="olive" className="w-fit text-[11px]">
                      <FileText className="h-3 w-3" />
                      {r.source}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[var(--border-soft)] bg-[var(--bg-soft)] px-6 py-3.5">
          <Button variant="outline" onClick={onClose}>
            {language === "es" ? "Cerrar comparador" : "Close comparator"}
          </Button>
          <Button
            variant="terracotta"
            onClick={() => {
              onAskCompare(restaurants);
              onClose();
            }}
          >
            <MessageSquareText className="h-4 w-4" />
            {language === "es"
              ? "Pedir al asistente que los compare"
              : "Ask the assistant to compare them"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
