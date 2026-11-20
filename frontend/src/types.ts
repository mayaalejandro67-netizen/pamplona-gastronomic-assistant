export type Language = "es" | "en";
export type NavTab = "home" | "guides" | "favorites" | "history";
export type PriceTier = "€" | "€€" | "€€€";

export interface Dish {
  name: string;
  price: string;
  price_value: number | null;
  description: string;
}

export interface Restaurant {
  id: string;
  name: string;
  location: string;
  neighborhood: string;
  lat: number | null;
  lng: number | null;
  google_maps_url?: string | null;
  photos_url?: string | null;
  photos?: string[];
  photo_attributions?: string[];
  category: string;
  source: string;
  summary: string;
  special?: string;
  cuisine_proposal?: string;
  description: string;
  dishes: Dish[];
  dish_count: number;
  min_price: number | null;
  max_price: number | null;
  price_tier: PriceTier;
}

export interface RestaurantsPayload {
  restaurants: Restaurant[];
  total: number;
  locations: string[];
  categories: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: string[];
  mentionedRestaurants: string[];
  isFallback?: boolean;
  isError?: boolean;
  createdAt: number;
}

export interface FilterState {
  categories: string[];
  priceTier: PriceTier | null;
  location: string;
  onlyChatResults: boolean;
  searchQuery: string;
}
