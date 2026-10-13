import { parseScene, type Scene } from "./schema";

/** A two-room apartment (8 × 6 m) used for new projects. */
export function sampleScene(): Scene {
  return parseScene({
    name: "Sample apartment",
    style: { prompt: "Modern Scandinavian interior, light oak, linen textiles, warm late-afternoon daylight" },
    walls: [
      { id: "w_north", a: [0, 0], b: [8, 0] },
      { id: "w_east", a: [8, 0], b: [8, 6] },
      { id: "w_south", a: [8, 6], b: [0, 6] },
      { id: "w_west", a: [0, 6], b: [0, 0] },
      { id: "w_mid", a: [5, 0], b: [5, 6], thickness: 0.1 },
      { id: "w_bath", a: [5, 3.6], b: [8, 3.6], thickness: 0.1 },
    ],
    openings: [
      { id: "o_win1", wallId: "w_north", kind: "window", offset: 1.4, width: 1.6, height: 1.6, sill: 0.6 },
      { id: "o_win2", wallId: "w_north", kind: "window", offset: 3.6, width: 1.6, height: 1.6, sill: 0.6 },
      { id: "o_win3", wallId: "w_east", kind: "window", offset: 1.8, width: 1.4, height: 1.5, sill: 0.8 },
      { id: "o_win4", wallId: "w_east", kind: "window", offset: 4.8, width: 0.6, height: 0.6, sill: 1.5 },
      { id: "o_win5", wallId: "w_west", kind: "window", offset: 1.2, width: 1.0, height: 1.0, sill: 1.1 },
      { id: "o_entry", wallId: "w_south", kind: "door", offset: 3.8, width: 1.0, height: 2.1 },
      { id: "o_bed", wallId: "w_mid", kind: "door", offset: 3.0, width: 0.9, height: 2.05 },
      { id: "o_bath", wallId: "w_mid", kind: "door", offset: 4.6, width: 0.8, height: 2.05 },
    ],
    rooms: [
      { id: "r_living", name: "Living & Kitchen", polygon: [[0, 0], [5, 0], [5, 6], [0, 6]], floor: "oak" },
      { id: "r_bed", name: "Bedroom", polygon: [[5, 0], [8, 0], [8, 3.6], [5, 3.6]], floor: "oak" },
      { id: "r_bath", name: "Bathroom", polygon: [[5, 3.6], [8, 3.6], [8, 6], [5, 6]], floor: "tile" },
    ],
    furniture: [
      { id: "f_sofa", type: "sofa", name: "Sofa", position: [1.4, 1.8], rotation: 270, size: [2.2, 0.95, 0.85], color: "#8b8f98" },
      { id: "f_rug", type: "rug", name: "Rug", position: [2.75, 1.8], rotation: 90, size: [2.4, 1.7, 0.01], color: "#d8cfc0" },
      { id: "f_coffee", type: "coffee_table", name: "Coffee table", position: [2.65, 1.8], rotation: 90, size: [1.1, 0.6, 0.42], color: "#a07850" },
      { id: "f_arm", type: "armchair", name: "Armchair", position: [2.9, 0.65], rotation: 0, size: [0.85, 0.85, 0.85], color: "#c9a27e" },
      { id: "f_tvstand", type: "tv_stand", name: "TV stand", position: [4.74, 1.8], rotation: 90, size: [1.8, 0.42, 0.5], color: "#2f2f33" },
      { id: "f_tv", type: "tv", name: "TV", position: [4.85, 1.8], rotation: 90, elevation: 0.55, size: [1.45, 0.08, 0.85], color: "#111114" },
      { id: "f_shelf", type: "bookshelf", name: "Bookshelf", position: [0.24, 1.8], rotation: 270, size: [0.9, 0.35, 2.0], color: "#e8e2d6" },
      { id: "f_plant", type: "plant", name: "Plant", position: [0.45, 0.45], size: [0.5, 0.5, 1.3], color: "#4f7a4a" },
      { id: "f_lamp", type: "floor_lamp", name: "Floor lamp", position: [0.55, 3.0], size: [0.4, 0.4, 1.6], color: "#d8c3a0" },
      { id: "f_counter", type: "kitchen_counter", name: "Kitchen counter", position: [0.37, 4.3], rotation: 270, size: [1.8, 0.62, 0.9], color: "#f4f4f2" },
      { id: "f_fridge", type: "fridge", name: "Fridge", position: [0.41, 5.58], rotation: 270, size: [0.7, 0.7, 1.9], color: "#d9dadd" },
      { id: "f_table", type: "dining_table", name: "Dining table", position: [2.4, 4.6], size: [1.6, 0.9, 0.75], color: "#b48a60" },
      { id: "f_ch1", type: "chair", name: "Chair", position: [2.0, 3.95], rotation: 0, size: [0.45, 0.5, 0.85], color: "#3a3a3f" },
      { id: "f_ch2", type: "chair", name: "Chair", position: [2.8, 3.95], rotation: 0, size: [0.45, 0.5, 0.85], color: "#3a3a3f" },
      { id: "f_ch3", type: "chair", name: "Chair", position: [2.0, 5.25], rotation: 180, size: [0.45, 0.5, 0.85], color: "#3a3a3f" },
      { id: "f_ch4", type: "chair", name: "Chair", position: [2.8, 5.25], rotation: 180, size: [0.45, 0.5, 0.85], color: "#3a3a3f" },
      { id: "f_bed", type: "bed", name: "Bed", position: [6.6, 1.15], size: [1.6, 2.1, 1.0], color: "#e9e4dc" },
      { id: "f_ns1", type: "nightstand", name: "Nightstand", position: [5.5, 0.32], size: [0.5, 0.4, 0.5], color: "#a07850" },
      { id: "f_ns2", type: "nightstand", name: "Nightstand", position: [7.7, 0.32], size: [0.5, 0.4, 0.5], color: "#a07850" },
      { id: "f_wardrobe", type: "wardrobe", name: "Wardrobe", position: [7.0, 3.24], rotation: 180, size: [1.8, 0.6, 2.2], color: "#ece8e1" },
      { id: "f_tub", type: "bathtub", name: "Bathtub", position: [7.1, 5.6], size: [1.7, 0.75, 0.58], color: "#ffffff" },
      { id: "f_wc", type: "toilet", name: "Toilet", position: [7.6, 4.15], rotation: 90, size: [0.4, 0.65, 0.8], color: "#ffffff" },
      { id: "f_sink", type: "sink", name: "Sink", position: [6.3, 3.88], size: [0.6, 0.45, 0.85], color: "#ffffff" },
    ],
    cameras: [
      { id: "c_living", name: "Living room", position: [4.4, 5.3], target: [1.2, 1.0], fov: 70 },
      { id: "c_bed", name: "Bedroom", position: [5.5, 3.2], target: [7.4, 0.6], fov: 70 },
    ],
    activeCameraId: "c_living",
  });
}
