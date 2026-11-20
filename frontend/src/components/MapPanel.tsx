import { useEffect, useMemo, useState } from "react";
import {
  APIProvider,
  Map as GoogleMap,
  Marker as GoogleMarker,
  useMap as useGoogleMap,
} from "@vis.gl/react-google-maps";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { ArrowRight, List, Map as MapIcon, MapPin, Sparkles, Utensils } from "lucide-react";
import { getCopy } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { formatPriceRange, getRestaurantVisual } from "@/lib/visuals";
import type { Language, Restaurant } from "@/types";

interface FocusRequest {
  id: string;
  seq: number;
}

interface MapPanelProps {
  restaurants: Restaurant[];
  language: Language;
  theme: "light" | "dark";
  googleMapsApiKey: string | null;
  highlightedId: string | null;
  focusRequest: FocusRequest | null;
  isShowingChatOnly: boolean;
  onShowAll: () => void;
  onSelectRestaurant: (restaurant: Restaurant) => void;
  onHoverRestaurant: (id: string | null) => void;
}

const PAMPLONA_CENTER = { lat: 42.8168, lng: -1.6426 };
const PAMPLONA_TUPLE: [number, number] = [42.8168, -1.6426];

const LIGHT_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.medical", stylers: [{ visibility: "off" }] },
  { featureType: "poi.government", stylers: [{ visibility: "off" }] },
  { featureType: "poi.school", stylers: [{ visibility: "off" }] },
  { featureType: "transit.station", stylers: [{ visibility: "off" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#F4EFE6" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#DFE8CF" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#55633A" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#FFFFFF" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#F9F4EB" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#EBD9B7" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#CFE2EB" }] },
  { featureType: "administrative", elementType: "labels.text.fill", stylers: [{ color: "#4E4237" }] },
];

/* Slate & Sage Dark Google Maps cartography */
const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1C2328" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#14191D" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9BAAB5" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.medical", stylers: [{ visibility: "off" }] },
  { featureType: "poi.government", stylers: [{ visibility: "off" }] },
  { featureType: "poi.school", stylers: [{ visibility: "off" }] },
  { featureType: "transit.station", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#212E27" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#9CB38D" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2B363F" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1B2228" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3B4A54" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#121A20" }] },
  { featureType: "administrative", elementType: "labels.text.fill", stylers: [{ color: "#CBD4DA" }] },
];

function createLeafletIcon(index: number, isActive: boolean, isPrimary: boolean) {
  return L.divIcon({
    className: "pamplona-pin",
    html: `<div class="pamplona-pin-badge ${isPrimary ? "is-primary" : "is-secondary"} ${
      isActive ? "is-active" : ""
    }">${index}</div>`,
    iconSize: [30, 36],
    iconAnchor: [15, 36],
    popupAnchor: [0, -34],
  });
}

function LeafletViewportSync({
  restaurants,
  highlightedId,
  focusRequest,
}: {
  restaurants: Restaurant[];
  highlightedId: string | null;
  focusRequest: FocusRequest | null;
}) {
  const map = useMap();

  const geoPoints = useMemo(
    () =>
      restaurants
        .filter((r): r is Restaurant & { lat: number; lng: number } => r.lat !== null && r.lng !== null)
        .map((r) => [r.lat, r.lng] as [number, number]),
    [restaurants],
  );

  useEffect(() => {
    if (geoPoints.length === 0) {
      map.setView(PAMPLONA_TUPLE, 13);
      return;
    }
    if (geoPoints.length === 1) {
      map.flyTo(geoPoints[0], 15, { duration: 0.6 });
      return;
    }
    const bounds = L.latLngBounds(geoPoints);
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
  }, [map, geoPoints]);

  useEffect(() => {
    if (!focusRequest) return;
    const target = restaurants.find((r) => r.id === focusRequest.id);
    if (target && target.lat !== null && target.lng !== null) {
      map.flyTo([target.lat, target.lng], 16, { duration: 0.6 });
    }
  }, [map, focusRequest, restaurants]);

  useEffect(() => {
    if (!highlightedId) return;
    const target = restaurants.find((r) => r.id === highlightedId);
    if (target && target.lat !== null && target.lng !== null) {
      map.panTo([target.lat, target.lng], { animate: true, duration: 0.35 });
    }
  }, [map, highlightedId, restaurants]);

  return null;
}

function GoogleViewportSync({
  restaurants,
  highlightedId,
  focusRequest,
  theme,
}: {
  restaurants: Restaurant[];
  highlightedId: string | null;
  focusRequest: FocusRequest | null;
  theme: "light" | "dark";
}) {
  const map = useGoogleMap();

  useEffect(() => {
    if (!map) return;
    map.setOptions({ styles: theme === "dark" ? DARK_MAP_STYLES : LIGHT_MAP_STYLES });
  }, [map, theme]);

  useEffect(() => {
    if (!map) return;
    const pts = restaurants.filter(
      (r): r is Restaurant & { lat: number; lng: number } => r.lat !== null && r.lng !== null,
    );
    if (pts.length === 0) {
      map.setCenter(PAMPLONA_CENTER);
      map.setZoom(13);
      return;
    }
    if (pts.length === 1) {
      map.panTo({ lat: pts[0].lat, lng: pts[0].lng });
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const p of pts) bounds.extend({ lat: p.lat, lng: p.lng });
    map.fitBounds(bounds, 40);
  }, [map, restaurants]);

  useEffect(() => {
    if (!map || !focusRequest) return;
    const target = restaurants.find((r) => r.id === focusRequest.id);
    if (target && target.lat !== null && target.lng !== null) {
      map.panTo({ lat: target.lat, lng: target.lng });
      map.setZoom(16);
    }
  }, [map, focusRequest, restaurants]);

  useEffect(() => {
    if (!map || !highlightedId) return;
    const target = restaurants.find((r) => r.id === highlightedId);
    if (target && target.lat !== null && target.lng !== null) {
      map.panTo({ lat: target.lat, lng: target.lng });
    }
  }, [map, highlightedId, restaurants]);

  return null;
}

function createGooglePinSvg(
  index: number,
  isPrimary: boolean,
  isActive: boolean,
  theme: "light" | "dark",
): string {
  const bg =
    theme === "dark"
      ? isPrimary
        ? "#E89271"
        : "#B5C7A3"
      : isPrimary
        ? "#C2531E"
        : "#637141";
  const fg = theme === "dark" ? "#14191D" : "#FFFFFF";
  const stroke = theme === "dark" ? "#14191D" : "#FFFFFF";
  const r = isActive ? 16 : 14;
  const size = 38;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size + 6}" viewBox="0 0 ${size} ${size + 6}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="${bg}" stroke="${stroke}" stroke-width="2.5"/>
    <polygon points="${size / 2 - 5},${size - 5} ${size / 2 + 5},${size - 5} ${size / 2},${size + 4}" fill="${bg}"/>
    <text x="${size / 2}" y="${size / 2 + 4.5}" text-anchor="middle" fill="${fg}" font-family="sans-serif" font-size="12" font-weight="700">${index}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

export function MapPanel({
  restaurants,
  language,
  theme,
  googleMapsApiKey,
  highlightedId,
  focusRequest,
  isShowingChatOnly,
  onShowAll,
  onSelectRestaurant,
  onHoverRestaurant,
}: MapPanelProps) {
  const t = getCopy(language);
  const [view, setView] = useState<"map" | "list">("map");

  useEffect(() => {
    if (focusRequest) {
      setView("map");
    }
  }, [focusRequest]);

  const mappedRestaurants = useMemo(
    () => restaurants.filter((r) => r.lat !== null && r.lng !== null),
    [restaurants],
  );

  return (
    <aside className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] p-4 shadow-xs transition-colors lg:h-[calc(100vh-92px)]">
      {/* Segmented Mapa / Lista toggle */}
      <div className="mb-3 grid grid-cols-2 rounded-xl border border-[var(--border)] bg-[var(--bg-subtle)] p-1">
        <button
          type="button"
          onClick={() => setView("map")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold transition-colors cursor-pointer",
            view === "map"
              ? "bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] shadow-xs"
              : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
          )}
        >
          <MapIcon className="h-4 w-4" />
          {t.map.tabMap}
        </button>
        <button
          type="button"
          onClick={() => setView("list")}
          className={cn(
            "flex items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold transition-colors cursor-pointer",
            view === "list"
              ? "bg-[var(--accent-sage)] text-[var(--accent-sage-fg)] shadow-xs"
              : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
          )}
        >
          <List className="h-4 w-4" />
          {t.map.tabList}
        </button>
      </div>

      {/* Chat-sync banner */}
      {isShowingChatOnly ? (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-[var(--accent-sage-border)] bg-[var(--accent-sage-soft)] px-3 py-2 text-xs text-[var(--accent-sage-text)]">
          <span className="flex items-center gap-1.5 font-semibold">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            {t.map.chatSyncBanner}
          </span>
          <button
            type="button"
            onClick={onShowAll}
            className="shrink-0 font-bold text-[var(--accent-coral)] hover:underline cursor-pointer"
          >
            {t.map.showAll}
          </button>
        </div>
      ) : null}

      {/* Expanded Map */}
      {view === "map" ? (
        <div className="relative mb-3.5 h-80 shrink-0 overflow-hidden rounded-xl border border-[var(--border)] lg:h-[52%] lg:min-h-[310px]">
          {googleMapsApiKey ? (
            <APIProvider apiKey={googleMapsApiKey}>
              <GoogleMap
                defaultCenter={PAMPLONA_CENTER}
                defaultZoom={13}
                gestureHandling="greedy"
                disableDefaultUI={false}
                mapTypeControl={false}
                streetViewControl={false}
                styles={theme === "dark" ? DARK_MAP_STYLES : LIGHT_MAP_STYLES}
                className="h-full w-full"
              >
                <GoogleViewportSync
                  restaurants={mappedRestaurants}
                  highlightedId={highlightedId}
                  focusRequest={focusRequest}
                  theme={theme}
                />
                {mappedRestaurants.map((restaurant, idx) => {
                  const isActive = highlightedId === restaurant.id;
                  const isPrimary = idx === 0 || isActive;
                  return (
                    <GoogleMarker
                      key={restaurant.id}
                      position={{ lat: restaurant.lat as number, lng: restaurant.lng as number }}
                      title={`${idx + 1}. ${restaurant.name}`}
                      icon={createGooglePinSvg(idx + 1, isPrimary, isActive, theme)}
                      onClick={() => onSelectRestaurant(restaurant)}
                      onMouseOver={() => onHoverRestaurant(restaurant.id)}
                      onMouseOut={() => onHoverRestaurant(null)}
                    />
                  );
                })}
              </GoogleMap>
            </APIProvider>
          ) : (
            <MapContainer
              center={PAMPLONA_TUPLE}
              zoom={13}
              scrollWheelZoom={true}
              className="h-full w-full z-0"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <LeafletViewportSync
                restaurants={mappedRestaurants}
                highlightedId={highlightedId}
                focusRequest={focusRequest}
              />
              {mappedRestaurants.map((restaurant, idx) => {
                const isActive = highlightedId === restaurant.id;
                const isPrimary = idx === 0 || isActive;
                return (
                  <Marker
                    key={restaurant.id}
                    position={[restaurant.lat as number, restaurant.lng as number]}
                    icon={createLeafletIcon(idx + 1, isActive, isPrimary)}
                    eventHandlers={{
                      click: () => onSelectRestaurant(restaurant),
                      mouseover: () => onHoverRestaurant(restaurant.id),
                      mouseout: () => onHoverRestaurant(null),
                    }}
                  >
                    <Popup>
                      <div className="min-w-[160px] text-xs">
                        <p className="font-editorial font-bold text-[#2A221B]">
                          {restaurant.name}
                        </p>
                        <p className="text-[#C2531E] font-medium">
                          {restaurant.category}
                        </p>
                        <p className="mt-0.5 text-[#574A3E]">
                          {restaurant.neighborhood} · {restaurant.price_tier}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          )}
        </div>
      ) : null}

      {/* Results heading */}
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[13px] font-bold text-[var(--fg)]">
          <MapPin className="h-4 w-4 text-[var(--accent-coral)]" />
          <span>{t.map.resultsHeading(restaurants.length)}</span>
        </div>
        <span className="rounded-full bg-[var(--bg-subtle)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--fg-muted)]">
          {googleMapsApiKey ? "Google Maps" : "OpenStreetMap"}
        </span>
      </div>

      {/* Synced scrollable results list */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {restaurants.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-soft)] p-4 text-center text-[13px] text-[var(--fg-muted)]">
            {t.map.empty}
          </p>
        ) : (
          restaurants.map((restaurant, idx) => {
            const visual = getRestaurantVisual(restaurant.id, restaurant.category, restaurant.photos);
            const active = highlightedId === restaurant.id;
            const range = formatPriceRange(restaurant.min_price, restaurant.max_price);

            return (
              <button
                key={restaurant.id}
                type="button"
                onClick={() => onSelectRestaurant(restaurant)}
                onMouseEnter={() => onHoverRestaurant(restaurant.id)}
                onMouseLeave={() => onHoverRestaurant(null)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all cursor-pointer",
                  active
                    ? "border-[var(--accent-coral)] bg-[var(--bg-subtle)] shadow-xs"
                    : "border-[var(--border-soft)] bg-[var(--bg-soft)] hover:border-[var(--border)] hover:bg-[var(--bg-subtle)]",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                    idx === 0 || active
                      ? "bg-[var(--accent-coral)] text-[var(--accent-cta-fg)]"
                      : "bg-[var(--accent-sage)] text-[var(--accent-sage-fg)]",
                  )}
                >
                  {idx + 1}
                </span>

                {visual.image ? (
                  <img
                    src={visual.image}
                    alt={restaurant.name}
                    loading="lazy"
                    className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-[var(--border)]"
                  />
                ) : (
                  <div
                    className={cn(
                      "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-white ring-1 ring-[var(--border)]",
                      visual.gradient,
                    )}
                  >
                    <Utensils className="h-5 w-5 opacity-90" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="font-editorial truncate text-sm font-bold text-[var(--fg)]">
                    {restaurant.name}
                  </p>
                  <p className="truncate text-xs text-[var(--fg-muted)]">
                    {restaurant.neighborhood} ·{" "}
                    <span className="font-semibold text-[var(--accent-coral)]">
                      {restaurant.price_tier}
                      {range ? ` (${range})` : ""}
                    </span>
                  </p>
                </div>

                <ArrowRight className="h-4 w-4 shrink-0 text-[var(--fg-muted)]" />
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
