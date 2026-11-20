import type { Language } from "@/types";

export const COPY = {
  es: {
    brandSubtitle: "Tu guía culinaria inteligente en Pamplona",
    nav: {
      home: "Inicio",
      guides: "Guías",
      favorites: "Favoritos",
      history: "Historial",
    },
    filters: {
      title: "Filtros",
      cuisine: "Cocina",
      price: "Precio",
      priceHint: "(plato medio)",
      onlyChat: "Solo citados en el chat",
      zone: "Zona",
      anyZone: "Cualquier zona de Navarra",
      apply: "Aplicar filtros",
      clear: "Limpiar todo",
      searchPlaceholder: "Buscar local o plato...",
    },
    chat: {
      heading: "¿Qué te apetece comer en Pamplona?",
      subheading:
        "Pregúntame por restaurantes, pintxos, hamburguesas, precios o platos de los 20 documentos de nuestra guía.",
      placeholder: "Pregúntame por restaurantes, cocina, platos, precios...",
      thinking: "Consultando las guías gastronómicas...",
      basedOn: "Basado en",
      viewDetails: "Ver detalles",
      guideBadge: "Guía PDF",
      dishesCount: (n: number) => `${n} platos`,
      suggestions: [
        "¿Dónde puedo comer hamburguesas en Pamplona?",
        "¿Qué platos tiene el Café Iruña?",
        "¿Qué restaurantes hay en Lekunberri?",
        "Opciones de pintxos y cocina en miniatura",
      ],
    },
    map: {
      tabMap: "Mapa",
      tabList: "Lista",
      resultsHeading: (n: number) => `Resultados en el mapa (${n})`,
      chatSyncBanner: "Mostrando locales citados por el asistente",
      showAll: "Ver todos",
      empty: "No hay restaurantes que coincidan con los filtros.",
    },
    modal: {
      menuTitle: "Platos típicos e ingredientes (PDF)",
      askButton: "Preguntar al asistente sobre este local",
      sourceLabel: "Documento fuente",
      close: "Cerrar",
    },
    views: {
      guidesTitle: "Guía completa de restaurantes",
      guidesSubtitle: "Los 20 establecimientos extraídos directamente de los PDFs.",
      favoritesTitle: "Tus restaurantes favoritos",
      favoritesEmpty: "Aún no has guardado favoritos. Pulsa el corazón en cualquier tarjeta para añadirlo aquí.",
      historyTitle: "Historial de conversación",
      historyEmpty: "Todavía no hay mensajes en esta sesión.",
      newChat: "Nueva conversación",
      rebuildIndex: "Reconstruir índice",
      rebuilding: "Reindexando...",
    },
  },
  en: {
    brandSubtitle: "Your smart culinary guide to Pamplona",
    nav: {
      home: "Home",
      guides: "Guides",
      favorites: "Favorites",
      history: "History",
    },
    filters: {
      title: "Filters",
      cuisine: "Cuisine",
      price: "Price",
      priceHint: "(average dish)",
      onlyChat: "Chat citations only",
      zone: "Area",
      anyZone: "Any area in Navarra",
      apply: "Apply filters",
      clear: "Clear all",
      searchPlaceholder: "Search venue or dish...",
    },
    chat: {
      heading: "What are you craving in Pamplona?",
      subheading:
        "Ask about restaurants, pintxos, burgers, prices, or dishes strictly from our 20 local PDF guides.",
      placeholder: "Ask about restaurants, cuisine, dishes, prices...",
      thinking: "Searching the gastronomic guides...",
      basedOn: "Based on",
      viewDetails: "View details",
      guideBadge: "PDF Guide",
      dishesCount: (n: number) => `${n} dishes`,
      suggestions: [
        "What burgers does Babylon have?",
        "What dishes does Café Iruña serve?",
        "Which restaurants are in Lekunberri?",
        "List all restaurants in your guide",
      ],
    },
    map: {
      tabMap: "Map",
      tabList: "List",
      resultsHeading: (n: number) => `Results on map (${n})`,
      chatSyncBanner: "Showing venues cited by the assistant",
      showAll: "Show all",
      empty: "No restaurants match the current filters.",
    },
    modal: {
      menuTitle: "Signature dishes & ingredients (PDF)",
      askButton: "Ask the assistant about this venue",
      sourceLabel: "Source document",
      close: "Close",
    },
    views: {
      guidesTitle: "Complete restaurant directory",
      guidesSubtitle: "All 20 venues extracted strictly from the provided PDF documents.",
      favoritesTitle: "Your saved favorites",
      favoritesEmpty: "No favorites yet. Click the heart on any card to save it here.",
      historyTitle: "Conversation history",
      historyEmpty: "No messages yet in this session.",
      newChat: "New conversation",
      rebuildIndex: "Rebuild index",
      rebuilding: "Rebuilding...",
    },
  },
} as const;

export function getCopy(lang: Language) {
  return COPY[lang];
}
