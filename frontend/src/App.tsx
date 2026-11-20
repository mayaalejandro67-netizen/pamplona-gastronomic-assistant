import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, RefreshCw, RotateCcw, Scale, X } from "lucide-react";
import { ChatPanel } from "@/components/ChatPanel";
import { CompareModal } from "@/components/CompareModal";
import { FiltersSidebar } from "@/components/FiltersSidebar";
import { MapPanel } from "@/components/MapPanel";
import { Navbar } from "@/components/Navbar";
import { RestaurantCard } from "@/components/RestaurantCard";
import { RestaurantModal } from "@/components/RestaurantModal";
import { Button } from "@/components/ui/button";
import { fetchClientConfig, fetchRestaurants, rebuildIndex, streamChatMessage } from "@/lib/api";
import { getCopy } from "@/lib/i18n";
import type { ChatMessage, FilterState, Language, NavTab, Restaurant } from "@/types";

const INITIAL_FILTERS: FilterState = {
  categories: [],
  priceTier: null,
  location: "all",
  onlyChatResults: false,
  searchQuery: "",
};

const FAVORITES_KEY = "pamplona_gastronomic_favorites_v1";
const THEME_KEY = "pamplona_gastronomic_theme_v1";

function loadInitialTheme(): "light" | "dark" {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // ignore storage errors
  }
  return "light";
}

function loadFavorites(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

export default function App() {
  const [language, setLanguage] = useState<Language>("es");
  const [theme, setTheme] = useState<"light" | "dark">(loadInitialTheme);
  const [activeTab, setActiveTab] = useState<NavTab>("home");

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(loadFavorites);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const [selectedRestaurant, setSelectedRestaurant] = useState<Restaurant | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string; seq: number } | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [latestCitedIds, setLatestCitedIds] = useState<string[]>([]);
  const [rebuilding, setRebuilding] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const filtersRef = useRef<FilterState>(filters);
  filtersRef.current = filters;

  const t = getCopy(language);

  const loadData = useCallback(async () => {
    try {
      setLoadError(null);
      const [data, cfg] = await Promise.all([fetchRestaurants(), fetchClientConfig()]);
      setRestaurants(data.restaurants);
      setLocations(data.locations);
      setCategories(data.categories);
      setGoogleMapsApiKey(cfg.google_maps_api_key);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Could not reach the FastAPI backend.",
      );
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favoriteIds]));
    } catch {
      // ignore storage errors
    }
  }, [favoriteIds]);

  const restaurantsById = useMemo(
    () => new Map(restaurants.map((r) => [r.id, r])),
    [restaurants],
  );

  const toggleFavorite = useCallback((id: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }, []);

  // Single source of truth: filters.onlyChatResults controls BOTH the left toggle AND the map!
  const isMapSyncedToChat = filters.onlyChatResults && latestCitedIds.length > 0;

  const filteredRestaurants = useMemo(() => {
    return restaurants
      .filter((r) => {
        if (filters.onlyChatResults && latestCitedIds.length > 0) {
          if (!latestCitedIds.includes(r.id)) return false;
        }
        if (filters.categories.length > 0 && !filters.categories.includes(r.category)) {
          return false;
        }
        if (filters.priceTier && r.price_tier !== filters.priceTier) {
          return false;
        }
        if (filters.location !== "all" && r.location !== filters.location) {
          return false;
        }
        if (filters.searchQuery.trim()) {
          const q = filters.searchQuery.trim().toLowerCase();
          const inMeta =
            r.name.toLowerCase().includes(q) ||
            r.location.toLowerCase().includes(q) ||
            r.neighborhood.toLowerCase().includes(q) ||
            r.description.toLowerCase().includes(q);
          const inDishes = r.dishes.some(
            (d) =>
              d.name.toLowerCase().includes(q) ||
              d.description.toLowerCase().includes(q),
          );
          if (!inMeta && !inDishes) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (filters.onlyChatResults && latestCitedIds.length > 0) {
          const ia = latestCitedIds.indexOf(a.id);
          const ib = latestCitedIds.indexOf(b.id);
          if (ia !== -1 && ib !== -1) return ia - ib;
        }
        return a.name.localeCompare(b.name);
      });
  }, [restaurants, filters, latestCitedIds]);

  const handleSendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setActiveTab("home");
    const historySnapshot = messagesRef.current;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      sources: [],
      mentionedRestaurants: [],
      createdAt: Date.now(),
    };

    const assistantId = `a-${Date.now() + 1}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      sources: [],
      mentionedRestaurants: [],
      createdAt: Date.now() + 1,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamChatMessage(
        trimmed,
        historySnapshot,
        {
          onToken: (token) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + token } : m,
              ),
            );
          },
          onDone: (payload) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: payload.answer,
                      sources: payload.sources,
                      mentionedRestaurants: payload.mentioned_restaurants,
                      isFallback: payload.is_fallback,
                    }
                  : m,
              ),
            );
            if (payload.mentioned_restaurants.length > 0) {
              setLatestCitedIds(payload.mentioned_restaurants);
              // Automatically turn ON the left filter switch so sidebar & map stay 100% consistent!
              const f = filtersRef.current;
              const hasManual =
                f.categories.length > 0 ||
                f.priceTier !== null ||
                f.location !== "all" ||
                f.searchQuery.trim().length > 0;
              if (!hasManual) {
                setFilters((prev) => ({ ...prev, onlyChatResults: true }));
              }
            }
          },
          onError: (errMsg) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: errMsg,
                      isError: true,
                      sources: [],
                      mentionedRestaurants: [],
                    }
                  : m,
              ),
            );
          },
        },
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        const msg =
          err instanceof Error
            ? err.message
            : "Could not reach the backend server.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: msg,
                  isError: true,
                  sources: [],
                  mentionedRestaurants: [],
                }
              : m,
          ),
        );
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  }, []);

  const handleCancel = useCallback(async () => {
    abortRef.current?.abort();
    setIsRunning(false);
  }, []);

  const handleResetChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setLatestCitedIds([]);
    setIsRunning(false);
    setFilters((prev) => ({ ...prev, onlyChatResults: false }));
  };

  const handleRebuildIndex = async () => {
    setRebuilding(true);
    try {
      await rebuildIndex();
      await loadData();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Rebuild failed");
    } finally {
      setRebuilding(false);
    }
  };

  const handleAskAboutRestaurant = (restaurant: Restaurant) => {
    const prompt =
      language === "es"
        ? `¿Qué platos típicos y precios ofrece ${restaurant.name}?`
        : `What dishes and prices does ${restaurant.name} offer?`;
    void handleSendMessage(prompt);
  };

  const handleAskCompare = (items: Restaurant[]) => {
    const names = items.map((r) => r.name).join(", ");
    const prompt =
      language === "es"
        ? `Compara ${names} en tipo de cocina, platos destacados y precios según las guías.`
        : `Compare ${names} in cuisine style, signature dishes, and prices based on the guides.`;
    void handleSendMessage(prompt);
  };

  const handleLocateRestaurant = useCallback((restaurant: Restaurant) => {
    setActiveTab("home");
    setHighlightedId(restaurant.id);
    setFocusRequest((prev) => ({ id: restaurant.id, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  const favoriteRestaurants = useMemo(
    () => restaurants.filter((r) => favoriteIds.has(r.id)),
    [restaurants, favoriteIds],
  );

  const comparedRestaurants = useMemo(
    () =>
      compareIds
        .map((id) => restaurantsById.get(id))
        .filter((r): r is Restaurant => Boolean(r)),
    [compareIds, restaurantsById],
  );

  return (
    <div className="min-h-screen bg-[var(--bg-page)] pb-16 text-[var(--fg)] transition-colors lg:pb-0">
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        language={language}
        onLanguageChange={setLanguage}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
        favoritesCount={favoriteIds.size}
      />

      {loadError ? (
        <div className="mx-auto mt-4 max-w-[1480px] px-5">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-700" />
              <span>
                {language === "es"
                  ? `No se pudo conectar con el backend FastAPI (${loadError}). Asegúrate de tener uvicorn corriendo en el puerto 8000.`
                  : `Could not connect to FastAPI backend (${loadError}). Make sure uvicorn is running on port 8000.`}
              </span>
            </div>
            <Button size="sm" variant="outline" onClick={() => void loadData()}>
              Reintentar
            </Button>
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-[1480px] px-4 py-4 sm:px-5">
        {activeTab === "home" ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[270px_minmax(0,1fr)_390px] xl:grid-cols-[285px_minmax(0,1fr)_420px]">
            <FiltersSidebar
              language={language}
              categories={categories}
              locations={locations}
              totalRestaurants={restaurants.length}
              visibleCount={filteredRestaurants.length}
              applied={filters}
              onApply={setFilters}
              onClear={() => setFilters(INITIAL_FILTERS)}
              hasChatCitations={latestCitedIds.length > 0}
            />

            <ChatPanel
              messages={messages}
              isRunning={isRunning}
              language={language}
              restaurantsById={restaurantsById}
              favoriteIds={favoriteIds}
              compareIds={compareIds}
              highlightedRestaurantId={highlightedId}
              onSendMessage={handleSendMessage}
              onCancel={handleCancel}
              onToggleFavorite={toggleFavorite}
              onToggleCompare={toggleCompare}
              onSelectRestaurant={setSelectedRestaurant}
              onLocateRestaurant={handleLocateRestaurant}
              onHoverRestaurant={setHighlightedId}
            />

            <MapPanel
              restaurants={filteredRestaurants}
              language={language}
              theme={theme}
              googleMapsApiKey={googleMapsApiKey}
              highlightedId={highlightedId}
              focusRequest={focusRequest}
              isShowingChatOnly={isMapSyncedToChat}
              onShowAll={() =>
                setFilters((prev) => ({ ...prev, onlyChatResults: false }))
              }
              onSelectRestaurant={setSelectedRestaurant}
              onHoverRestaurant={setHighlightedId}
            />
          </div>
        ) : null}

        {activeTab === "guides" ? (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <FiltersSidebar
              language={language}
              categories={categories}
              locations={locations}
              totalRestaurants={restaurants.length}
              visibleCount={filteredRestaurants.length}
              applied={filters}
              onApply={setFilters}
              onClear={() => setFilters(INITIAL_FILTERS)}
              hasChatCitations={latestCitedIds.length > 0}
            />
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-5 shadow-xs">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-soft)] pb-3">
                <div>
                  <h2 className="font-editorial text-2xl font-bold">
                    {t.views.guidesTitle}
                  </h2>
                  <p className="text-[13px] text-[var(--fg-muted)]">{t.views.guidesSubtitle}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rebuilding}
                  onClick={() => void handleRebuildIndex()}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${rebuilding ? "animate-spin" : ""}`} />
                  {rebuilding ? t.views.rebuilding : t.views.rebuildIndex}
                </Button>
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {filteredRestaurants.map((r, i) => (
                  <RestaurantCard
                    key={r.id}
                    restaurant={r}
                    language={language}
                    indexBadge={i + 1}
                    isFavorite={favoriteIds.has(r.id)}
                    isCompared={compareIds.includes(r.id)}
                    compareDisabled={compareIds.length >= 3}
                    onToggleFavorite={toggleFavorite}
                    onToggleCompare={toggleCompare}
                    onSelect={setSelectedRestaurant}
                    onLocate={handleLocateRestaurant}
                  />
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {activeTab === "favorites" ? (
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xs">
            <h2 className="font-editorial mb-4 text-2xl font-bold">
              {t.views.favoritesTitle}
            </h2>
            {favoriteRestaurants.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-soft)] p-8 text-center text-sm text-[var(--fg-muted)]">
                {t.views.favoritesEmpty}
              </p>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {favoriteRestaurants.map((r) => (
                  <RestaurantCard
                    key={r.id}
                    restaurant={r}
                    language={language}
                    isFavorite={true}
                    isCompared={compareIds.includes(r.id)}
                    compareDisabled={compareIds.length >= 3}
                    onToggleFavorite={toggleFavorite}
                    onToggleCompare={toggleCompare}
                    onSelect={setSelectedRestaurant}
                    onLocate={handleLocateRestaurant}
                  />
                ))}
              </div>
            )}
          </section>
        ) : null}

        {activeTab === "history" ? (
          <section className="mx-auto max-w-3xl rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-6 shadow-xs">
            <div className="mb-4 flex items-center justify-between border-b border-[var(--border-soft)] pb-3">
              <h2 className="font-editorial text-2xl font-bold">
                {t.views.historyTitle}
              </h2>
              <Button variant="outline" size="sm" onClick={handleResetChat}>
                <RotateCcw className="h-3.5 w-3.5" />
                {t.views.newChat}
              </Button>
            </div>
            {messages.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-soft)] p-8 text-center text-sm text-[var(--fg-muted)]">
                {t.views.historyEmpty}
              </p>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-xl border border-[var(--border-soft)] p-3.5 text-sm ${
                      m.role === "user"
                        ? "bg-[var(--bg-user-bubble)]"
                        : "bg-[var(--bg-bot-bubble)]"
                    }`}
                  >
                    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-[var(--fg-muted)]">
                      {m.role === "user"
                        ? language === "es"
                          ? "Tú"
                          : "You"
                        : "Pamplona Bites"}
                    </p>
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--fg)]">
                      {m.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </main>

      {/* Floating Smart Comparator Bar */}
      {comparedRestaurants.length > 0 ? (
        <div className="fixed bottom-4 left-1/2 z-50 flex w-[94vw] max-w-2xl -translate-x-1/2 flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--bg-bar)] px-4 py-3 text-[var(--fg-bar)] shadow-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold text-[#E89271]">
              <Scale className="h-4 w-4 text-[#E89271]" />
              {language === "es"
                ? `Comparador (${comparedRestaurants.length}/3)`
                : `Compare (${comparedRestaurants.length}/3)`}
            </span>
            {comparedRestaurants.map((r) => (
              <span
                key={r.id}
                className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white"
              >
                {r.name}
                <button
                  type="button"
                  onClick={() => toggleCompare(r.id)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-white/20 cursor-pointer"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCompareIds([])}
              className="text-xs font-medium text-white/75 hover:text-white cursor-pointer"
            >
              {language === "es" ? "Limpiar" : "Clear"}
            </button>
            <Button
              variant="terracotta"
              size="sm"
              disabled={comparedRestaurants.length < 2}
              onClick={() => setCompareOpen(true)}
            >
              <Scale className="h-3.5 w-3.5" />
              {language === "es"
                ? comparedRestaurants.length < 2
                  ? "Elige 1 más"
                  : "Comparar ahora"
                : comparedRestaurants.length < 2
                  ? "Pick 1 more"
                  : "Compare now"}
            </Button>
          </div>
        </div>
      ) : null}

      <RestaurantModal
        restaurant={selectedRestaurant}
        language={language}
        isFavorite={selectedRestaurant ? favoriteIds.has(selectedRestaurant.id) : false}
        onClose={() => setSelectedRestaurant(null)}
        onToggleFavorite={toggleFavorite}
        onAskAbout={handleAskAboutRestaurant}
        onLocateOnMap={handleLocateRestaurant}
      />

      <CompareModal
        restaurants={comparedRestaurants}
        open={compareOpen}
        language={language}
        onClose={() => setCompareOpen(false)}
        onRemove={toggleCompare}
        onSelectDetails={setSelectedRestaurant}
        onAskCompare={handleAskCompare}
      />
    </div>
  );
}
