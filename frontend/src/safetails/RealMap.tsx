// @ts-nocheck - verbatim port of the SafeTails design reference (authored without strict typing)
/* ============================================================
   SafeTails - Real interactive map (Leaflet + OpenStreetMap)
   No API key required. Markers, clustering, heatmap, popups.
   ============================================================ */
import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Circle, CircleMarker, Tooltip as LTooltip, ZoomControl, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import L from "./leaflet-setup"; // sets globalThis.L before the heat plugin loads
import "leaflet.heat";           // attaches L.heatLayer
import { SPECIES, WARDS } from "./data";

const VALLEY_CENTER: [number, number] = [27.690, 85.360];
// Kathmandu Valley bounding box (covers Kathmandu, Lalitpur & Bhaktapur districts)
const VALLEY_BOUNDS: [[number, number], [number, number]] = [
  [27.560, 85.180], // south-west
  [27.815, 85.530], // north-east
];

/* ---- custom species pin as a divIcon ---- */
function pinIcon(r: any, sel: boolean) {
  const hex = SPECIES[r.species].hex;
  const html = `
    <svg width="34" height="44" viewBox="-17 -40 34 44" style="overflow:visible">
      ${r.injured ? `<circle cx="0" cy="-26" r="17" fill="#db5238" opacity="0.28" class="pulse-ring" style="transform-origin:0 -26px"/>` : ""}
      ${sel ? `<circle cx="0" cy="-26" r="18" fill="none" stroke="#f6c84d" stroke-width="3.5"/>` : ""}
      <path d="M0 0 C -6 -12 -13 -17 -13 -26 A13 13 0 1 1 13 -26 C 13 -17 6 -12 0 0 Z" fill="${hex}" stroke="#fff" stroke-width="2.4"/>
      <circle cx="0" cy="-26" r="5.4" fill="#fff"/>
      ${r.injured ? `<circle cx="9" cy="-34" r="6" fill="#db5238" stroke="#fff" stroke-width="1.6"/><path d="M9 -36.4v4.8M6.6 -34h4.8" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>` : ""}
    </svg>`;
  return L.divIcon({ html, className: "st-pin", iconSize: [34, 44], iconAnchor: [17, 40] });
}

function clusterIcon(cluster: any) {
  const count = cluster.getChildCount();
  const size = 34 + Math.min(count, 30);
  const html = `<div style="width:${size}px;height:${size}px;border-radius:99px;background:#157d8f;border:3px solid rgba(255,255,255,.9);
    box-shadow:0 6px 18px -6px rgba(17,34,27,.5);display:grid;place-items:center;color:#fff;
    font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:${count > 99 ? 13 : 15}px">${count}</div>`;
  return L.divIcon({ html, className: "st-cluster", iconSize: [size, size] });
}

/* ---- heatmap layer ---- */
function HeatLayer({ points }: { points: [number, number, number][] }) {
  const map = useMap();
  useEffect(() => {
    let layer: any = null;
    try {
      const heat = (L as any).heatLayer;
      if (typeof heat !== "function") { console.warn("leaflet.heat not loaded"); return; }
      layer = heat(points, {
        radius: 40, blur: 30, maxZoom: 17, max: 1.0, minOpacity: 0.4,
        gradient: { 0.2: "#f6c84d", 0.5: "#f0973a", 0.8: "#db5238", 1.0: "#c2402a" },
      });
      layer.addTo(map);
    } catch (e) { console.warn("heatmap error", e); }
    return () => { if (layer) { try { map.removeLayer(layer); } catch (e) {} } };
  }, [map, points]);
  return null;
}

/* ---- pan to selected report ---- */
function FlyTo({ report }: any) {
  const map = useMap();
  useEffect(() => {
    if (report) map.flyTo([report.lat, report.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [report, map]);
  return null;
}

/* ---- pan to a searched location (re-fires whenever target.ts changes) ---- */
function FlyToLatLng({ target }: any) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 16, { duration: 0.7 });
  }, [target?.ts]);
  return null;
}

/* ---- distinct marker for a searched place ---- */
function searchIcon() {
  const html = `<div style="width:18px;height:18px;border-radius:99px;background:#db5238;border:3px solid #fff;
    box-shadow:0 0 0 6px rgba(219,82,56,.25)"></div>`;
  return L.divIcon({ html, className: "st-pin", iconSize: [18, 18], iconAnchor: [9, 9] });
}

/* Selectable base map styles (all free, no API key). */
export const TILE_LAYERS: Record<string, { label: string; url: string; attribution: string; subdomains?: string }> = {
  standard: {
    label: "Standard",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics",
  },
  terrain: {
    label: "Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenTopoMap (CC-BY-SA), &copy; OpenStreetMap contributors",
    subdomains: "abc",
  },
};

/* ===================== Live dashboard map ===================== */
export function LiveMap({ reports, selectedId, onSelect, layer, flyTo, searchPin, tileLayer = "standard" }: any) {
  const selected = reports.find((r: any) => r.id === selectedId);
  const tile = TILE_LAYERS[tileLayer] || TILE_LAYERS.standard;
  const heatPoints = useMemo(
    () => reports.map((r: any) => [r.lat, r.lng, r.injured ? 1 : 0.6] as [number, number, number]),
    [reports]
  );

  return (
    <MapContainer center={VALLEY_CENTER} zoom={12} minZoom={11} maxZoom={18} maxBounds={VALLEY_BOUNDS} maxBoundsViscosity={1.0} className="leaflet-fill" zoomControl={false} scrollWheelZoom>
      <ZoomControl position="bottomright" />
      <TileLayer key={tileLayer} attribution={tile.attribution} url={tile.url} {...(tile.subdomains ? { subdomains: tile.subdomains as any } : {})} />
      {layer === "heat" ? (
        <HeatLayer points={heatPoints} />
      ) : (
        <MarkerClusterGroup chunkedLoading iconCreateFunction={clusterIcon} maxClusterRadius={48} showCoverageOnHover={false}>
          {reports.map((r: any) => (
            <Marker
              key={r.id}
              position={[r.lat, r.lng]}
              icon={pinIcon(r, r.id === selectedId)}
              eventHandlers={{ click: () => onSelect(r.id) }}
            />
          ))}
        </MarkerClusterGroup>
      )}
      {searchPin && <Marker position={[searchPin.lat, searchPin.lng]} icon={searchIcon()} />}
      <FlyTo report={selected} />
      <FlyToLatLng target={flyTo} />
    </MapContainer>
  );
}

/* ===================== Submit pin picker ===================== */
function ClickCapture({ onPick }: any) {
  useMapEvents({
    click(e) { onPick({ lng: e.latlng.lng, lat: e.latlng.lat }); },
  });
  return null;
}

function PinFly({ center }: any) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo([center.lat, center.lng], 16, { duration: 0.7 }); }, [center, map]);
  return null;
}

export function PinPickerMap({ pin, species, onPick, center }: any) {
  return (
    <MapContainer center={VALLEY_CENTER} zoom={12} minZoom={11} maxZoom={18} maxBounds={VALLEY_BOUNDS} maxBoundsViscosity={1.0} className="leaflet-fill" scrollWheelZoom>
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickCapture onPick={onPick} />
      <PinFly center={center} />
      {pin && <Marker position={[pin.lat, pin.lng]} icon={pinIcon({ species, injured: false }, true)} />}
    </MapContainer>
  );
}

/* ===================== Static preview (insights heatmap) ===================== */
export function HeatPreviewMap({ reports }: any) {
  const heatPoints = useMemo(
    () => reports.map((r: any) => [r.lat, r.lng, r.injured ? 1 : 0.6] as [number, number, number]),
    [reports]
  );
  return (
    <MapContainer center={VALLEY_CENTER} zoom={11} minZoom={11} maxZoom={16} maxBounds={VALLEY_BOUNDS} maxBoundsViscosity={1.0} className="leaflet-fill" scrollWheelZoom={false} dragging={false} doubleClickZoom={false} zoomControl={false} attributionControl={false}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <HeatLayer points={heatPoints} />
    </MapContainer>
  );
}

/* ===================== Spatial hotspot / cluster map ===================== */
export function HotspotMap({ clusters = [], hotspots = [], reports = [] }: any) {
  // Colour a cluster by its injured share (green -> coral); size by radius.
  const clusterColor = (c: any) => {
    const share = c.size ? c.injured / c.size : 0;
    return share >= 0.5 ? "#db5238" : share >= 0.2 ? "#f0973a" : "#157d8f";
  };
  return (
    <MapContainer center={VALLEY_CENTER} zoom={12} minZoom={11} maxZoom={17} maxBounds={VALLEY_BOUNDS} maxBoundsViscosity={1.0} className="leaflet-fill" scrollWheelZoom>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
      {/* faint context: every incident as a tiny dot */}
      {reports.map((r: any, i: number) => (
        <CircleMarker key={"r" + i} center={[r.lat, r.lng]} radius={2.5} pathOptions={{ color: "#11221b", opacity: 0.16, fillOpacity: 0.16 }} />
      ))}
      {/* Gi* significant hotspot cells */}
      {hotspots.filter((h: any) => h.kind === "hotspot").map((h: any, i: number) => (
        <CircleMarker key={"h" + i} center={[h.lat, h.lng]} radius={7} pathOptions={{ color: "#c2402a", weight: 2, fillColor: "#db5238", fillOpacity: 0.5 }}>
          <LTooltip>Gi* z = {h.gi_z} ({h.significance}) · {h.count} here</LTooltip>
        </CircleMarker>
      ))}
      {/* DBSCAN clusters as extent circles */}
      {clusters.map((c: any, i: number) => (
        <Circle key={"c" + i} center={[c.lat, c.lng]} radius={Math.max(c.radius_m, 120)} pathOptions={{ color: clusterColor(c), weight: 2, fillColor: clusterColor(c), fillOpacity: 0.12 }}>
          <LTooltip>{c.size} incidents · {c.injured} injured{c.dominant_species ? ` · mostly ${c.dominant_species}` : ""}</LTooltip>
        </Circle>
      ))}
    </MapContainer>
  );
}

export { WARDS };
