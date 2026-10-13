export type CatalogItem = {
  label: string;
  category: "living" | "bedroom" | "dining" | "kitchen" | "bath" | "office" | "decor";
  /** [width, depth, height] in meters */
  size: [number, number, number];
  color: string;
  elevation?: number;
};

export const CATALOG = {
  sofa: { label: "Sofa", category: "living", size: [2.2, 0.95, 0.85], color: "#8b8f98" },
  armchair: { label: "Armchair", category: "living", size: [0.85, 0.85, 0.85], color: "#c9a27e" },
  coffee_table: { label: "Coffee table", category: "living", size: [1.1, 0.6, 0.42], color: "#a07850" },
  tv_stand: { label: "TV stand", category: "living", size: [1.8, 0.42, 0.5], color: "#2f2f33" },
  tv: { label: "TV", category: "living", size: [1.45, 0.08, 0.85], color: "#111114", elevation: 0.55 },
  rug: { label: "Rug", category: "decor", size: [2.4, 1.7, 0.01], color: "#d8cfc0" },
  bookshelf: { label: "Bookshelf", category: "living", size: [0.9, 0.35, 2.0], color: "#e8e2d6" },
  bed: { label: "Bed", category: "bedroom", size: [1.6, 2.1, 1.0], color: "#e9e4dc" },
  nightstand: { label: "Nightstand", category: "bedroom", size: [0.5, 0.4, 0.5], color: "#a07850" },
  wardrobe: { label: "Wardrobe", category: "bedroom", size: [1.8, 0.6, 2.2], color: "#ece8e1" },
  dining_table: { label: "Dining table", category: "dining", size: [1.6, 0.9, 0.75], color: "#b48a60" },
  chair: { label: "Chair", category: "dining", size: [0.45, 0.5, 0.85], color: "#3a3a3f" },
  desk: { label: "Desk", category: "office", size: [1.4, 0.7, 0.75], color: "#e6e0d6" },
  office_chair: { label: "Office chair", category: "office", size: [0.6, 0.6, 1.1], color: "#2a2a2e" },
  kitchen_counter: { label: "Kitchen counter", category: "kitchen", size: [2.4, 0.62, 0.9], color: "#f4f4f2" },
  fridge: { label: "Fridge", category: "kitchen", size: [0.7, 0.7, 1.9], color: "#d9dadd" },
  bathtub: { label: "Bathtub", category: "bath", size: [1.7, 0.75, 0.58], color: "#ffffff" },
  toilet: { label: "Toilet", category: "bath", size: [0.4, 0.65, 0.8], color: "#ffffff" },
  sink: { label: "Sink", category: "bath", size: [0.6, 0.45, 0.85], color: "#ffffff" },
  plant: { label: "Plant", category: "decor", size: [0.5, 0.5, 1.3], color: "#4f7a4a" },
  floor_lamp: { label: "Floor lamp", category: "decor", size: [0.4, 0.4, 1.6], color: "#d8c3a0" },
  box: { label: "Box", category: "decor", size: [0.6, 0.6, 0.6], color: "#bdbdbd" },
} satisfies Record<string, CatalogItem>;

export type CatalogKey = keyof typeof CATALOG;

export function catalogItem(type: string): CatalogItem {
  return (CATALOG as Record<string, CatalogItem>)[type] ?? CATALOG.box;
}

export const CATALOG_KEYS = Object.keys(CATALOG) as CatalogKey[];
