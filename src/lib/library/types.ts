/**
 * My library: furniture generated from photos or product links. Shared by all
 * projects. The built-in catalog (catalog.ts) stays separate.
 */
export type AssetStatus = "queued" | "processing" | "ready" | "failed";

export type LibraryAsset = {
  id: string;
  name: string;
  /** Catalog key used as fallback model and for the chat agent (e.g. "sofa"). */
  category: string;
  /** Real-world [width, depth, height] in meters; the model is scaled to fit. */
  size: [number, number, number];
  color?: string;
  status: AssetStatus;
  /** Human-readable step while processing, e.g. "Generating shape". */
  stage?: string;
  progress?: number;
  error?: string;
  /** Generated but doubtful (e.g. proportions don't match); suggests retaking a photo. */
  warning?: string;
  stats?: { faces?: number; photo_coverage?: number; proportion_mismatch?: number; seconds?: number };
  source: {
    kind: "photo" | "url" | "apartment";
    /** Product page or image links the asset was made from. */
    url?: string;
    /** Stored input photos (served URLs). */
    photos: string[];
    projectId?: string;
    note?: string;
    /** Where the piece is inside the first photo ([x0, y0, x1, y1] fractions), for prompted segmentation. */
    box?: [number, number, number, number];
  };
  /** Served URL of the generated GLB (textures embedded). */
  model?: string;
  thumbnail?: string;
  generator?: string;
  jobId?: string;
  createdAt: string;
  updatedAt: string;
};
