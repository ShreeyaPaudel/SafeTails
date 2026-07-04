// @ts-nocheck - verbatim port of the SafeTails design reference (authored without strict typing)
/* ============================================================
   SafeTails - Real geography
   ============================================================ */

export const MAP_W = 1000, MAP_H = 720;

/* ---- National outline of Nepal (clockwise, lng,lat) ---- */
export const NEPAL_BORDER = [
  [80.20,30.10],[80.55,30.20],[81.05,30.18],[81.60,30.42],[82.10,30.34],
  [82.75,30.02],[83.40,29.62],[84.05,29.28],[84.75,29.32],[85.30,28.96],
  [85.75,28.55],[86.10,28.30],[86.55,28.12],[86.95,28.06],[87.50,27.94],
  [88.05,27.96],
  [88.16,27.86],[88.10,27.45],[88.04,27.06],[87.98,26.62],[87.70,26.45],
  [87.10,26.50],[86.55,26.53],[86.00,26.60],[85.45,26.66],[85.00,26.86],
  [84.55,27.06],[84.12,27.50],[83.62,27.38],[83.05,27.48],[82.40,27.70],
  [81.80,27.92],[81.20,28.18],[80.65,28.55],[80.35,28.78],
  [80.06,29.10],[80.18,29.58],[80.30,29.95],[80.20,30.10],
];

/* ---- Province label anchors (approx centroids) ---- */
export const PROVINCES = [
  { id: 1, name: "Koshi",          lng: 87.35, lat: 27.30 },
  { id: 2, name: "Madhesh",        lng: 86.05, lat: 26.85 },
  { id: 3, name: "Bagmati",        lng: 85.42, lat: 28.12 },
  { id: 4, name: "Gandaki",        lng: 84.05, lat: 28.50 },
  { id: 5, name: "Lumbini",        lng: 82.70, lat: 27.95 },
  { id: 6, name: "Karnali",        lng: 82.20, lat: 29.35 },
  { id: 7, name: "Sudurpashchim",  lng: 80.85, lat: 29.45 },
];

/* ---- Major rivers (context only) ---- */
export const RIVERS_NP = [
  [[81.55,30.10],[81.55,29.30],[81.65,28.70],[81.55,28.20],[81.10,27.95]],
  [[84.05,29.10],[84.20,28.40],[84.35,27.80],[84.30,27.45]],
  [[86.55,28.10],[86.85,27.55],[86.98,26.95],[86.95,26.55]],
];

/* ---- Major cities (lng,lat) ---- */
export const CITIES = [
  { name: "Kathmandu",  lng: 85.3240, lat: 27.7172, hub: true },
  { name: "Pokhara",    lng: 83.9856, lat: 28.2096 },
  { name: "Biratnagar", lng: 87.2718, lat: 26.4525 },
  { name: "Birgunj",    lng: 84.8800, lat: 27.0104 },
  { name: "Janakpur",   lng: 85.9217, lat: 26.7271 },
  { name: "Nepalgunj",  lng: 81.6167, lat: 28.0500 },
  { name: "Butwal",     lng: 83.4484, lat: 27.7006 },
  { name: "Dhangadhi",  lng: 80.5772, lat: 28.6961 },
  { name: "Surkhet",    lng: 81.6333, lat: 28.6000 },
  { name: "Dharan",     lng: 87.2833, lat: 26.8125 },
];

/* ---- Kathmandu Valley ring of hills (lng,lat) ---- */
export const VALLEY_RING = [
  [85.255,27.815],[85.345,27.825],[85.430,27.812],[85.510,27.760],
  [85.555,27.690],[85.535,27.620],[85.470,27.575],[85.385,27.560],
  [85.300,27.572],[85.225,27.605],[85.185,27.668],[85.190,27.745],
  [85.255,27.815],
];

/* ---- Valley rivers (lng,lat) ---- */
export const BAGMATI = [
  [85.430,27.770],[85.385,27.728],[85.350,27.700],[85.328,27.682],
  [85.312,27.665],[85.300,27.645],[85.298,27.612],
];
export const BISHNUMATI = [
  [85.305,27.785],[85.305,27.745],[85.312,27.712],[85.318,27.688],[85.312,27.665],
];

/* ---- Fit projection: lng/lat <-> SVG, aspect-correct ---- */
export function fitProjection(bbox: any, W: number, H: number, pad: number) {
  const meanLat = (bbox.latMin + bbox.latMax) / 2;
  const k = Math.cos((meanLat * Math.PI) / 180);
  const spanX = (bbox.lngMax - bbox.lngMin) * k;
  const spanY = (bbox.latMax - bbox.latMin);
  const availW = W * (1 - 2 * pad), availH = H * (1 - 2 * pad);
  const s = Math.min(availW / spanX, availH / spanY);
  const drawW = spanX * s, drawH = spanY * s;
  const offX = (W - drawW) / 2, offY = (H - drawH) / 2;
  return {
    s, k,
    project(lng: number, lat: number) {
      return [offX + (lng - bbox.lngMin) * k * s, offY + (bbox.latMax - lat) * s];
    },
    invert(x: number, y: number) {
      return [(x - offX) / (k * s) + bbox.lngMin, bbox.latMax - (y - offY) / s];
    },
  };
}

export const NEPAL_PROJ = fitProjection({ lngMin: 79.9, lngMax: 88.4, latMin: 26.15, latMax: 30.65 }, MAP_W, MAP_H, 0.045);
export const VALLEY_PROJ = fitProjection({ lngMin: 85.165, lngMax: 85.575, latMin: 27.55, latMax: 27.84 }, MAP_W, MAP_H, 0.05);

// helper: turn a [lng,lat] list into an SVG points/path string for a projection
export function projPath(coords: any[], proj: any, close?: boolean) {
  const pts = coords.map(c => proj.project(c[0], c[1]));
  let d = "M" + pts.map((p: number[]) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L");
  if (close) d += " Z";
  return d;
}

// deterministic jitter so reports scatter around their ward
export function jitterLL(lng: number, lat: number, id: number) {
  const a = ((id * 37) % 100) / 100 - 0.5;
  const b = ((id * 53) % 100) / 100 - 0.5;
  return [lng + a * 0.011, lat + b * 0.009];
}
