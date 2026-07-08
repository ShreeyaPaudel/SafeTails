// @ts-nocheck - verbatim port of the SafeTails design reference (authored without strict typing)
/* ============================================================
   SafeTails - Geographic map (real Nepal + Kathmandu Valley)
   ============================================================ */
import { Icon } from "./icons";
import { SPECIES, WARDS } from "./data";
import {
  MAP_W, MAP_H, NEPAL_BORDER, PROVINCES, RIVERS_NP, CITIES,
  VALLEY_RING, BAGMATI, BISHNUMATI, NEPAL_PROJ, VALLEY_PROJ,
  fitProjection, projPath,
} from "./geo";

const VALLEY_SCALE: any = { 1: 1, 2: 1.14, 3: 1.7 };
const VC = VALLEY_PROJ.project(85.337, 27.700); // valley focus centre (svg)

/* ---- Ring Road loop (generated around Kathmandu core) ---- */
const RINGROAD = (() => {
  const c = [85.3225, 27.6985], rx = 0.050, ry = 0.039, pts: number[][] = [];
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const wob = 1 + 0.04 * Math.sin(a * 3);
    pts.push([c[0] + Math.cos(a) * rx * wob, c[1] + Math.sin(a) * ry * wob]);
  }
  return pts;
})();

/* ===================== National base ===================== */
function NepalBase() {
  const border = projPath(NEPAL_BORDER, NEPAL_PROJ, true);
  return (
    <g>
      <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="#e7eef0" />
      <path d={border} fill="#d6e2e4" transform="translate(5,7)" opacity="0.55" />
      <path d={border} fill="#eef4f5" stroke="#adc3c8" strokeWidth="2.4" strokeLinejoin="round" />
      <clipPath id="npClip"><path d={border} /></clipPath>
      <g clipPath="url(#npClip)">
        <rect x="0" y="0" width={MAP_W} height={MAP_H * 0.42} fill="#e6edee" opacity="0.7" />
        {RIVERS_NP.map((r, i) => (
          <path key={i} d={projPath(r, NEPAL_PROJ)} fill="none" stroke="#bcd8de" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        ))}
      </g>
      {PROVINCES.map(p => {
        const [x, y] = NEPAL_PROJ.project(p.lng, p.lat);
        return (
          <text key={p.id} x={x} y={y} textAnchor="middle" fontFamily="JetBrains Mono, monospace"
            fontSize="12.5" fontWeight="600" fill="#8ba0a6" letterSpacing="0.4">{p.name}</text>
        );
      })}
      <text x={MAP_W / 2} y={MAP_H - 26} textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif"
        fontSize="15" fontWeight="700" fill="#c3d2d6" letterSpacing="4">NEPAL · नेपाल</text>
    </g>
  );
}

/* ===================== Valley base ===================== */
export function ValleyBase() {
  const ring = projPath(VALLEY_RING, VALLEY_PROJ, true);
  return (
    <g>
      <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="#e7eef0" />
      <path d={ring} fill="#cfdde0" transform="translate(0,5)" opacity="0.6" />
      <path d={ring} fill="#eef4f5" stroke="#b6c9ce" strokeWidth="2.6" strokeLinejoin="round" />
      <clipPath id="valClip"><path d={ring} /></clipPath>
      <g clipPath="url(#valClip)">
        <ellipse cx={VALLEY_PROJ.project(85.290, 27.715)[0]} cy={VALLEY_PROJ.project(85.290, 27.715)[1]} rx="34" ry="26" fill="#d6e2e4" />
        <ellipse cx={VALLEY_PROJ.project(85.362, 27.722)[0]} cy={VALLEY_PROJ.project(85.362, 27.722)[1]} rx="30" ry="24" fill="#d6e2e4" />
        <path d={projPath(BAGMATI, VALLEY_PROJ)} fill="none" stroke="#c6dde2" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <path d={projPath(BISHNUMATI, VALLEY_PROJ)} fill="none" stroke="#c6dde2" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={projPath(RINGROAD, VALLEY_PROJ, true)} fill="none" stroke="#e6c98a" strokeWidth="8" />
        <path d={projPath(RINGROAD, VALLEY_PROJ, true)} fill="none" stroke="#fff" strokeWidth="1.3" strokeDasharray="2 9" opacity="0.7" />
      </g>
      <path d={ring} fill="none" stroke="#b6c9ce" strokeWidth="2.4" />
      {WARDS.map(w => {
        const [x, y] = VALLEY_PROJ.project(w.lng, w.lat);
        return (
          <text key={w.id} x={x} y={y - 30} textAnchor="middle" fontFamily="JetBrains Mono, monospace"
            fontSize="11" fontWeight="600" fill="#6f8389" letterSpacing="0.3">{w.name}</text>
        );
      })}
      <text x={MAP_W / 2} y={MAP_H - 22} textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif"
        fontSize="14" fontWeight="700" fill="#c3d2d6" letterSpacing="3">KATHMANDU VALLEY · काठमाडौँ उपत्यका</text>
    </g>
  );
}

/* ===================== Marker pin ===================== */
export function PinShape({ r, sel }: any) {
  const hex = SPECIES[r.species].hex;
  return (
    <g>
      {r.injured && <circle cx="0" cy="-26" r="17" fill="var(--coral)" opacity="0.28" className="pulse-ring" style={{ transformOrigin: "0px -26px" }} />}
      {sel && <circle cx="0" cy="-26" r="18" fill="none" stroke="var(--gold)" strokeWidth="3.5" />}
      <path d="M0 0 C -6 -12 -13 -17 -13 -26 A13 13 0 1 1 13 -26 C 13 -17 6 -12 0 0 Z"
        fill={hex} stroke="#fff" strokeWidth="2.4" />
      <circle cx="0" cy="-26" r="5.4" fill="#fff" />
      {r.injured && <circle cx="9" cy="-34" r="6" fill="var(--coral)" stroke="#fff" strokeWidth="1.6" />}
      {r.injured && <path d="M9 -36.4v4.8M6.6 -34h4.8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />}
    </g>
  );
}

/* ===================== Nepal locator inset ===================== */
function NepalInset({ onClick }: any) {
  const W = 150, H = 108;
  const ins = fitProjection({ lngMin: 79.9, lngMax: 88.4, latMin: 26.15, latMax: 30.65 }, W, H, 0.08);
  const [kx, ky] = ins.project(85.324, 27.7172);
  return (
    <div className="map-panel nepal-inset" style={{ padding: 8, cursor: "pointer" }} onClick={onClick} title="Zoom out to Nepal">
      <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".09em", color: "var(--ink-3)", marginBottom: 4, fontFamily: "var(--ff-mono)" }}>Nepal · you are here</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: W, height: H, display: "block" }}>
        <path d={projPath(NEPAL_BORDER, ins, true)} fill="#e6edee" stroke="#adc3c8" strokeWidth="1.4" strokeLinejoin="round" />
        <circle cx={kx} cy={ky} r="9" fill="none" stroke="var(--green)" strokeWidth="1.6" opacity="0.5" />
        <circle cx={kx} cy={ky} r="4" fill="var(--coral)" stroke="#fff" strokeWidth="1.4" />
      </svg>
    </div>
  );
}

/* ===================== Map view ===================== */
export function MapView({ reports, selectedId, onSelect, selectedWard, onWard, layer, zoom, setZoom }: any) {
  const national = zoom === 0;
  const cluster = zoom === 1;
  const z = national ? 1 : VALLEY_SCALE[zoom];
  const gt = national ? "" : `translate(${VC[0]},${VC[1]}) scale(${z}) translate(${-VC[0]},${-VC[1]})`;

  const byWard: any = {};
  reports.forEach((r: any) => { (byWard[r.ward] = byWard[r.ward] || []).push(r); });
  const injTotal = reports.filter((r: any) => r.injured).length;
  const [kx, ky] = NEPAL_PROJ.project(85.324, 27.7172);

  return (
    <div className="mapwrap">
      <svg className="mapsvg" viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="heatG">
            <stop offset="0%" stopColor="#db5238" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#f6c84d" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#f6c84d" stopOpacity="0" />
          </radialGradient>
        </defs>

        {national ? <NepalBase /> : <ValleyBase />}

        <g transform={gt}>
          {/* ---------- NATIONAL ---------- */}
          {national && (
            <g>
              {CITIES.filter(c => !c.hub).map(c => {
                const [x, y] = NEPAL_PROJ.project(c.lng, c.lat);
                return (
                  <g key={c.name}>
                    <circle cx={x} cy={y} r="3.5" fill="#8ba0a6" />
                    <text x={x} y={y - 8} textAnchor="middle" fontFamily="Hanken Grotesk, sans-serif" fontSize="11.5" fontWeight="600" fill="#6f8389">{c.name}</text>
                  </g>
                );
              })}
              {layer === "heat" && <circle cx={kx} cy={ky} r={70 + Math.min(reports.length, 40) * 2} fill="url(#heatG)" />}
              {layer !== "heat" && (
                <g style={{ cursor: "pointer" }} onClick={() => setZoom(1)}>
                  <circle cx={kx} cy={ky} r="46" fill="#157d8f" opacity="0.12" className="pulse-ring" style={{ transformOrigin: `${kx}px ${ky}px` }} />
                  <circle cx={kx} cy={ky} r="33" fill="#157d8f" stroke="#fff" strokeWidth="3.5" />
                  {injTotal > 0 && <circle cx={kx + 24} cy={ky - 24} r="11" fill="var(--coral)" stroke="#fff" strokeWidth="2.5" />}
                  {injTotal > 0 && <text x={kx + 24} y={ky - 20} textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontSize="12" fontWeight="700" fill="#fff">{injTotal}</text>}
                  <text x={kx} y={ky + 6} textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontSize="22" fontWeight="700" fill="#fff">{reports.length}</text>
                  <text x={kx} y={ky + 56} textAnchor="middle" fontFamily="Hanken Grotesk, sans-serif" fontSize="14" fontWeight="700" fill="var(--green)">Kathmandu Valley</text>
                  <text x={kx} y={ky + 74} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="11" fill="#6f8389">tap to explore →</text>
                </g>
              )}
            </g>
          )}

          {/* ---------- VALLEY HEATMAP ---------- */}
          {!national && layer === "heat" && reports.map((r: any) => {
            const [x, y] = VALLEY_PROJ.project(r.lng, r.lat);
            return <circle key={"h" + r.id} cx={x} cy={y - 10} r={r.injured ? 64 : 48} fill="url(#heatG)" />;
          })}

          {/* ---------- VALLEY CLUSTERS ---------- */}
          {cluster && layer !== "heat" && WARDS.map(w => {
            const list = byWard[w.name] || [];
            if (!list.length) return null;
            const [x, y] = VALLEY_PROJ.project(w.lng, w.lat);
            const inj = list.filter((r: any) => r.injured).length;
            const rad = 17 + Math.min(list.length, 26) * 0.95;
            return (
              <g key={"c" + w.id} style={{ cursor: "pointer" }} onClick={() => { onWard(w); setZoom(2); }}>
                <circle cx={x} cy={y} r={rad + 6} fill="#157d8f" opacity="0.12" />
                <circle cx={x} cy={y} r={rad} fill="#157d8f" stroke="#fff" strokeWidth="3" />
                {inj > 0 && <circle cx={x + rad * 0.7} cy={y - rad * 0.7} r="9" fill="var(--coral)" stroke="#fff" strokeWidth="2" />}
                <text x={x} y={y + 5} textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontSize="17" fontWeight="700" fill="#fff">{list.length}</text>
              </g>
            );
          })}

          {/* ---------- VALLEY INDIVIDUAL MARKERS ---------- */}
          {!national && !cluster && layer !== "heat" && reports.map((r: any) => {
            const [x, y] = VALLEY_PROJ.project(r.lng, r.lat);
            return (
              <g key={r.id} transform={`translate(${x},${y}) scale(${1 / z})`} style={{ cursor: "pointer" }} onClick={() => onSelect(r.id)}>
                <PinShape r={r} sel={selectedId === r.id} />
              </g>
            );
          })}
        </g>
      </svg>

      {!national && <NepalInset onClick={() => setZoom(0)} />}

      <div className="zoomctl">
        <button onClick={() => setZoom(Math.min(3, zoom + 1))} disabled={zoom === 3} title="Zoom in"><Icon name="plus" size={18} /></button>
        <button onClick={() => setZoom(Math.max(0, zoom - 1))} disabled={zoom === 0} title="Zoom out"><span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>−</span></button>
      </div>

      <div className="legend map-panel">
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)", marginBottom: 2 }}>Species</div>
        {Object.keys(SPECIES).map(k => (
          <div key={k} className="lg"><i style={{ background: SPECIES[k].hex }}></i>{SPECIES[k].label}</div>
        ))}
        <div className="lg" style={{ marginTop: 4 }}><i style={{ background: "var(--coral)" }}></i>Injured (pulsing)</div>
      </div>
    </div>
  );
}

/* Static valley map for the submit-report pin picker */
export function ValleyPicker({ pin, species, onPick }: any) {
  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid slice" style={{ width: "100%", height: "100%" }}
      onClick={e => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const sx = ((e.clientX - rect.left) / rect.width) * MAP_W;
        const sy = ((e.clientY - rect.top) / rect.height) * MAP_H;
        const [lng, lat] = VALLEY_PROJ.invert(sx, sy);
        onPick({ lng, lat });
      }}>
      <ValleyBase />
      {pin && (() => { const [x, y] = VALLEY_PROJ.project(pin.lng, pin.lat); return <g transform={`translate(${x},${y})`}><PinShape r={{ species, injured: false }} sel /></g>; })()}
    </svg>
  );
}

export function nearestWardLL(lng: number, lat: number) {
  let best: any = WARDS[0], bd = Infinity;
  WARDS.forEach(w => { const d = (w.lng - lng) ** 2 + (w.lat - lat) ** 2; if (d < bd) { bd = d; best = w; } });
  return best;
}
