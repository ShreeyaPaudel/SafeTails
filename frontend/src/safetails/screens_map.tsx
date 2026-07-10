// @ts-nocheck - verbatim port of the SafeTails design reference (authored without strict typing)
/* ============================================================
   SafeTails - Map dashboard, Submit report, Report detail
   ============================================================ */
import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Icon } from "./icons";
import {
  Avatar, Ph, Photo, Gallery, SpeciesChip, StatusChip, InjuredTag, Toggle,
  SpeciesAIPanel, InjuryAIPanel, TrustAIPanel, AISummary, LikeButton, ConfirmButton,
} from "./components";
import { SPECIES, STATUS, WARDS, AV } from "./data";
import { LiveMap, PinPickerMap } from "./RealMap";
import { useStore } from "./store";
import { colorFor } from "./adapt";
import { ModerationBreakdown } from "./screens_myreports";
import { api } from "@/lib/api";

function withinWindow(r: any, win: string) {
  if (win === "all") return true;
  const mins = r.mins ?? 0;
  return mins <= parseInt(win) * 60; // win is hours
}

/* ---------------- Real location search (live geocoding suggestions) ---------------- */
const KTM_VIEWBOX = "85.16,27.84,85.58,27.55"; // lng,lat,lng,lat - Kathmandu Valley
function MapSearch({ onPick, width = 340 }: any) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: any) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (q.trim().length < 3) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&bounded=1&viewbox=${KTM_VIEWBOX}&q=${encodeURIComponent(q)}`;
        const r = await fetch(url, { headers: { "Accept-Language": "en" } });
        const j = await r.json();
        setResults(Array.isArray(j) ? j : []); setOpen(true);
      } catch (e) { /* ignore network errors */ }
      setLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const choose = (it: any) => { onPick({ lat: +it.lat, lng: +it.lon, label: it.display_name }); setQ(it.display_name.split(",")[0]); setOpen(false); };
  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error("Geolocation not available"); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => onPick({ lat: p.coords.latitude, lng: p.coords.longitude, label: "Your location" }),
      () => toast.error("Couldn't get your location"), { enableHighAccuracy: true, timeout: 8000 });
  };

  return (
    <div ref={boxRef} style={{ position: "relative", width, pointerEvents: "auto" }}>
      <div className="row" style={{ gap: 8 }}>
        <div className="searchbox" style={{ flex: 1, width: "auto", background: "var(--card)", boxShadow: "var(--shadow-sm)" }}>
          <Icon name="search" size={16} />
          <input placeholder="Search a place - Thamel, Patan, Boudha…" value={q} onChange={e => setQ(e.target.value)} onFocus={() => results.length && setOpen(true)} />
          {loading && <Icon name="refresh" size={15} style={{ color: "var(--ink-4)" }} />}
          {!loading && q && <button onClick={() => { setQ(""); setResults([]); }} style={{ color: "var(--ink-4)", display: "flex" }}><Icon name="x" size={15} /></button>}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ background: "var(--card)", padding: 10 }} onClick={useMyLocation} title="Use my location"><Icon name="location" size={16} /></button>
      </div>
      {open && results.length > 0 && (
        <div className="card" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 1300, maxHeight: 280, overflow: "auto", padding: 6 }}>
          {results.map((it, i) => (
            <div key={i} className="check" onClick={() => choose(it)} style={{ alignItems: "flex-start", gap: 9 }}>
              <Icon name="pin" size={15} style={{ color: "var(--green)", marginTop: 2, flex: "0 0 15px" }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{it.display_name.split(",")[0]}</div>
                <div className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.display_name.split(",").slice(1, 4).join(",")}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Compact filter chips ---------------- */
// variant: "species" = solid fill in the species colour when on; "neutral" = simple gray;
//          "alert" = coral fill (injured).
function FilterChip({ on, color, label, count, onClick, variant = "species" }: any) {
  let style: any;
  if (variant === "neutral") {
    style = { borderColor: on ? "var(--ink-3)" : "var(--line-2)", background: on ? "var(--ink-2)" : "var(--card)", color: on ? "#fff" : "var(--ink-3)" };
  } else {
    const c = variant === "alert" ? "var(--coral)" : color;
    style = { borderColor: on ? c : "var(--line-2)", background: on ? c : "var(--card)", color: on ? "#fff" : "var(--ink-2)" };
  }
  return (
    <button onClick={onClick} className="chip" style={{ cursor: "pointer", fontWeight: 700, ...style }}>
      {variant !== "neutral" && <span className="dot" style={{ background: on ? "#fff" : (variant === "alert" ? "var(--coral)" : color) }}></span>}
      {label}
      {count != null && <span className="mono" style={{ fontSize: 10.5, opacity: 0.75 }}>{count}</span>}
    </button>
  );
}

function MapFilterBar({ f, setF, counts, total, shown, me }: any) {
  const speciesKeys = Object.keys(SPECIES);
  const toggleSp = (k: string) => setF((s: any) => ({ ...s, species: s.species.includes(k) ? s.species.filter((x: string) => x !== k) : [...s.species, k] }));
  const toggleSt = (k: string) => setF((s: any) => ({ ...s, statuses: s.statuses.includes(k) ? s.statuses.filter((x: string) => x !== k) : [...s.statuses, k] }));
  const reset = () => setF({ species: speciesKeys.slice(), injuredOnly: false, mine: false, statuses: ["active", "helping", "resolved"], time: "all", ward: "all" });
  return (
    <div className="map-panel" style={{ padding: 11, pointerEvents: "auto", display: "flex", flexDirection: "column", gap: 9, width: 380 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span style={{ fontSize: 12.5 }}><b style={{ color: "var(--green)" }}>{shown}</b> <span className="muted">of {total} shown</span></span>
        <button className="btn-sm" style={{ color: "var(--green)", fontWeight: 700, fontSize: 12 }} onClick={reset}>Reset</button>
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {speciesKeys.map(k => <FilterChip key={k} variant="species" on={f.species.includes(k)} color={SPECIES[k].hex} label={SPECIES[k].label} count={counts.species[k] || 0} onClick={() => toggleSp(k)} />)}
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {Object.keys(STATUS).map(k => <FilterChip key={k} variant="neutral" on={f.statuses.includes(k)} label={STATUS[k].label} count={counts.status[k] || 0} onClick={() => toggleSt(k)} />)}
        <FilterChip variant="alert" on={f.injuredOnly} label="Injured" count={counts.injured} onClick={() => setF((s: any) => ({ ...s, injuredOnly: !s.injuredOnly }))} />
        {me && <FilterChip variant="neutral" on={f.mine} label="My reports" onClick={() => setF((s: any) => ({ ...s, mine: !s.mine }))} />}
      </div>
      <div className="seg">
        {[["all", "All time"], ["168", "7 days"], ["24", "24h"], ["6", "6h"]].map(o => (
          <button key={o[0]} className={f.time === o[0] ? "on" : ""} onClick={() => setF((s: any) => ({ ...s, time: o[0] }))}>{o[1]}</button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Status control (owner can change lifecycle) ---------------- */
function StatusControl({ report }: any) {
  const { setReportStatus } = useStore();
  return (
    <div>
      <div className="section-title" style={{ marginBottom: 7 }}>Update status</div>
      <div className="seg">
        {/* Reports track an ongoing lifecycle (Active -> Being helped); there's no "resolved"
            option since users report ongoing incidents, not closed ones. */}
        {Object.keys(STATUS).filter(k => k !== "resolved").map(k => (
          <button key={k} className={report.status === k ? "on" : ""} onClick={() => setReportStatus(report.id, k)}
            style={report.status === k ? { color: STATUS[k].hex } : {}}>{STATUS[k].label}</button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Selected report side panel ---------------- */
function ReportPanel({ report, onClose, go }: any) {
  const { confirmReport, me, deleteReport } = useStore();
  const isOwner = me && report.reporterId === me.id;
  return (
    <div style={{ width: 372, flex: "0 0 372px", borderLeft: "1px solid var(--line)", background: "var(--card)", overflow: "auto" }} className="fade-in">
      <div style={{ position: "relative" }}>
        {report.image ? <img src={report.image} alt={report.species} style={{ width: "100%", height: 210, objectFit: "cover", display: "block" }} /> : <Ph sp={report.species} label={`${SPECIES[report.species].label} · ${report.ward}`} h={210} r={0} />}
        <button className="btn btn-ghost btn-sm" style={{ position: "absolute", top: 12, right: 12, padding: 8, borderRadius: 99 }} onClick={onClose}><Icon name="x" size={16} /></button>
        <div className="row" style={{ position: "absolute", left: 12, bottom: 12, gap: 6 }}>
          <SpeciesChip sp={report.species} sm />
          {report.injured && <InjuredTag sm />}
        </div>
      </div>
      <div style={{ padding: 18 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <StatusChip status={report.status} sm />
          <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}><Icon name="clock" size={12} style={{ verticalAlign: -2 }} /> {report.time}</span>
        </div>
        {report.trust === "held" && (
          <div className="ai-note" style={{ borderTop: "none", paddingTop: 10, color: "var(--gold-600)" }}>
            <Icon name="info" size={14} /><span>Held for peer confirmation - visible to you; publishes once neighbours confirm it.</span>
          </div>
        )}
        <p style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink)", margin: "14px 0" }}>{report.note || <span className="muted">No note added.</span>}</p>
        <div className="row" style={{ gap: 9, paddingBottom: 14, borderBottom: "1px solid var(--line)" }}>
          <div className="row" style={{ gap: 9, cursor: "pointer" }} onClick={() => go("user", report.reporterId)}>
            <Avatar name={report.reporter} color={report.reporterColor} size={32} avatar={report.reporterAvatar} />
            <div>
              <div className="link-name" style={{ fontWeight: 700, fontSize: 13.5 }}>{report.reporter}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>reputation {report.reporterRep}</div>
            </div>
          </div>
          <div style={{ flex: 1 }}></div>
          <span className="chip chip-sm"><Icon name="location" size={12} /> {report.ward}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
          <SpeciesAIPanel report={report} />
          <InjuryAIPanel report={report} />
        </div>

        <div style={{ marginTop: 16 }}>
          {isOwner ? <StatusControl report={report} /> : (
            <ConfirmButton report={report} isOwner={false} onConfirm={() => confirmReport(report.id)} full />
          )}
          <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 8 }} onClick={() => go("report", report.id)}>Full detail <Icon name="arrowRight" size={14} /></button>
          {isOwner && (
            <button className="btn btn-sm" style={{ width: "100%", marginTop: 8, color: "var(--coral-600)" }}
              onClick={async () => { if (confirm("Delete this report?")) { const ok = await deleteReport(report.id); if (ok) onClose(); } }}>
              <Icon name="x" size={14} /> Delete report
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Map dashboard ---------------- */
export function MapDashboard({ go, selectedId, setSelectedId }: any) {
  const { reports, me, stats } = useStore();
  const [f, setF] = useState({ species: Object.keys(SPECIES), injuredOnly: false, mine: false, statuses: ["active", "helping", "resolved"], time: "all", ward: "all" });
  const [layer, setLayer] = useState("markers");
  const [tileLayer, setTileLayer] = useState("standard");   // base map style
  const [flyTo, setFlyTo] = useState<any>(null);
  const [searchPin, setSearchPin] = useState<any>(null);

  const filtered = reports.filter((r: any) =>
    // Only published (verified) sightings appear on the map, so the pins match the DB-aggregate
    // count shown in the filter bar. Reports awaiting verification live in the Community Feed.
    (r.moderationState === "published" || !r.moderationState) &&
    f.species.includes(r.species) &&
    (!f.injuredOnly || r.injured) &&
    (!f.mine || (me && r.reporterId === me.id)) &&
    (f.ward === "all" || r.ward === f.ward) &&
    f.statuses.includes(r.status) &&
    withinWindow(r, f.time)
  );

  // Counts come from the shared DB aggregate (`stats`) so the map matches analytics/dispatch
  // exactly; fall back to the local list only before stats have loaded.
  const counts = {
    species: Object.keys(SPECIES).reduce((a: any, k) => (a[k] = stats?.by_species?.[SPECIES[k].label] ?? reports.filter((r: any) => r.species === k).length, a), {}),
    status: Object.keys(STATUS).reduce((a: any, k) => (a[k] = stats?.status?.[k === "helping" ? "being_helped" : k] ?? reports.filter((r: any) => r.status === k).length, a), {}),
    injured: stats?.injured ?? reports.filter((r: any) => r.injured).length,
  };
  const totalCount = stats?.total ?? reports.length;

  const selected = filtered.find((r: any) => r.id === selectedId);
  const onPickPlace = (ll: any) => { setFlyTo({ lat: ll.lat, lng: ll.lng, ts: Date.now() }); setSearchPin({ lat: ll.lat, lng: ll.lng }); };

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 0 }}>
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <div className="mapwrap">
          <LiveMap reports={filtered} selectedId={selectedId} onSelect={(id: any) => setSelectedId(id)} layer={layer} tileLayer={tileLayer} flyTo={flyTo} searchPin={searchPin} />

          {/* top overlay: search + filters (left) · layer toggle + count (right) */}
          <div className="map-overlay" style={{ top: 16, left: 16, right: 16, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, pointerEvents: "none" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <MapSearch onPick={onPickPlace} />
              <MapFilterBar f={f} setF={setF} counts={counts} total={totalCount} shown={filtered.length} me={me} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end", pointerEvents: "auto" }}>
              <div className="map-panel" style={{ padding: "6px 8px" }}>
                <select className="input area-select" style={{ minWidth: 170, padding: "7px 12px", fontSize: 12.5, border: "none", background: "transparent" }}
                  value={f.ward} onChange={(e: any) => { const w = e.target.value; setF((s: any) => ({ ...s, ward: w })); if (w !== "all") { const a: any = WARDS.find((x: any) => x.name === w); if (a) setFlyTo({ lat: a.lat, lng: a.lng, ts: Date.now() }); } }}>
                  <option value="all">All areas</option>
                  {WARDS.map((w: any) => <option key={w.id} value={w.name}>{w.name}</option>)}
                </select>
              </div>
              <div className="maptab">
                <button className={layer === "markers" ? "on" : ""} onClick={() => setLayer("markers")}><Icon name="pin" size={15} /> Markers</button>
                <button className={layer === "heat" ? "on" : ""} onClick={() => setLayer("heat")}><Icon name="heat" size={15} /> Heatmap</button>
              </div>
              <div className="maptab">
                {[["standard", "Standard"], ["satellite", "Satellite"], ["terrain", "Terrain"]].map(([k, lbl]) => (
                  <button key={k} className={tileLayer === k ? "on" : ""} onClick={() => setTileLayer(k)}>{lbl}</button>
                ))}
              </div>
            </div>
          </div>

          {/* compact legend (species + status) */}
          <div className="legend map-panel">
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--ink-3)", marginBottom: 2 }}>Species</div>
            {Object.keys(SPECIES).map(k => (
              <div key={k} className="lg"><i style={{ background: SPECIES[k].hex }}></i>{SPECIES[k].label}</div>
            ))}
            <div className="lg" style={{ marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--line)" }}><i style={{ background: "var(--coral)" }}></i>Injured (pulsing)</div>
          </div>
        </div>
      </div>

      {selected && <ReportPanel report={selected} onClose={() => setSelectedId(null)} go={go} />}
    </div>
  );
}

/* ---------------- Location search (OpenStreetMap geocoding) ---------------- */
const VIEWBOX = "85.18,27.815,85.53,27.56"; // Kathmandu Valley
export function LocationSearch({ onSelect }: any) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: any) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (q.trim().length < 3) { setResults([]); return; }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        // API: swap for your own geocoder if you prefer. Nominatim needs no key.
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&bounded=1&viewbox=${VIEWBOX}&q=${encodeURIComponent(q)}`;
        const r = await fetch(url, { headers: { "Accept-Language": "en" } });
        const j = await r.json();
        setResults(Array.isArray(j) ? j : []);
        setOpen(true);
      } catch (e) { toast.error("Location search failed"); }
      setLoading(false);
    }, 450);
    return () => clearTimeout(t);
  }, [q]);

  const choose = (it: any) => {
    onSelect({ lat: +it.lat, lng: +it.lon, label: it.display_name });
    setQ(it.display_name.split(",")[0]);
    setOpen(false);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error("Geolocation not available"); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude: lat, longitude: lng } = p.coords;
        if (lat < 27.5 || lat > 27.86 || lng < 85.14 || lng > 85.56) { toast("You appear to be outside the Kathmandu Valley - drop a pin manually."); return; }
        onSelect({ lat, lng, label: "Your current location" });
        toast.success("Using your current location");
      },
      () => toast.error("Couldn't get your location"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div ref={boxRef} style={{ position: "relative", marginBottom: 12 }}>
      <div className="row" style={{ gap: 8 }}>
        <div className="searchbox" style={{ flex: 1, width: "auto" }}>
          <Icon name="search" size={16} />
          <input placeholder="Search a place - e.g. Patan Durbar Square, Boudha…" value={q} onChange={e => setQ(e.target.value)} onFocus={() => results.length && setOpen(true)} />
          {loading && <Icon name="refresh" size={15} style={{ color: "var(--ink-4)" }} />}
          {!loading && q && <button onClick={() => { setQ(""); setResults([]); }} style={{ color: "var(--ink-4)", display: "flex" }}><Icon name="x" size={15} /></button>}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={useMyLocation} title="Use my location"><Icon name="location" size={16} /></button>
      </div>
      {open && results.length > 0 && (
        <div className="card" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 2000, maxHeight: 260, overflow: "auto", padding: 6, boxShadow: "var(--shadow-lg)" }}>
          {results.map((it, i) => (
            <div key={i} className="check" onClick={() => choose(it)} style={{ alignItems: "flex-start", gap: 9 }}>
              <Icon name="pin" size={15} style={{ color: "var(--green)", marginTop: 2, flex: "0 0 15px" }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{it.display_name.split(",")[0]}</div>
                <div className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.display_name.split(",").slice(1, 4).join(",")}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Submit report flow ---------------- */
export function SubmitReport({ go }: any) {
  const { addReport, nearestWardLL, isAuthed, me, saveDefaultLocation, settings } = useStore();
  const aiRecommend = settings?.aiRecommend !== false;
  const [step, setStep] = useState(1);
  const [pin, setPin] = useState<any>(null);
  const [center, setCenter] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [species, setSpecies] = useState("dog");
  const [status, setStatus] = useState("active");
  const [injured, setInjured] = useState(false);
  const [note, setNote] = useState("");
  const [injuryNote, setInjuryNote] = useState("");
  const [files, setFiles] = useState<any[]>([]);   // all selected photos (first = main / AI-analysed)
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<any>(null);  // the report we just submitted (to focus on the map)
  const [ai, setAi] = useState<any>(null);  // real CNN result for the AI-review step
  const [aiInjury, setAiInjury] = useState<any>(null);  // real AI injury result (+ error reason)
  const previews = React.useMemo(() => files.map((f: any) => URL.createObjectURL(f)), [files]);
  const file = files[0] || null;                    // the main image the AI analyses
  const preview = previews[0] || "";

  // Default the report location to the user's saved home area (they can still move the pin).
  // Falls back to no pin when they haven't set one.
  useEffect(() => {
    if (!pin && me?.default_lat != null && me?.default_lng != null) {
      setPin({ lat: me.default_lat, lng: me.default_lng });
      setCenter({ lat: me.default_lat, lng: me.default_lng });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.default_lat, me?.default_lng]);

  const onFile = (e: any) => {
    const picked = Array.from(e.target.files || []) as any[];
    if (!picked.length) return;
    setFiles(prev => [...prev, ...picked].slice(0, 5));  // up to 5 photos
    setAi(null); setAiInjury(null);
    e.target.value = "";  // allow re-selecting the same file
  };
  const removeImage = (i: number) => setFiles(prev => prev.filter((_, idx) => idx !== i));

  const ward = pin ? nearestWardLL(pin.lng, pin.lat) : null;

  // "Near me": use a saved default location, else request browser geolocation permission.
  const useNearMe = () => {
    if (me?.default_lat != null && me?.default_lng != null) {
      setPin({ lat: me.default_lat, lng: me.default_lng });
      setCenter({ lat: me.default_lat, lng: me.default_lng });
      toast("Using your saved default location.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Location isn't available here - pick a spot on the map.");
      return;
    }
    toast("Requesting your location...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setPin({ lat: latitude, lng: longitude });
        setCenter({ lat: latitude, lng: longitude });
        toast.success("Location found.");
      },
      () => toast.error("Location permission denied - pick a spot on the map instead."),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  // Build the panel report from the REAL model output (lowercase species keys).
  const probsObj: any = {};
  Object.keys(SPECIES).forEach(k => { probsObj[k] = 0; });
  if (ai?.all_class_probs) {
    Object.entries(ai.all_class_probs).forEach(([k, v]: any) => {
      const lk = k.toLowerCase();
      if (lk in probsObj) probsObj[lk] = v;
    });
  }
  // Injury panel from the REAL AI result when available; otherwise reflect the human toggle.
  const injuryPanel = aiInjury && !aiInjury.error
    ? { injured: !!aiInjury.injured, confidence: aiInjury.confidence ?? (aiInjury.injured ? 0.8 : 0.9), rationale: aiInjury.rationale || "", severity: aiInjury.severity_hint || (aiInjury.injured ? "moderate" : "none") }
    : injured
      ? { injured: true, confidence: 0.8, rationale: aiInjury?.error ? `You marked this as injured. (AI: ${aiInjury.error})` : "You marked this animal as injured.", severity: "moderate" }
      : { injured: false, confidence: 0.9, rationale: aiInjury?.error ? `AI injury check unavailable: ${aiInjury.error}` : "No injury indicated.", severity: "none" };
  const aiReport = {
    species,
    injured,
    conf: ai?.confidence ?? 0,
    speciesGuess: ai?.label ?? "Unverified",
    unverified: !ai || ai.label === "Unverified" || (ai.confidence ?? 0) < 0.7,
    probs: probsObj,
    aiInjury: injuryPanel,
  };

  // Run the in-house CNN (species) + AI injury assessment, surfacing real errors (no silent fail).
  const runAnalysis = async () => {
    if (!file) { toast.error("Add a photo first."); return; }
    setStep(2);
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await api.assess(fd);
      setAi(res.species);
      setAiInjury(res.injury);
      // Default the species selector to the model's top class.
      const lower: any = {};
      Object.keys(SPECIES).forEach(k => { lower[k] = 0; });
      Object.entries(res.species.all_class_probs || {}).forEach(([k, v]: any) => { const lk = k.toLowerCase(); if (lk in lower) lower[lk] = v; });
      const top = Object.keys(lower).reduce((a, b) => (lower[b] > lower[a] ? b : a), "dog");
      // Only auto-apply the AI's suggestions when AI recommendations are enabled (Settings).
      if (aiRecommend) setSpecies(top);
      if (!res.species.model_available) toast("Species model not loaded - you can still set the species manually.");
      // Injury: surface the real error, or sync the toggle to the AI's finding.
      if (res.injury?.error) {
        toast.error(`Injury analysis: ${res.injury.error}`);
      } else if (res.injury?.injured && aiRecommend) {
        setInjured(true);
        toast(`AI flagged possible injury (${res.injury.severity_hint || "unknown severity"}).`, { icon: "⚠️" });
      }
    } catch (e: any) {
      toast.error(e?.message || "Could not analyze the image. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const submit = async () => {
    if (!isAuthed) { toast("Please log in to submit a report."); go("login"); return; }
    setBusy(true);
    try {
      const fullNote = injured && injuryNote.trim()
        ? `${note}${note ? "\n" : ""}[Injury - reporter] ${injuryNote.trim()}`
        : note;
      const r = await addReport({ species, status, injured, note: fullNote, pin, ward, files });
      if (r) { setCreated(r); setStep(3); }
    } catch (e: any) {
      toast.error(e?.message || "Submission failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page wide">
      <button className="btn btn-ghost btn-sm" onClick={() => (window.history.length > 1 ? window.history.back() : go("map"))} style={{ marginBottom: 18 }}><Icon name="chevLeft" size={15} /> Back</button>
      <h1 style={{ fontSize: 30 }}>Report a sighting</h1>
      <p className="muted" style={{ marginTop: 6, fontSize: 14.5 }}>Photo and a generalised pin - that's all. We strip EXIF and never show your exact GPS.</p>

      {/* stepper */}
      <div className="row" style={{ gap: 0, margin: "26px 0 22px" }}>
        {["Photo & location","AI review","Confirm"].map((s, i) => {
          const n = i + 1, done = step > n, active = step === n;
          return (
            <React.Fragment key={i}>
              <div className="row" style={{ gap: 9 }}>
                <div style={{ width: 28, height: 28, borderRadius: 99, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13, background: done ? "var(--green)" : active ? "var(--green-50)" : "var(--paper-2)", color: done ? "#fff" : active ? "var(--green)" : "var(--ink-4)", border: active ? "2px solid var(--green)" : "none" }}>
                  {done ? <Icon name="checkSmall" size={14} /> : n}
                </div>
                <span style={{ fontWeight: 600, fontSize: 13.5, color: active || done ? "var(--ink)" : "var(--ink-4)" }}>{s}</span>
              </div>
              {i < 2 && <div style={{ flex: 1, height: 2, background: step > n ? "var(--green)" : "var(--line)", margin: "0 14px" }}></div>}
            </React.Fragment>
          );
        })}
      </div>

      {step === 1 && (
        <div className="grid-2 fade-in" style={{ alignItems: "start" }}>
          <div className="card card-pad">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <div className="section-title">Photos</div>
              <span className="muted" style={{ fontSize: 12 }}>{files.length}/5 · first is analysed by AI</span>
            </div>
            <label style={{ position: "relative", border: "2px dashed var(--line-2)", borderRadius: 14, overflow: "hidden", display: "block", cursor: "pointer" }}>
              <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onFile} />
              {preview
                ? <img src={preview} alt="main" style={{ width: "100%", height: 220, objectFit: "cover", display: "block" }} />
                : <Ph sp={species} label="add photos - tap or drop (up to 5)" h={220} r={0} />}
              {preview && <span className="chip chip-sm" style={{ position: "absolute", top: 10, left: 10, background: "var(--green)", color: "#fff", border: "none", fontWeight: 700 }}><Icon name="sparkle" size={11} /> Main · AI</span>}
            </label>
            {files.length > 0 && (
              <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                {previews.map((src: string, i: number) => (
                  <div key={i} style={{ position: "relative", width: 62, height: 62, borderRadius: 10, overflow: "hidden", border: i === 0 ? "2px solid var(--green)" : "1px solid var(--line)" }}>
                    <img src={src} alt={`photo ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button onClick={(e) => { e.preventDefault(); removeImage(i); }} style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 99, background: "rgba(0,0,0,.6)", color: "#fff", border: "none", display: "grid", placeItems: "center", cursor: "pointer", fontSize: 11 }}>×</button>
                  </div>
                ))}
                {files.length < 5 && (
                  <label style={{ width: 62, height: 62, borderRadius: 10, border: "1.5px dashed var(--line-2)", display: "grid", placeItems: "center", cursor: "pointer", color: "var(--ink-4)" }}>
                    <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={onFile} /><Icon name="plus" size={18} />
                  </label>
                )}
              </div>
            )}
            <div className="ai-note" style={{ borderTop: "none", paddingTop: 12 }}><Icon name="shield" size={14} /><span>The first photo is analysed by the AI; the rest are shown in the report gallery. EXIF & camera metadata are stripped on upload.</span></div>
          </div>

          <div className="card card-pad">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
              <div className="section-title">Where did you see it?</div>
              <span className="muted" style={{ fontSize: 12 }}>search · pin · or GPS</span>
            </div>
            <LocationSearch onSelect={(ll: any) => { setPin({ lng: ll.lng, lat: ll.lat }); setCenter({ lat: ll.lat, lng: ll.lng }); }} />
            <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)", height: 260, position: "relative" }}>
              <div className="leaflet-fill preview"><PinPickerMap pin={pin} species={species} center={center} onPick={setPin} /></div>
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              <button className="chip chip-sm" style={{ cursor: "pointer", fontWeight: 700, color: "var(--green)", borderColor: "var(--green-200)", background: "var(--green-50)" }} onClick={useNearMe}>
                <Icon name="location" size={12} /> Near me
              </button>
              <span className="muted" style={{ fontSize: 12, margin: "0 2px" }}>·</span>
              {["Thamel","Patan","Boudha","Jawalakhel","Kalanki","Bhaktapur"].map(n => {
                const a: any = WARDS.find((w: any) => w.name === n);
                if (!a) return null;
                return <button key={n} className="chip chip-sm" style={{ cursor: "pointer" }} onClick={() => { setPin({ lng: a.lng, lat: a.lat }); setCenter({ lat: a.lat, lng: a.lng }); }}>{n}</button>;
              })}
            </div>
            {pin && isAuthed && (
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
                onClick={() => saveDefaultLocation(pin.lat, pin.lng, ward?.name)}>
                <Icon name="pin" size={13} /> Save this as my default location
              </button>
            )}
            {ward ? (
              <div className="row" style={{ marginTop: 12, gap: 8, padding: "10px 12px", background: "var(--green-50)", borderRadius: 10 }}>
                <Icon name="location" size={15} style={{ color: "var(--green)" }} />
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>Generalised area: <b>{ward.name}</b> · {ward.np}</span>
                <span className="chip chip-sm" style={{ marginLeft: "auto" }}>~100m grid</span>
              </div>
            ) : <div className="muted" style={{ marginTop: 12, fontSize: 13 }}>Search a place, tap <b>Quick</b>, use GPS, or click the map to place your pin.</div>}
          </div>

          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 12 }}>
            {(!pin || !file) && <span className="muted" style={{ fontSize: 12.5 }}>{!file ? "Add a photo" : "Drop a location pin"} to continue</span>}
            <button className="btn btn-primary" disabled={!pin || !file} onClick={runAnalysis}><Icon name="sparkle" size={17} /> Run AI review</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="fade-in">
          {analyzing ? (
            <div className="card card-pad" style={{ textAlign: "center", padding: "56px 20px" }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--green)", color: "#fff", display: "grid", placeItems: "center", margin: "0 auto 16px" }} className="pop"><Icon name="sparkle" size={28} /></div>
              <h3 style={{ fontSize: 19 }}>Analyzing your photo…</h3>
              <p className="muted" style={{ fontSize: 14, marginTop: 8 }}>SafeTails CNN is classifying the species and the AI is checking for injury</p>
              <div className="conf-bar" style={{ maxWidth: 280, margin: "20px auto 0" }}><i style={{ width: "70%", animation: "none" }}></i></div>
            </div>
          ) : (
            <div className="grid-2" style={{ alignItems: "start" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {preview && (
                  <div className="card" style={{ overflow: "hidden" }}>
                    <img src={preview} alt="analyzed" style={{ width: "100%", maxHeight: 280, objectFit: "cover", display: "block" }} />
                    <div className="ai-note" style={{ borderTop: "none", paddingTop: 10 }}><Icon name="sparkle" size={13} style={{ color: "var(--green)" }} /><span>This is the exact image the AI analyzed.</span></div>
                  </div>
                )}
                <SpeciesAIPanel report={aiReport} />
                <InjuryAIPanel report={aiReport} />
                <TrustAIPanel report={{ trust: "published" }} />
              </div>
              <div className="card card-pad">
                <div className="section-title" style={{ marginBottom: 12 }}>Confirm or correct</div>
                <div className="field">
                  <label>Species <span className="mono" style={{ color: "var(--green)", fontWeight: 600 }}>· AI: {ai?.label ?? "…"}{ai?.confidence != null ? ` ${Math.round(ai.confidence * 100)}%` : ""}</span></label>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                    {Object.keys(SPECIES).map(k => (
                      <button key={k} onClick={() => setSpecies(k)} className={"chip"} style={{ justifyContent: "center", padding: "9px", cursor: "pointer", borderColor: species === k ? "var(--green)" : "var(--line)", background: species === k ? "var(--green-50)" : "var(--paper-2)", color: species === k ? "var(--green)" : "var(--ink-2)", fontWeight: 700 }}>
                        <span className={"dot dot-" + k}></span>{SPECIES[k].label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field">
                  <label>Status</label>
                  <div className="seg">
                    {/* Reports are ongoing incidents: only Active / Being helped (no "resolved"). */}
                    {Object.keys(STATUS).filter(k => k !== "resolved").map(k => <button key={k} className={status === k ? "on" : ""} onClick={() => setStatus(k)}>{STATUS[k].label}</button>)}
                  </div>
                </div>
                <div className="check" onClick={() => setInjured(v => !v)} style={{ paddingLeft: 0, marginBottom: 12 }}>
                  <Toggle on={injured} />
                  <span style={{ marginLeft: 4 }}>Looks injured / in distress</span>
                </div>
                {injured && (
                  <div className="field">
                    <label className="row" style={{ gap: 6 }}><Icon name="cross" size={13} style={{ color: "var(--coral)" }} /> Injury details <span className="muted" style={{ fontWeight: 600 }}>· your observation (overrides the AI estimate)</span></label>
                    <textarea className="input" placeholder="e.g. limping on the back-left leg, open wound, can't stand…" value={injuryNote} onChange={e => setInjuryNote(e.target.value)} style={{ minHeight: 64, borderColor: "var(--coral-100)" }}></textarea>
                    <div className="ai-note" style={{ borderTop: "none", paddingTop: 6 }}><Icon name="info" size={13} /><span>The AI gives an automatic injury estimate; what you write here is the human-verified detail responders see first.</span></div>
                  </div>
                )}
                <div className="field">
                  <label>Add a note</label>
                  <textarea className="input" placeholder="What did you see? Any details that could help…" value={note} onChange={e => setNote(e.target.value)}></textarea>
                </div>
                <div className="row" style={{ gap: 8, marginTop: 4 }}>
                  <button className="btn btn-ghost" onClick={() => setStep(1)} disabled={busy}><Icon name="chevLeft" size={15} /> Back</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={submit} disabled={busy}>{busy ? "Submitting…" : "Submit report"} <Icon name="arrowRight" size={16} /></button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && (() => {
        const published = (created?.moderationState || created?.trust) === "published" || created?.trust === "published";
        const injured = !!created?.injured;
        const aiAgree = created?.userSpeciesLabel && created?.aiSpeciesLabel && created?.aiSpeciesLabel !== "Unverified" && created?.userSpeciesLabel === created?.aiSpeciesLabel;
        const base = injured ? 20 : 10;      // injury_report vs valid_report
        const earned = base + (aiAgree ? 5 : 0);
        return (
        <div className="card card-pad fade-in" style={{ textAlign: "center", padding: "48px 28px", maxWidth: 540, margin: "0 auto" }}>
          <div style={{ width: 64, height: 64, borderRadius: 99, background: published ? "var(--green-50)" : "var(--gold-50)", color: published ? "var(--green)" : "var(--gold-600)", display: "grid", placeItems: "center", margin: "0 auto 18px" }} className="pop"><Icon name={published ? "check" : "clock"} size={32} /></div>
          <h2 style={{ fontSize: 26 }}>{published ? "Report published!" : "Report submitted"}</h2>
          <p className="muted" style={{ fontSize: 15, marginTop: 8 }}>
            {published
              ? (injured ? "Emergency reports publish immediately so help can reach them fast." : "Your reputation is high enough that this published immediately - no waiting for confirmation.")
              : "It's awaiting community verification and will publish as soon as one member confirms it. You'll earn your points then."}
          </p>
          <div className="row" style={{ justifyContent: "center", gap: 12, margin: "24px 0", flexWrap: "wrap" }}>
            {published ? (
              <>
                <div className="chip" style={{ background: "var(--gold-50)", borderColor: "var(--gold-200)", color: "var(--gold-600)", fontWeight: 800, fontSize: 14, padding: "8px 16px" }}><Icon name="zap" size={15} /> +{earned} points</div>
                {aiAgree && <div className="chip" style={{ background: "var(--green-50)", borderColor: "var(--green-200)", color: "var(--green)", fontWeight: 700, fontSize: 13, padding: "8px 14px" }}><Icon name="check" size={14} /> incl. +5 AI-agreement bonus</div>}
              </>
            ) : (
              <div className="chip" style={{ background: "var(--gold-50)", borderColor: "var(--gold-200)", color: "var(--gold-600)", fontWeight: 800, fontSize: 14, padding: "8px 16px" }}><Icon name="clock" size={15} /> Earns +{base} points once verified</div>
            )}
          </div>
          <div className="row" style={{ gap: 10, justifyContent: "center" }}>
            <button className="btn btn-ghost" onClick={() => { setStep(1); setPin(null); setNote(""); setInjuryNote(""); setInjured(false); setFiles([]); setAi(null); setAiInjury(null); }}>Report another</button>
            <button className="btn btn-primary" onClick={() => go("map", created?.id)}><Icon name="map" size={16} /> See it on the map</button>
          </div>
        </div>
        );
      })()}
    </div>
  );
}

/* ---------------- Coordination chat (reporter <-> accepted helpers) ---------------- */
function ChatPanel({ reportId, me, go }: any) {
  const [data, setData] = useState<any>(null);   // null until a successful load (hidden for non-participants)
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<any>(null);

  useEffect(() => {
    if (!me || !reportId) return;
    let on = true;
    const load = async () => { try { const d = await api.messages(reportId); if (on) setData(d); } catch { /* not a participant */ } };
    load();
    const iv = setInterval(load, 6000);   // near-real-time polling
    return () => { on = false; clearInterval(iv); };
  }, [reportId, me]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [data?.messages?.length]);

  if (!me || !data || !data.can_chat) return null;
  const others = (data.participants || []).filter((p: any) => p.id !== me.id);
  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try { const d = await api.sendMessage(reportId, text.trim()); setData(d); setText(""); }
    catch (e: any) { toast.error(e?.message || "Couldn't send message"); }
    finally { setBusy(false); }
  };

  return (
    <div className="card card-pad" style={{ marginTop: 16 }}>
      <div className="row" style={{ gap: 8, marginBottom: 4 }}>
        <Icon name="comment" size={16} style={{ color: "var(--green)" }} />
        <b style={{ fontFamily: "var(--ff-display)", fontSize: 15 }}>Coordination chat</b>
        <span className="chip chip-sm" style={{ marginLeft: "auto" }}>{data.participants.length} in thread</span>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>
        {others.length ? <>With {others.map((p: any) => `${p.name} (${p.role})`).join(", ")}</> : "Waiting for a helper to be accepted."}
      </p>
      <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: "4px 2px" }}>
        {data.messages.length ? data.messages.map((m: any) => {
          const mine = m.sender_id === me.id;
          return (
            <div key={m.id} className="row" style={{ gap: 8, alignItems: "flex-start", flexDirection: mine ? "row-reverse" : "row" }}>
              <Avatar name={m.sender_name} color={colorFor(m.sender_id)} size={28} avatar={m.sender_avatar} />
              <div style={{ maxWidth: "72%" }}>
                <div style={{ background: mine ? "var(--green)" : "var(--paper-2)", color: mine ? "#fff" : "var(--ink)", borderRadius: 12, padding: "8px 12px", fontSize: 13.5, lineHeight: 1.45 }}>{m.body}</div>
                <div className="muted" style={{ fontSize: 10.5, marginTop: 3, textAlign: mine ? "right" : "left" }}>{mine ? "You" : m.sender_name.split(" ")[0]} · {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          );
        }) : <div className="muted" style={{ fontSize: 13, textAlign: "center", padding: "16px 0" }}>No messages yet. Say hello and coordinate the rescue.</div>}
        <div ref={endRef} />
      </div>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <input className="input" placeholder="Type a message..." value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} />
        <button className="btn btn-primary btn-sm" onClick={send} disabled={busy || !text.trim()}><Icon name="arrowRight" size={15} /></button>
      </div>
    </div>
  );
}

/* Responsible-AI feedback: let anyone tell us whether an AI result was right. Feeds model-quality
   tracking and signals to the user that AI outputs are corrigible. */
function AIFeedback({ reportId }: any) {
  const [votes, setVotes] = useState<any>({});   // target -> "up"|"down"
  const [counts, setCounts] = useState<any>({});
  const send = async (target: "species" | "injury", agree: boolean) => {
    setVotes((v: any) => ({ ...v, [target]: agree ? "up" : "down" }));
    try {
      const r = await api.aiFeedback(reportId, target, agree);
      setCounts((c: any) => ({ ...c, [target]: { agree: r.agree, disagree: r.disagree } }));
      toast.success("Thanks - your feedback helps improve the AI.");
    } catch (e: any) { toast.error(e?.message || "Couldn't record feedback"); }
  };
  const Row = ({ target, label }: any) => (
    <div className="row" style={{ justifyContent: "space-between", padding: "8px 0", gap: 8 }}>
      <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>Was the AI {label} right?</span>
      <div className="row" style={{ gap: 6 }}>
        <button className="btn btn-ghost btn-sm" style={{ padding: "4px 9px", color: votes[target] === "up" ? "var(--green)" : "var(--ink-3)" }} onClick={() => send(target, true)}><Icon name="thumb" size={14} /> Yes</button>
        <button className="btn btn-ghost btn-sm" style={{ padding: "4px 9px", color: votes[target] === "down" ? "var(--coral-600)" : "var(--ink-3)", transform: "scaleY(-1)" }} onClick={() => send(target, false)}><Icon name="thumb" size={14} /></button>
        {counts[target] && <span className="mono muted" style={{ fontSize: 11 }}>{counts[target].agree}/{counts[target].agree + counts[target].disagree}</span>}
      </div>
    </div>
  );
  return (
    <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--paper-2)", borderRadius: 12 }}>
      <div className="row" style={{ gap: 7, marginBottom: 2, color: "var(--ink-3)" }}><Icon name="sparkle" size={13} /><span className="section-title" style={{ fontSize: 11 }}>Help improve the AI</span></div>
      <Row target="species" label="species guess" />
      <Row target="injury" label="injury check" />
    </div>
  );
}

/* ---------------- Full report detail ---------------- */
export function ReportDetail({ id, go }: any) {
  const { reports, toggleLike, isLiked, addComment, loadComments, confirmReport, flagReport, shareReport, me, setReportStatus, setReportSpecies, deleteReport, settings, isSaved, toggleSave } = useStore();
  const report = reports.find((r: any) => r.id === id) || reports[0];
  const [text, setText] = useState("");
  const [conf, setConf] = useState<any>(null);   // who confirmed / flagged this report
  const [modInfo, setModInfo] = useState<any>(null);  // owner-only moderation breakdown
  const isOwner = me && report && report.reporterId === me.id;
  useEffect(() => { if (report?.id) loadComments(report.id); }, [report?.id]);
  useEffect(() => {
    if (!report?.id) return;
    api.confirmations(report.id).then(setConf).catch(() => setConf(null));
  }, [report?.id, report?.confirmCount, report?.confirmedByMe]);
  // For the owner, pull the transparent anti-spam breakdown when the report isn't published.
  useEffect(() => {
    setModInfo(null);
    if (report?.id && isOwner && report.moderationState && report.moderationState !== "published") {
      api.getReport(report.id).then((r: any) => setModInfo(r?.moderation || null)).catch(() => {});
    }
  }, [report?.id, isOwner, report?.moderationState]);
  if (!report) {
    return (
      <div className="page wide">
        <button className="btn btn-ghost btn-sm" onClick={() => (window.history.length > 1 ? window.history.back() : go("map"))} style={{ marginBottom: 18 }}><Icon name="chevLeft" size={15} /> Back</button>
        <div className="card card-pad muted" style={{ textAlign: "center" }}>This report is no longer available.</div>
      </div>
    );
  }
  const liked = isLiked(report.id);
  const send = () => { if (text.trim()) { addComment(report.id, text); setText(""); } };
  return (
    <div className="page wide">
      <button className="btn btn-ghost btn-sm" onClick={() => (window.history.length > 1 ? window.history.back() : go("map"))} style={{ marginBottom: 18 }}><Icon name="chevLeft" size={15} /> Back</button>
      <div className="grid-2" style={{ gridTemplateColumns: "1.25fr 1fr", alignItems: "start" }}>
        <div className="card" style={{ overflow: "hidden" }}>
          <div style={{ position: "relative" }}>
            <Gallery report={report} h={340} r={0} label={`${SPECIES[report.species].label} - ${report.ward}`} />
            <div className="row" style={{ position: "absolute", left: 14, bottom: 14, gap: 6 }}>
              <SpeciesChip sp={report.species} />
              {report.injured && <InjuredTag />}
              <StatusChip status={report.status} />
            </div>
          </div>
          <div className="card-pad">
            <div className="row" style={{ gap: 7, marginBottom: 8 }}>
              <span className="chip chip-sm" style={{ background: "var(--paper-2)", fontWeight: 700 }}><Icon name="user" size={11} /> Reporter’s note</span>
              <span className="muted" style={{ fontSize: 11.5 }}>written by a human</span>
            </div>
            <p style={{ fontSize: 16, lineHeight: 1.55, color: "var(--ink)" }}>{report.note || <span className="muted">No note added.</span>}</p>
            <div className="row" style={{ gap: 10, margin: "16px 0", paddingBottom: 16, borderBottom: "1px solid var(--line)" }}>
              <div className="row" style={{ gap: 10, cursor: "pointer" }} onClick={() => go("user", report.reporterId)}>
                <Avatar name={report.reporter} color={report.reporterColor} size={38} avatar={report.reporterAvatar} />
                <div><div className="link-name" style={{ fontWeight: 700, fontSize: 14 }}>{report.reporter}</div><div className="mono muted" style={{ fontSize: 11.5 }}>reputation {report.reporterRep} · {report.time}</div></div>
              </div>
              <div style={{ flex: 1 }}></div>
              <span className="chip chip-sm"><Icon name="location" size={12} /> {report.ward} · ~100m</span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <LikeButton liked={liked} count={report.likes} onClick={() => toggleLike(report.id)} />
              <button className="btn btn-ghost btn-sm"><Icon name="comment" size={15} /> {report.commentCount ?? report.comments.length}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => shareReport(report.id)}><Icon name="share" size={15} /> Share</button>
              <button className="btn btn-ghost btn-sm" onClick={() => toggleSave(report.id)} style={{ color: isSaved(report.id) ? "var(--gold-600)" : undefined }}><Icon name="star" size={15} /> {isSaved(report.id) ? "Saved" : "Save"}</button>
              {!isOwner && !report.myVote && !report.confirmedByMe && (
                <button className="btn btn-ghost btn-sm" title="Report as spam or fake"
                  onClick={() => { if (confirm("Flag this report as spam or fake? Trusted flags help remove abuse.")) flagReport(report.id); }}
                  style={{ color: "var(--coral-600)" }}>
                  <Icon name="alert" size={15} /> Flag
                </button>
              )}
              {report.myVote && report.myVote !== "confirm" && <span className="chip chip-sm" style={{ background: "var(--coral-50)", color: "var(--coral-600)", border: "none", fontWeight: 700 }}><Icon name="alert" size={11} /> You flagged this</span>}
              <div style={{ flex: 1 }}></div>
              <ConfirmButton report={report} isOwner={isOwner} onConfirm={() => confirmReport(report.id)} />
            </div>

            {/* Owner-only: transparent multi-factor moderation breakdown when held/not published */}
            {isOwner && modInfo && report.moderationState !== "published" && (
              <div style={{ marginTop: 16 }}>
                <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                  <span className="chip chip-sm" style={{ background: report.moderationState === "rejected" ? "var(--coral-50)" : "var(--gold-50)", color: report.moderationState === "rejected" ? "var(--coral-600)" : "var(--gold-600)", border: "none", fontWeight: 700 }}>
                    <Icon name={report.moderationState === "rejected" ? "alert" : "clock"} size={11} /> {report.moderationState === "rejected" ? "Not published" : "Pending verification"}
                  </span>
                </div>
                <ModerationBreakdown moderation={modInfo} />
              </div>
            )}

            {/* Peer confirmations: who has vouched for this sighting */}
            {conf && (conf.confirm_count > 0 || conf.flag_count > 0) && (
              <div style={{ marginTop: 16, padding: "12px 14px", background: "var(--green-50)", borderRadius: 12, border: "1px solid var(--green-200)" }}>
                <div className="row" style={{ gap: 8 }}>
                  <Icon name="checkSmall" size={16} style={{ color: "var(--green)" }} />
                  <b style={{ fontSize: 13.5 }}>Confirmed by {conf.confirm_count} {conf.confirm_count === 1 ? "person" : "people"}</b>
                  {conf.confirmed_by_me && <span className="chip chip-sm" style={{ background: "var(--green)", color: "#fff", border: "none" }}>including you</span>}
                  {conf.flag_count > 0 && <span className="chip chip-sm" style={{ background: "var(--gold-50)", color: "var(--gold-600)", borderColor: "var(--gold-200)", marginLeft: "auto" }}><Icon name="alert" size={11} /> {conf.flag_count} flag{conf.flag_count === 1 ? "" : "s"}</span>}
                </div>
                {conf.confirmers.filter((c: any) => c.vote === "confirm").length > 0 && (
                  <div className="row" style={{ gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                    {conf.confirmers.filter((c: any) => c.vote === "confirm").slice(0, 10).map((c: any) => (
                      <span key={c.id} className="row" style={{ gap: 6, cursor: "pointer" }} onClick={() => go("user", c.id)} title={c.display_name}>
                        <Avatar name={c.display_name} color={colorFor(c.id)} size={24} avatar={c.avatar_url} />
                        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{c.display_name.split(" ")[0]}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* coordination chat (reporter <-> accepted helpers); hidden for non-participants */}
            <ChatPanel reportId={report.id} me={me} go={go} />

            {/* comments */}
            <div style={{ marginTop: 20 }}>
              <div className="section-title" style={{ marginBottom: 12 }}>Comments</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {report.comments.map((c: any, i: number) => (
                  <div key={i} className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                    <Avatar name={c.u} color={c.color || AV[i % AV.length]} size={30} avatar={c.avatar} />
                    <div style={{ background: "var(--paper-2)", borderRadius: 12, padding: "9px 13px", flex: 1 }}>
                      <div className="row" style={{ justifyContent: "space-between" }}><b style={{ fontSize: 13 }}>{c.u}</b><span className="muted" style={{ fontSize: 11 }}>{c.t}</span></div>
                      <p style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 3 }}>{c.c}</p>
                    </div>
                  </div>
                ))}
                {!report.comments.length && <div className="muted" style={{ fontSize: 13 }}>No comments yet - be the first.</div>}
              </div>
              <div className="row" style={{ gap: 8, marginTop: 14 }}>
                <input className="input" placeholder="Add a comment…" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") send(); }} />
                <button className="btn btn-primary" onClick={send}><Icon name="send" size={16} /></button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {isOwner && (
            <div className="card card-pad" style={{ border: "1px solid var(--green-200)", background: "var(--green-50)" }}>
              <div className="row" style={{ gap: 7, marginBottom: 10 }}>
                <Icon name="edit" size={15} style={{ color: "var(--green)" }} />
                <b style={{ fontFamily: "var(--ff-display)", fontSize: 15 }}>Manage your report</b>
                <span className="chip chip-sm" style={{ marginLeft: "auto", background: "var(--card)" }}>Human-in-the-loop</span>
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label>Status</label>
                <div className="seg">
                  {Object.keys(STATUS).map(k => (
                    <button key={k} className={report.status === k ? "on" : ""} onClick={() => setReportStatus(report.id, k)}
                      style={report.status === k ? { color: STATUS[k].hex } : {}}>{STATUS[k].label}</button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label>Correct the species <span className="mono muted" style={{ fontWeight: 600 }}>· AI said {report.speciesGuess}</span></label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                  {Object.keys(SPECIES).map(k => (
                    <button key={k} onClick={() => setReportSpecies(report.id, k)} className="chip" style={{ justifyContent: "center", padding: "8px", cursor: "pointer", borderColor: report.species === k ? "var(--green)" : "var(--line)", background: report.species === k ? "#fff" : "var(--card)", color: report.species === k ? "var(--green)" : "var(--ink-2)", fontWeight: 700 }}>
                      <span className={"dot dot-" + k}></span>{SPECIES[k].label}
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn btn-sm" style={{ width: "100%", marginTop: 14, background: "var(--coral-50)", color: "var(--coral-600)", border: "1px solid var(--coral-100)" }}
                onClick={async () => { if (confirm("Delete this report? This cannot be undone.")) { const ok = await deleteReport(report.id); if (ok) go("map"); } }}>
                <Icon name="x" size={15} /> Delete report
              </button>
            </div>
          )}
          {settings?.showAI !== false ? (
            <>
              <div className="row" style={{ gap: 7 }}>
                <Icon name="sparkle" size={15} style={{ color: "var(--green)" }} />
                <b style={{ fontFamily: "var(--ff-display)", fontSize: 15 }}>AI assessment</b>
                <span className="muted" style={{ fontSize: 11.5 }}>estimates - always correctable</span>
              </div>
              <SpeciesAIPanel report={report} />
              <InjuryAIPanel report={report} />
              <TrustAIPanel report={report} />
              {!isOwner && <AIFeedback reportId={report.id} />}
            </>
          ) : (
            <div className="card card-pad muted" style={{ fontSize: 12.5 }}>AI assessment panels are hidden (you can re-enable them in Settings - AI &amp; transparency).</div>
          )}
        </div>
      </div>
    </div>
  );
}
