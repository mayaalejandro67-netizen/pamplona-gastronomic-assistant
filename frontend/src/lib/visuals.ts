export interface CategoryVisual {
  gradient: string;
  image: string | null;
  tag: string;
}

const CATEGORY_VISUALS: Record<string, { gradient: string; tag: string }> = {
  Hamburguesería: {
    gradient: "from-[#5A2D18] via-[#8F3E19] to-[#C2531E]",
    tag: "Burgers",
  },
  "Pinchos y Gastrobar": {
    gradient: "from-[#3D4B26] via-[#637141] to-[#879460]",
    tag: "Pintxos",
  },
  "Asador / Sidrería": {
    gradient: "from-[#4A2218] via-[#7C3623] to-[#A64F2E]",
    tag: "Brasa",
  },
  "Alta Cocina": {
    gradient: "from-[#2F2A26] via-[#594C41] to-[#7D6A59]",
    tag: "Autor",
  },
  "Cocina Tradicional": {
    gradient: "from-[#5E3A1E] via-[#8B5A2B] to-[#B07A46]",
    tag: "Navarra",
  },
  Asiática: {
    gradient: "from-[#3D1F24] via-[#7A2F38] to-[#A64844]",
    tag: "Asian BBQ",
  },
};

export function getRestaurantVisual(
  _id: string,
  category: string,
  photos?: string[],
): CategoryVisual {
  const base = CATEGORY_VISUALS[category] ?? CATEGORY_VISUALS["Cocina Tradicional"];
  const primaryPhoto = photos && photos.length > 0 ? photos[0] : null;
  return {
    ...base,
    image: primaryPhoto,
  };
}

export function formatPriceRange(min: number | null, max: number | null): string {
  if (min === null || max === null) return "";
  const fmt = (v: number) => v.toFixed(2).replace(".", ",");
  return `${fmt(min)}–${fmt(max)} €`;
}
