import { useEffect, useState } from "react";
import {
  BookOpen,
  ChefHat,
  ExternalLink,
  FileText,
  Heart,
  Image as ImageIcon,
  MapPin,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Utensils,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatPriceRange, getRestaurantVisual } from "@/lib/visuals";
import type { Language, Restaurant } from "@/types";

interface RestaurantModalProps {
  restaurant: Restaurant | null;
  language: Language;
  isFavorite: boolean;
  onClose: () => void;
  onToggleFavorite: (id: string) => void;
  onAskAbout: (restaurant: Restaurant) => void;
  onLocateOnMap: (restaurant: Restaurant) => void;
}

type ModalTab = "summary" | "menu" | "sources";

export function RestaurantModal({
  restaurant,
  language,
  isFavorite,
  onClose,
  onToggleFavorite,
  onAskAbout,
  onLocateOnMap,
}: RestaurantModalProps) {
  const t = getCopy(language);
  const [activeTab, setActiveTab] = useState<ModalTab>("summary");
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  useEffect(() => {
    setActiveTab("summary");
    setActivePhotoIdx(0);
  }, [restaurant?.id]);

  if (!restaurant) return null;

  const visual = getRestaurantVisual(restaurant.id, restaurant.category, restaurant.photos);
  const gallery =
    restaurant.photos && restaurant.photos.length > 0 ? restaurant.photos : [];
  const activePhoto = gallery[activePhotoIdx] ?? visual.image;
  const priceRange = formatPriceRange(restaurant.min_price, restaurant.max_price);

  const tabs: { id: ModalTab; label: string }[] = [
    { id: "summary", label: language === "es" ? "Resumen" : "Summary" },
    {
      id: "menu",
      label:
        language === "es"
          ? `Carta (${restaurant.dish_count})`
          : `Menu (${restaurant.dish_count})`,
    },
    { id: "sources", label: language === "es" ? "Fuentes y mapa" : "Sources & map" },
  ];

  return (
    <Dialog open={Boolean(restaurant)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {/* Fixed Hero Photo Header */}
        <div
          className={cn(
            "relative h-52 w-full shrink-0 overflow-hidden bg-gradient-to-br sm:h-56",
            visual.gradient,
          )}
        >
          {activePhoto ? (
            <img
              src={activePhoto}
              alt={restaurant.name}
              className="h-full w-full object-cover object-center"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center text-white">
              <Utensils className="mb-2 h-9 w-9 opacity-80" />
              <span className="font-editorial text-xl font-bold">{restaurant.name}</span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent" />

          {gallery.length > 1 ? (
            <div className="absolute bottom-3 left-4 flex items-center gap-1.5">
              {gallery.map((src, idx) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setActivePhotoIdx(idx)}
                  className={cn(
                    "h-10 w-14 overflow-hidden rounded-md border-2 shadow-sm transition-all cursor-pointer",
                    idx === activePhotoIdx
                      ? "border-white scale-105"
                      : "border-white/40 opacity-80 hover:opacity-100",
                  )}
                >
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* Fixed Title + Badges + Internal Tab Navigation */}
        <div className="shrink-0 border-b border-[var(--border-soft)] bg-[var(--bg-card)] px-6 pt-4 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="truncate">{restaurant.name}</DialogTitle>
              <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm">
                <span className="font-semibold text-[var(--accent-coral)]">
                  {restaurant.category}
                </span>
                <span className="text-[var(--fg-subtle)]">·</span>
                <span className="font-medium text-[var(--fg-muted)]">
                  {restaurant.neighborhood}
                </span>
              </DialogDescription>
            </div>

            <button
              type="button"
              onClick={() => onToggleFavorite(restaurant.id)}
              aria-label="Favorite"
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border transition-colors cursor-pointer",
                isFavorite
                  ? "border-[var(--accent-coral)]/50 bg-[var(--accent-coral)]/15 text-[var(--accent-coral)]"
                  : "border-[var(--border)] bg-[var(--bg-soft)] text-[var(--fg-muted)] hover:border-[var(--accent-coral)] hover:text-[var(--accent-coral)]",
              )}
            >
              <Heart className={cn("h-4 w-4", isFavorite && "fill-current")} />
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--bg-subtle)] px-2.5 py-0.5 text-[12px] font-bold text-[var(--accent-coral)]">
              {restaurant.price_tier}
              {priceRange ? ` · ${priceRange}` : ""}
            </span>
            <Badge variant="cream" className="text-[12px]">
              <MapPin className="h-3.5 w-3.5 text-[var(--accent-sage)]" />
              {restaurant.location}
            </Badge>
            <Badge variant="olive" className="text-[12px]">
              <BookOpen className="h-3.5 w-3.5" />
              {t.chat.guideBadge}
            </Badge>
          </div>

          {/* Segmented internal navigation */}
          <div className="mt-4 grid grid-cols-3 gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "rounded-lg py-2 text-[13px] font-semibold transition-colors cursor-pointer",
                  activeTab === tab.id
                    ? "bg-[var(--bg-card)] text-[var(--fg)] shadow-xs"
                    : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Tab Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {activeTab === "summary" ? (
            <div className="space-y-4">
              <p className="text-sm font-medium leading-relaxed text-[var(--fg)]">
                {restaurant.summary}
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                {restaurant.special ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] p-3.5">
                    <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--accent-coral)]">
                      <Sparkles className="h-3.5 w-3.5" />
                      {language === "es" ? "Qué lo hace especial" : "What makes it special"}
                    </h4>
                    <p className="line-clamp-4 text-[13px] leading-relaxed text-[var(--fg-muted)]">
                      {restaurant.special}
                    </p>
                  </div>
                ) : null}

                {restaurant.cuisine_proposal ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] p-3.5">
                    <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--accent-sage-text)]">
                      <ChefHat className="h-3.5 w-3.5" />
                      {language === "es" ? "Tipo de cocina" : "Cuisine style"}
                    </h4>
                    <p className="line-clamp-4 text-[13px] leading-relaxed text-[var(--fg-muted)]">
                      {restaurant.cuisine_proposal}
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] p-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <h4 className="flex items-center gap-1.5 text-sm font-bold text-[var(--fg)]">
                    <Utensils className="h-4 w-4 text-[var(--accent-coral)]" />
                    {language === "es" ? "Platos destacados" : "Featured dishes"}
                  </h4>
                  <button
                    type="button"
                    onClick={() => setActiveTab("menu")}
                    className="text-xs font-semibold text-[var(--accent-coral)] hover:underline cursor-pointer"
                  >
                    {language === "es"
                      ? `Ver los ${restaurant.dish_count} platos →`
                      : `View all ${restaurant.dish_count} dishes →`}
                  </button>
                </div>
                <div className="space-y-2">
                  {restaurant.dishes.slice(0, 3).map((dish) => (
                    <div
                      key={dish.name}
                      className="flex items-baseline justify-between gap-3 border-b border-[var(--border-soft)] pb-2 last:border-b-0 last:pb-0"
                    >
                      <span className="text-[13px] font-medium text-[var(--fg)]">
                        {dish.name}
                      </span>
                      <span className="shrink-0 text-[13px] font-bold text-[var(--accent-coral)]">
                        {dish.price}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "menu" ? (
            <div className="space-y-2.5">
              {restaurant.dishes.map((dish) => (
                <div
                  key={dish.name}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] px-4 py-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-bold text-[var(--fg)]">
                      {dish.name}
                    </span>
                    <span className="shrink-0 rounded-full bg-[var(--accent-sage-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--accent-sage-text)]">
                      {dish.price}
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-[var(--fg-muted)]">
                    {dish.description}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {activeTab === "sources" ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[var(--accent-sage-border)] bg-[var(--accent-sage-soft)] p-4">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-sage-text)]" />
                  <div className="text-[13px] leading-relaxed text-[var(--accent-sage-text)]">
                    <p className="font-bold">
                      {language === "es"
                        ? "Información gastronómica 100 % basada en PDF"
                        : "100% PDF-grounded culinary data"}
                    </p>
                    <p className="mt-1">
                      {language === "es"
                        ? `Fuente verificada: "${restaurant.source}".`
                        : `Verified source: "${restaurant.source}".`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[var(--fg-muted)]">
                  <FileText className="h-3.5 w-3.5 text-[var(--accent-coral)]" />
                  <span>
                    {language === "es"
                      ? "Texto íntegro del documento PDF"
                      : "Full verbatim PDF excerpt"}
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed text-[var(--fg)]">
                  {restaurant.description}
                </p>
                {restaurant.lat !== null && restaurant.lng !== null ? (
                  <p className="mt-3 border-t border-[var(--border-soft)] pt-2.5 text-xs text-[var(--fg-muted)]">
                    {language === "es" ? "Coordenadas Google Places" : "Google Places coordinates"}:{" "}
                    {restaurant.lat.toFixed(5)}, {restaurant.lng.toFixed(5)} ({restaurant.neighborhood},{" "}
                    {restaurant.location})
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {restaurant.google_maps_url ? (
                  <Button variant="outline" asChild>
                    <a
                      href={restaurant.google_maps_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="h-4 w-4" />
                      {language === "es" ? "Abrir ficha en Google Maps" : "Open in Google Maps"}
                    </a>
                  </Button>
                ) : null}
                {restaurant.photos_url ? (
                  <Button variant="outline" asChild>
                    <a
                      href={restaurant.photos_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ImageIcon className="h-4 w-4" />
                      {language === "es" ? "Ver fotos en Google Maps" : "View Google Maps photos"}
                    </a>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* Fixed Sticky Footer */}
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-[var(--border-soft)] bg-[var(--bg-soft)] px-6 py-3.5">
          <Button
            variant="terracotta"
            className="flex-1"
            onClick={() => {
              onAskAbout(restaurant);
              onClose();
            }}
          >
            <MessageSquareText className="h-4 w-4" />
            {language === "es" ? "Consultar al asistente" : "Ask the assistant"}
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              onLocateOnMap(restaurant);
              onClose();
            }}
          >
            <MapPin className="h-4 w-4 text-[var(--accent-sage)]" />
            {language === "es" ? "Ver en el mapa" : "Locate on map"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
