// Chalupa Brtníky 69: floors and rooms of the house model in public/models/chalupa/chalupa.glb.
// Room boxes are in Blender coordinates (x east→west, y north→south, z up, meters), as in the model source.
// three.js (glTF, y up) uses (x, z, -y), see toThree().

export type Floor = { id: number; name: string; z: number; ceil: number };
export type Room = { id: string; name: string; floor: number; box: [number, number, number, number] };

export const MODEL_URL = "/models/chalupa/chalupa.glb";
export const DRACO_URL = "/draco/";

export const FLOORS: Floor[] = [
  { id: 1, name: "1. NP", z: 0.0, ceil: 2.4 },
  { id: 2, name: "2. NP", z: 2.67, ceil: 4.82 },
  { id: 3, name: "Podkroví", z: 5.28, ceil: 9.3 },
];

export const ROOMS: Room[] = [
  { id: "1.01", name: "Chodba a schodiště", floor: 1, box: [4.27, -9.58, 7.83, -5.43] },
  { id: "1.02", name: "Obytná kuchyň", floor: 1, box: [-1.49, -9.18, 4.06, -2.28] },
  { id: "1.03", name: "Pánský pokoj", floor: 1, box: [2.94, -1.98, 6.18, 1.63] },
  { id: "1.04", name: "Zádveří a chodba", floor: 1, box: [6.4, -5.4, 7.83, -1.74] },
  { id: "1.05", name: "Šatna a šicí koutek", floor: 1, box: [8.03, -9.3, 11.29, -4.13] },
  { id: "1.06", name: "Koupelna", floor: 1, box: [8.03, -4.0, 11.28, -2.16] },
  { id: "1.07", name: "Prádelna", floor: 1, box: [13.79, -9.3, 16.26, -5.8] },
  { id: "1.08", name: "Koupelna", floor: 1, box: [11.6, -9.29, 13.64, -7.15] },
  { id: "1.09", name: "Dílna", floor: 1, box: [11.59, -5.5, 16.26, -2.15] },
  { id: "2.01", name: "Hala", floor: 2, box: [4.51, -9.78, 7.75, -1.94] },
  { id: "2.02", name: "Kuchyňka v arkýři", floor: 2, box: [4.59, -11.08, 7.75, -9.8] },
  { id: "2.03", name: "Ložnice", floor: 2, box: [-1.69, -9.38, 4.24, -6.33] },
  { id: "2.04", name: "Ložnice", floor: 2, box: [-1.69, -6.18, 4.23, -2.07] },
  { id: "2.05", name: "Koupelna", floor: 2, box: [3.2, -1.6, 5.15, 1.34] },
  { id: "2.06", name: "Zimní zahrada", floor: 2, box: [5.33, -1.62, 11.72, 1.31] },
  { id: "2.07", name: "Koupelna", floor: 2, box: [11.87, -1.6, 13.7, 1.34] },
  { id: "2.09", name: "Koupelna", floor: 2, box: [8.08, -3.76, 11.13, -1.91] },
  { id: "2.10", name: "Obývací pokoj", floor: 2, box: [11.54, -5.53, 16.56, -1.87] },
  { id: "2.11", name: "Kuchyň", floor: 2, box: [14.8, -9.7, 16.56, -5.6] },
  { id: "2.12", name: "Pracovna", floor: 2, box: [8.11, -9.55, 11.27, -6.74] },
  { id: "2.14", name: "Ložnice", floor: 2, box: [11.58, -9.7, 14.72, -5.72] },
  { id: "3.01", name: "Chodba", floor: 3, box: [5.55, -8.2, 9.06, -2.3] },
  { id: "3.02", name: "Herna", floor: 3, box: [9.16, -9.31, 16.59, -2.3] },
  { id: "3.03", name: "WC", floor: 3, box: [9.16, -5.23, 11.05, -2.3] },
  { id: "3.04", name: "Půda", floor: 3, box: [-1.82, -9.31, 5.37, -2.14] },
];

/** Blender (z up) → three.js (y up). */
export const toThree = (x: number, y: number, z: number): [number, number, number] => [x, z, -y];

export const floorById = (id: number) => FLOORS.find((f) => f.id === id)!;
export const roomById = (id: string) => ROOMS.find((r) => r.id === id);

/** Room center at floor level, in three.js coordinates. */
export function roomCenter(r: Room): [number, number, number] {
  const [x0, y0, x1, y1] = r.box;
  return toThree((x0 + x1) / 2, (y0 + y1) / 2, floorById(r.floor).z);
}
