// @ts-nocheck - verbatim port of the SafeTails design reference (authored without strict typing)
/* ============================================================
   SafeTails - Rescue & dispatch · Alerts · Settings
   ============================================================ */
import { useState, useEffect, useRef, useMemo } from "react";
import { toast } from "sonner";
import { Icon } from "./icons";
import { Avatar, SpeciesChip, StatusChip, StatCard, Toggle, Empty } from "./components";
import { WARDS, SPECIES, STATUS } from "./data";
import { useStore } from "./store";
import { api } from "@/lib/api";
import { colorFor } from "./adapt";
import { PinPickerMap } from "./RealMap";
import { LocationSearch } from "./screens_map";
import { useI18n, LANGS } from "./i18n";
import { useAppearance } from "./appearance";

const SEV: any = {
  severe:   { label: "Severe",   color: "var(--coral-600)", bg: "var(--coral-50)",  bd: "var(--coral-100)" },
  moderate: { label: "Moderate", color: "var(--gold-600)",  bg: "var(--gold-50)",   bd: "var(--gold-200)" },
  mild:     { label: "Mild",     color: "var(--green)",     bg: "var(--green-50)",  bd: "var(--green-200)" },
};

// Lifecycle columns map directly to real report.status values.
const RESCUE_COLUMNS = [
  { id: "active",   label: "Needs help",   hint: "Reported · awaiting action", next: "helping" },
  { id: "helping",  label: "Being helped", hint: "A responder is on it",       next: "resolved" },
  { id: "resolved", label: "Resolved",     hint: "At shelter / released",      next: null },
];

/* ---------------- Rescue & dispatch (driven by live reports) ---------------- */
function RescueCard({ r, go, nextStatus, nextLabel, onDragStart, onDragEnd, dragging }: any) {
  const { setReportStatus, offerHelp, me } = useStore();
  const isOwner = me && r.reporterId === me.id;
  // Only owners (and moderators) can move their cases. Others can only Request to help.
  const canDrag = !!isOwner;
  const alreadyRequested = r.helpRequested;
  const sev = r.injured ? (SEV[r.aiInjury?.severity] || SEV.moderate) : null;
  return (
    <div
      className={"card rescue-card" + (dragging ? " dragging" : "") + (isOwner ? " mine" : " readonly")}
      style={{ borderLeft: `3px solid ${isOwner ? "var(--green)" : sev ? sev.color : "var(--line-2)"}`, cursor: canDrag ? "grab" : "default" }}
      draggable={canDrag}
      onDragStart={canDrag ? (e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(r); } : undefined}
      onDragEnd={canDrag ? onDragEnd : undefined}
      title={canDrag ? "Drag to a column to change status" : "You can request to help on this report"}
    >
      <div className="card-pad" style={{ padding: 13 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 9 }}>
          <span className="row" style={{ gap: 6 }}>
            <SpeciesChip sp={r.species} sm />
            {isOwner && <span className="chip chip-sm" style={{ background: "var(--green)", color: "#fff", border: "none", fontWeight: 700 }}><Icon name="user" size={10} /> You</span>}
            {sev && <span className="chip chip-sm" style={{ background: sev.bg, color: sev.color, borderColor: sev.bd, fontWeight: 700, textTransform: "capitalize" }}>{sev.label}</span>}
          </span>
          <span className="mono muted" style={{ fontSize: 11 }}>{r.time}</span>
        </div>
        <div className="row" style={{ gap: 6, marginBottom: 9, flexWrap: "wrap" }}>
          <span className="chip chip-sm"><Icon name="location" size={11} /> {r.ward}</span>
          {r.injured && <span className="chip chip-sm tag-injured"><Icon name="cross" size={11} /> Injured</span>}
        </div>
        <p onClick={() => go("report", r.id)} style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", marginBottom: 11, cursor: "pointer" }}>{r.note || "(no note)"}</p>
        <div className="row" style={{ justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--line)", gap: 8 }}>
          <span className="row" style={{ gap: 6, cursor: "pointer" }} onClick={() => go("user", r.reporterId)}>
            <Avatar name={r.reporter} color={r.reporterColor} size={22} avatar={r.reporterAvatar} /><span style={{ fontSize: 12, fontWeight: 600 }}>{r.reporter.split(" ")[0]}</span>
          </span>
          {isOwner
            ? (nextStatus && <button className="btn btn-soft btn-sm" style={{ padding: "5px 10px", fontSize: 11.5 }} onClick={() => setReportStatus(r.id, nextStatus)}>{nextLabel} <Icon name="arrowRight" size={12} /></button>)
            : (r.status !== "resolved" && (
                alreadyRequested
                  ? <span className="chip chip-sm" style={{ background: "var(--green-50)", color: "var(--green)", borderColor: "var(--green-200)", fontWeight: 700 }}><Icon name="checkSmall" size={11} /> Requested</span>
                  : <button className="btn btn-confirm btn-sm" style={{ padding: "5px 10px", fontSize: 11.5 }} onClick={() => offerHelp(r.id)}><Icon name="heart" size={12} /> Request to help</button>
              ))}
        </div>
      </div>
    </div>
  );
}

function RescueBoard({ cases, go }: any) {
  const { setReportStatus, offerHelp, me } = useStore();
  const [drag, setDrag] = useState<any>(null);       // the card being dragged
  const [over, setOver] = useState<string | null>(null);  // column being hovered

  const handleDrop = (col: any) => {
    setOver(null);
    const r = drag; setDrag(null);
    if (!r || r.status === col.id) return;
    const isOwner = me && r.reporterId === me.id;
    // Moving a stranger's case into "Being helped" is an offer-to-help, not a direct edit.
    if (col.id === "helping" && !isOwner) { offerHelp(r.id); return; }
    setReportStatus(r.id, col.id);
  };

  return (
    <div className="rescue-board" style={{ height: "100%", alignItems: "stretch" }}>
      {RESCUE_COLUMNS.map(col => {
        const list = cases.filter((r: any) => r.status === col.id);
        const canDrop = drag && drag.status !== col.id;
        return (
          <div
            key={col.id}
            className={"rescue-col" + (over === col.id && canDrop ? " drop-target" : "")}
            style={{ height: "100%", minHeight: 0 }}
            onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(col.id); } }}
            onDragLeave={(e) => { if (e.currentTarget === e.target) setOver(null); }}
            onDrop={() => handleDrop(col)}
          >
            <div className="rescue-col-head">
              <div className="row" style={{ gap: 8 }}>
                <span style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 14 }}>{col.label}</span>
                <span className="chip chip-sm" style={{ background: "var(--paper-2)" }}>{list.length}</span>
              </div>
              <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{col.hint}</div>
            </div>
            <div className="rescue-col-body" style={{ overflowY: "auto", minHeight: 0 }}>
              {list.length ? list.map((r: any) => (
                <RescueCard key={r.id} r={r} go={go} nextStatus={col.next}
                  nextLabel={col.next === "helping" ? "Start helping" : "Mark resolved"}
                  onDragStart={setDrag} onDragEnd={() => { setDrag(null); setOver(null); }}
                  dragging={drag?.id === r.id} />
              )) : (
                <div style={{ textAlign: "center", padding: "22px 8px", color: "var(--ink-4)", fontSize: 12 }}>
                  {canDrop ? "Drop here" : "No cases"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Dispatch: List view (priority-sorted table) ---------------- */
function RescueList({ cases, go }: any) {
  const { setReportStatus, offerHelp, me } = useStore();
  const rank = (r: any) => (r.injured ? ({ severe: 3, moderate: 2, mild: 1 } as any)[r.aiInjury?.severity] || 2 : 0);
  const rows = cases.slice().sort((a: any, b: any) => rank(b) - rank(a) || (b.injured ? 1 : 0) - (a.injured ? 1 : 0) || (b.conf || 0) - (a.conf || 0));
  return (
    <div className="card" style={{ overflow: "hidden", height: "100%", display: "flex", flexDirection: "column" }}>
      <div className="row" style={{ padding: "11px 16px", borderBottom: "1px solid var(--line)", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--ink-4)", gap: 8 }}>
        <span style={{ flex: 2, minWidth: 0 }}>Case</span>
        <span style={{ flex: 1 }}>Area</span>
        <span style={{ width: 100 }}>Severity</span>
        <span style={{ width: 120 }}>Status</span>
        <span style={{ flex: 1 }}>Reporter</span>
        <span style={{ width: 130, textAlign: "right" }}>Action</span>
      </div>
      <div style={{ overflowY: "auto", flex: 1 }}>
        {rows.length ? rows.map((r: any, i: number) => {
          const isOwner = me && r.reporterId === me.id;
          const sev = r.injured ? (SEV[r.aiInjury?.severity] || SEV.moderate) : null;
          return (
            <div key={r.id} className="row lb-row" style={{ padding: "11px 16px", borderTop: i ? "1px solid var(--line)" : "none", cursor: "pointer", gap: 8 }} onClick={() => go("report", r.id)}>
              <span className="row" style={{ flex: 2, gap: 8, minWidth: 0 }}>
                <SpeciesChip sp={r.species} sm />
                {isOwner && <span className="chip chip-sm" style={{ background: "var(--green)", color: "#fff", border: "none", fontWeight: 700 }}>You</span>}
                <span className="muted" style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.note || "(no note)"}</span>
              </span>
              <span style={{ flex: 1, fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.ward}</span>
              <span style={{ width: 100 }}>{sev ? <span className="chip chip-sm" style={{ background: sev.bg, color: sev.color, borderColor: sev.bd, fontWeight: 700, textTransform: "capitalize" }}>{sev.label}</span> : <span className="muted" style={{ fontSize: 12 }}>-</span>}</span>
              <span style={{ width: 120 }}><StatusChip status={r.status} sm /></span>
              <span className="row" style={{ flex: 1, gap: 6, minWidth: 0 }} onClick={(e: any) => { e.stopPropagation(); go("user", r.reporterId); }}>
                <Avatar name={r.reporter} color={r.reporterColor} size={22} avatar={r.reporterAvatar} />
                <span style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.reporter.split(" ")[0]}</span>
              </span>
              <span style={{ width: 130, textAlign: "right" }} onClick={(e: any) => e.stopPropagation()}>
                {isOwner
                  ? (r.status === "active" && <button className="btn btn-soft btn-sm" style={{ padding: "5px 10px", fontSize: 11.5 }} onClick={() => setReportStatus(r.id, "helping")}>Start helping</button>)
                  : (r.status !== "resolved" && <button className="btn btn-confirm btn-sm" style={{ padding: "5px 10px", fontSize: 11.5 }} onClick={() => offerHelp(r.id)}><Icon name="heart" size={12} /> Help</button>)}
              </span>
            </div>
          );
        }) : <div className="muted" style={{ textAlign: "center", padding: "40px 0", fontSize: 13 }}>No cases match the current filters.</div>}
      </div>
    </div>
  );
}

export function Rescue({ go }: any) {
  const { reports, stats, me } = useStore();
  const [responders, setResponders] = useState<any[]>([]);
  const [fReporter, setFReporter] = useState("all");    // all | mine
  const [fStatus, setFStatus] = useState("all");        // all | active | helping | resolved
  const [fSeverity, setFSeverity] = useState("severe"); // default: prioritise the most critical cases
  const [fWard, setFWard] = useState(me?.default_ward || "all");  // default to the user's home area
  const [fDate, setFDate] = useState("all");            // all | today | 7d | 30d
  const [view, setView] = useState("board");            // board (kanban) | list
  useEffect(() => {
    let on = true;
    api.leaderboard().then((rows: any[]) => { if (on) setResponders(rows.slice(0, 6)); }).catch(() => {});
    return () => { on = false; };
  }, []);

  // Full supported-area list (not just wards that happen to have reports), plus any extra wards
  // present in the data, so the filter never misses a location.
  const wards = useMemo(() => {
    const all = new Set<string>(WARDS.map((w: any) => w.name));
    reports.forEach((r: any) => { if (r.ward) all.add(r.ward); });
    return Array.from(all).sort();
  }, [reports]);
  // Only VERIFIED (published) reports are dispatchable cases, so board counts match the map / DB
  // summary. Sightings still awaiting community verification aren't triaged here (they show in the
  // Community Feed for confirmation first); injured/severe reports auto-publish, so emergencies
  // always appear immediately.
  const publishedReports = useMemo(() => reports.filter((r: any) => r.moderationState === "published" || !r.moderationState), [reports]);
  const board = useMemo(() => publishedReports.filter((r: any) => {
    if (fReporter === "mine" && !(me && r.reporterId === me.id)) return false;
    if (fStatus !== "all" && r.status !== fStatus) return false;
    if (fSeverity === "injured" && !r.injured) return false;
    if (["severe", "moderate", "mild"].includes(fSeverity) && !(r.injured && r.aiInjury?.severity === fSeverity)) return false;
    if (fWard !== "all" && r.ward !== fWard) return false;
    if (fDate !== "all") { const d = fDate === "today" ? 1 : fDate === "7d" ? 7 : 30; if ((r.mins ?? 0) > d * 1440) return false; }
    return true;
  }), [publishedReports, fReporter, fStatus, fSeverity, fWard, fDate, me]);
  const filtered = fReporter !== "all" || fStatus !== "all" || fSeverity !== "all" || fWard !== "all" || fDate !== "all";
  const myCount = me ? publishedReports.filter((r: any) => r.reporterId === me.id).length : 0;
  const severe = stats?.severity?.severe ?? 0;  // single source of truth (same as Care insights)

  const Sel = ({ value, onChange, children, label }: any) => (
    <label className="row" style={{ gap: 6, fontSize: 12 }}>
      <span className="muted" style={{ fontWeight: 600 }}>{label}</span>
      <select className="input" style={{ height: 34, padding: "0 26px 0 10px", fontSize: 12.5, minWidth: 96 }} value={value} onChange={(e: any) => onChange(e.target.value)}>{children}</select>
    </label>
  );

  return (
    <div className="page wide">
      {/* Top-line counters come from /insights/summary (single source of truth) so they always
          match the map. Board columns below reflect the same reports under any active filter. */}
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <StatCard icon="stack" label="Total reports" value={stats?.total ?? reports.length} sub="published across the valley" color="var(--sp-buffalo)" />
        <StatCard icon="cross" label="Open urgent cases" value={stats?.injured_open ?? 0} sub={`${severe} severe · injured, need a responder`} color="var(--coral)" accent="var(--coral-600)" />
        <StatCard icon="arrowRight" label="Being helped" value={stats?.being_helped ?? 0} sub="a responder is on it" color="var(--gold-600)" />
        <StatCard icon="check" label="Resolved" value={stats?.resolved ?? 0} sub="all cases closed" color="var(--st-resolved)" />
      </div>

      {/* Filters */}
      <div className="card card-pad" style={{ marginBottom: 18, padding: "12px 14px" }}>
        <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
          <Sel label="Reporter" value={fReporter} onChange={setFReporter}>
            <option value="all">Everyone</option>
            <option value="mine">My reports{myCount ? ` (${myCount})` : ""}</option>
          </Sel>
          <Sel label="Status" value={fStatus} onChange={setFStatus}>
            <option value="all">All</option><option value="active">Needs help</option>
            <option value="helping">Being helped</option><option value="resolved">Resolved</option>
          </Sel>
          <Sel label="Priority" value={fSeverity} onChange={setFSeverity}>
            <option value="all">All</option><option value="injured">Injured</option>
            <option value="severe">Severe</option><option value="moderate">Moderate</option><option value="mild">Mild</option>
          </Sel>
          <Sel label="Area" value={fWard} onChange={setFWard}>
            <option value="all">All areas</option>
            {wards.map((w) => <option key={w} value={w}>{w}</option>)}
          </Sel>
          <Sel label="Date" value={fDate} onChange={setFDate}>
            <option value="all">Any time</option><option value="today">Last 24h</option>
            <option value="7d">Last 7 days</option><option value="30d">Last 30 days</option>
          </Sel>
          <div style={{ flex: 1 }} />
          <span className="muted" style={{ fontSize: 12 }}>{board.length} case{board.length === 1 ? "" : "s"} shown</span>
          {filtered && <button className="btn btn-ghost btn-sm" onClick={() => { setFReporter("all"); setFStatus("all"); setFSeverity("all"); setFWard("all"); setFDate("all"); }}><Icon name="x" size={13} /> Clear</button>}
        </div>
      </div>

      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <div className="row" style={{ gap: 12 }}>
          <div className="section-title">Dispatch {view === "board" ? "board" : "list"}</div>
          {view === "board" && <span className="muted" style={{ fontSize: 12 }}><Icon name="arrowRight" size={12} style={{ verticalAlign: -1 }} /> Drag a case between columns, or use its button</span>}
        </div>
        <div className="maptab">
          <button className={view === "board" ? "on" : ""} onClick={() => setView("board")}><Icon name="stack" size={14} /> Board</button>
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}><Icon name="list" size={14} /> List</button>
        </div>
      </div>
      <div style={{ height: "calc(100vh - 232px)", minHeight: 520 }}>
        {view === "board" ? <RescueBoard cases={board} go={go} /> : <RescueList cases={board} go={go} />}
      </div>

      <div className="grid-2" style={{ marginTop: 22, alignItems: "start" }}>
        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
            <div className="section-title">Care insights</div>
            <span className="chip chip-sm status-resolved"><span style={{ width: 6, height: 6, borderRadius: 99, background: "var(--green)", display: "inline-block" }} /> live</span>
          </div>
          {(() => {
            // All figures come from /insights/summary (single source of truth) so they always
            // agree with the map, the stat cards, and the Area Insights page.
            const sevIcon: any = { severe: "alert", moderate: "cross", mild: "shield" };
            const sevCounts = stats?.severity || { severe: 0, moderate: 0, mild: 0 };
            const totalOpen = stats?.injured_open ?? (sevCounts.severe + sevCounts.moderate + sevCounts.mild);
            // Keep the WHOLE card about injured cases so it's internally consistent: the area bars
            // show injured cases per ward (which sum toward the 14 above), not total reports.
            const injuredWards = (stats?.by_ward || []).filter((w: any) => w.injured > 0)
              .slice().sort((a: any, b: any) => (b.severe - a.severe) || (b.injured - a.injured)).slice(0, 6);
            const maxW = injuredWards[0]?.injured || 1;
            return (
              <>
                <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Priority triage across <b>{totalOpen}</b> open injured case{totalOpen === 1 ? "" : "s"}, by severity.</div>
                <div className="row" style={{ gap: 10, marginBottom: 18 }}>
                  {(["severe", "moderate", "mild"] as const).map(k => (
                    <div key={k} style={{ flex: 1, padding: "12px 8px", background: SEV[k].bg, borderRadius: 12, border: `1px solid ${SEV[k].bd}` }}>
                      <div className="row" style={{ gap: 6, marginBottom: 4, color: SEV[k].color }}><Icon name={sevIcon[k]} size={13} /><span style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: .4 }}>{k}</span></div>
                      <div style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 26, color: SEV[k].color, lineHeight: 1 }}>{sevCounts[k] || 0}</div>
                    </div>
                  ))}
                </div>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
                  <span className="section-title" style={{ fontSize: 11 }}>Injured cases by area</span>
                  <span className="muted" style={{ fontSize: 10.5 }}><span style={{ color: "var(--coral-600)", fontWeight: 700 }}>●</span> has a severe case</span>
                </div>
                {injuredWards.length ? injuredWards.map((w: any) => (
                  <div key={w.ward} style={{ marginBottom: 11 }}>
                    <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                      <span className="row" style={{ gap: 6, fontSize: 13, fontWeight: 600 }}>
                        {w.severe > 0 && <span style={{ color: "var(--coral-600)" }}>●</span>}{w.ward}
                      </span>
                      <span className="mono muted" style={{ fontSize: 11.5 }}>{w.injured} injured{w.severe ? ` · ${w.severe} severe` : ""}</span>
                    </div>
                    <div className="prob-track" style={{ height: 7 }}><div className="prob-fill" style={{ width: (w.injured / maxW * 100) + "%", background: w.severe > 0 ? "var(--coral)" : "var(--gold)" }}></div></div>
                  </div>
                )) : <div className="muted" style={{ fontSize: 13 }}>No injured cases right now.</div>}
              </>
            );
          })()}
        </div>

        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
            <div className="section-title">Community responders</div>
            <span className="chip chip-sm status-resolved">{responders.length} active</span>
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Top reporters by verified contribution - the people most likely to help nearby. Tap to view a profile or coordinate via the feed.</p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {responders.map((v: any, i: number) => (
              <div key={v.id} className="row lb-row" style={{ gap: 11, padding: "11px 6px", borderTop: i ? "1px solid var(--line)" : "none", borderRadius: 8, cursor: "pointer" }} onClick={() => go("user", v.id)}>
                <Avatar name={v.display_name || v.username} color={colorFor(v.id)} size={36} avatar={v.avatar_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{v.display_name || v.username}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{v.ward || "Kathmandu"} · reputation {Math.round(v.reputation)}</div>
                </div>
                <span className="chip chip-sm">{v.reports_count} reports</span>
              </div>
            ))}
            {!responders.length && <div className="muted" style={{ fontSize: 13 }}>No responders yet - be the first to report.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Help centre: connect helpers and reporters ---------------- */
export function HelpCenter({ go }: any) {
  const { me, incomingHelp, respondHelp, loadIncomingHelp } = useStore();
  const [mine, setMine] = useState<any[]>([]);
  const [convos, setConvos] = useState<any[]>([]);

  const load = async () => {
    loadIncomingHelp();
    try { setMine(await api.myHelpRequests()); } catch (e) { /* not logged in */ }
    try { setConvos(await api.conversations()); } catch (e) { /* */ }
  };
  useEffect(() => {
    if (!me) return;
    load();
    const iv = setInterval(load, 20000);
    return () => clearInterval(iv);
  }, [me]);

  if (!me) {
    return <div className="page wide"><Empty icon="cross" title="Log in to coordinate help" text="Sign in to offer help, accept requests, and chat with reporters." /></div>;
  }

  const STAT: any = {
    pending: { label: "Pending", cls: { background: "var(--gold-50)", color: "var(--gold-600)", borderColor: "var(--gold-200)" } },
    accepted: { label: "Accepted", cls: { background: "var(--green-50)", color: "var(--green)", borderColor: "var(--green-200)" } },
    declined: { label: "Declined", cls: { background: "var(--paper-2)", color: "var(--ink-3)" } },
  };
  const incoming = incomingHelp || [];
  const pendingMine = mine.filter((h: any) => h.status === "pending").length;

  const Panel = ({ icon, title, count, accent, children, bodyStyle }: any) => (
    <div className="card" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div className="row" style={{ justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
        <div className="row" style={{ gap: 9 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, display: "grid", placeItems: "center", background: accent ? "var(--coral-50)" : "var(--green-50)", color: accent || "var(--green)" }}><Icon name={icon} size={16} /></div>
          <b style={{ fontFamily: "var(--ff-display)", fontSize: 15 }}>{title}</b>
        </div>
        <span className="chip chip-sm" style={{ fontWeight: 700 }}>{count}</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", ...bodyStyle }}>{children}</div>
    </div>
  );

  return (
    <div className="page wide">
      <div className="grid-4" style={{ marginBottom: 20 }}>
        <StatCard icon="cross" label="Requests to me" value={incoming.length} sub="waiting for your response" color="var(--coral)" accent="var(--coral-600)" />
        <StatCard icon="heart" label="My help offers" value={mine.length} sub={`${pendingMine} awaiting a reply`} color="var(--green)" />
        <StatCard icon="comment" label="Active rescues" value={convos.length} sub="with an open chat" color="var(--sp-buffalo)" />
        <StatCard icon="check" label="Accepted & helping" value={mine.filter((h: any) => h.status === "accepted").length} sub="offers you're acting on" color="var(--st-resolved)" accent="var(--st-resolved)" />
      </div>

      <div className="bento" style={{ gridTemplateColumns: "1.25fr 1fr", alignItems: "start" }}>
        {/* Left column: action items */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Requests to me - the primary action */}
          <Panel icon="cross" title="Requests to help my reports" count={incoming.length} accent={incoming.length ? "var(--coral-600)" : undefined} bodyStyle={{ maxHeight: 360 }}>
            {incoming.length ? incoming.map((h: any, i: number) => (
              <div key={h.id} className="row" style={{ gap: 12, padding: "14px 18px", borderTop: i ? "1px solid var(--line)" : "none" }}>
                <Avatar name={h.helper_name} color={colorFor(h.id)} size={42} avatar={h.helper_avatar_url} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{h.helper_name} <span className="muted" style={{ fontWeight: 400 }}>wants to help</span></div>
                  <div className="muted" style={{ fontSize: 12.5, marginTop: 1 }}>{h.species_label}{h.injured ? " (injured)" : ""} · {h.ward || "Kathmandu"}</div>
                  {h.message && <div style={{ fontSize: 12.5, marginTop: 5, padding: "6px 10px", background: "var(--paper-2)", borderRadius: 8, color: "var(--ink-2)" }}>"{h.message}"</div>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => respondHelp(h.id, true).then(load)}><Icon name="checkSmall" size={14} /> Accept</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => respondHelp(h.id, false).then(load)}>Decline</button>
                </div>
              </div>
            )) : <Empty icon="check" title="No pending requests" text="When someone offers to help on your reports, you can accept or decline it here." />}
          </Panel>

          {/* My offers */}
          <Panel icon="heart" title="My help offers" count={mine.length} bodyStyle={{ maxHeight: 340 }}>
            {mine.length ? mine.map((h: any, i: number) => {
              const s = STAT[h.status] || STAT.pending;
              return (
                <div key={h.id} className="row lb-row" style={{ gap: 12, padding: "13px 18px", borderTop: i ? "1px solid var(--line)" : "none", cursor: "pointer" }} onClick={() => go("report", h.report_id)}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, flex: "0 0 38px", display: "grid", placeItems: "center", background: h.injured ? "var(--coral-50)" : "var(--green-50)", color: h.injured ? "var(--coral-600)" : "var(--green)" }}><Icon name={h.injured ? "cross" : "paw"} size={17} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{h.species_label}{h.injured ? " (injured)" : ""} in {h.ward || "Kathmandu"}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>Reported by {h.reporter_name || "a neighbour"}</div>
                  </div>
                  <span className="chip chip-sm" style={{ fontWeight: 700, ...s.cls }}>{s.label}</span>
                  {h.status === "accepted" && <button className="btn btn-soft btn-sm" onClick={(e: any) => { e.stopPropagation(); go("report", h.report_id); }}><Icon name="comment" size={14} /> Chat</button>}
                </div>
              );
            }) : <Empty icon="heart" title="No offers yet" text="Tap 'Request to help' on a report from the map or dispatch board, and track it here." />}
          </Panel>
        </div>

        {/* Right column: active rescues + chats (full height) */}
        <Panel icon="comment" title="Active rescues" count={convos.length} bodyStyle={{ minHeight: 300 }}>
          {convos.length ? convos.map((c: any, i: number) => (
            <div key={c.report_id} className="row lb-row" style={{ gap: 12, padding: "14px 18px", borderTop: i ? "1px solid var(--line)" : "none", cursor: "pointer" }} onClick={() => go("report", c.report_id)}>
              <div style={{ width: 40, height: 40, borderRadius: 10, flex: "0 0 40px", display: "grid", placeItems: "center", background: "var(--green-50)", color: "var(--green)" }}><Icon name="comment" size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 6 }}><b style={{ fontSize: 13.5 }}>{c.species_label} · {c.ward || "Kathmandu"}</b><span className="chip chip-sm">{c.role === "reporter" ? "You reported" : "You're helping"}</span></div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.last_message || "No messages yet - say hello and coordinate."}</div>
              </div>
              <Icon name="arrowRight" size={15} style={{ color: "var(--ink-4)", flexShrink: 0 }} />
            </div>
          )) : <Empty icon="comment" title="No active rescues" text="Once you accept a helper (or your offer is accepted), a coordination chat opens here." />}
        </Panel>
      </div>
    </div>
  );
}

/* ---------------- Alerts / notifications ---------------- */
const NOTIF_CATS = [
  { id: "all", label: "All", icon: "bell" },
  { id: "unread", label: "Unread", icon: "eye" },
  { id: "dispatch", label: "Rescue & dispatch", icon: "cross", kinds: ["dispatch"] },
  { id: "reports", label: "My reports", icon: "paw", kinds: ["confirm", "system"] },
  { id: "community", label: "Community", icon: "comment", kinds: ["comment"] },
  { id: "achievements", label: "Achievements", icon: "trophy", kinds: ["points", "badge"] },
];

function notifBucket(iso: string) {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "Earlier";
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  return "Earlier";
}

export function Alerts({ go }: any) {
  const { notifs, markNotifRead, markAllNotifsRead, incomingHelp, respondHelp, loadIncomingHelp } = useStore();
  useEffect(() => { loadIncomingHelp(); }, [loadIncomingHelp]);
  const [tab, setTab] = useState("all");
  const unread = notifs.filter((n: any) => n.unread).length;
  const catCount = (c: any) => c.id === "all" ? notifs.length : c.id === "unread" ? unread : notifs.filter((n: any) => c.kinds?.includes(n.kind)).length;

  const list = useMemo(() => {
    if (tab === "unread") return notifs.filter((n: any) => n.unread);
    const cat = NOTIF_CATS.find((c: any) => c.id === tab);
    if (cat?.kinds) return notifs.filter((n: any) => cat.kinds.includes(n.kind));
    return notifs;
  }, [tab, notifs]);

  // Group into Today / Yesterday / This week / Earlier (like a real notifications feed).
  const groups = useMemo(() => {
    const order = ["Today", "Yesterday", "This week", "Earlier"];
    const g: any = {};
    list.forEach((n: any) => { const b = notifBucket(n.created_at); (g[b] = g[b] || []).push(n); });
    return order.filter(o => g[o]?.length).map(o => [o, g[o]]);
  }, [list]);

  const markAll = () => markAllNotifsRead();
  const open = (n: any) => {
    markNotifRead(n.id);
    if (n.report_id) go("report", n.report_id);
    else if (n.kind === "dispatch") go("rescue");
    else if (n.kind === "adopt") go("adoption");
    else if (n.kind === "confirm" || n.kind === "comment") go("feed");
    else if (n.kind === "system") go("insights");
  };

  const Row = ({ n, last }: any) => (
    <div className="notif-row" onClick={() => open(n)}
      style={{ display: "flex", gap: 14, padding: "15px 20px", borderBottom: last ? "none" : "1px solid var(--line)", background: n.unread ? "var(--green-50)" : "transparent", cursor: "pointer", position: "relative" }}>
      {n.unread && <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", width: 6, height: 6, borderRadius: 99, background: "var(--green)" }} />}
      <div style={{ width: 40, height: 40, borderRadius: 12, flex: "0 0 40px", display: "grid", placeItems: "center", background: "var(--card-2)", border: "1px solid var(--line)", color: n.accent }}>
        <Icon name={n.icon} size={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row" style={{ justifyContent: "space-between", gap: 10 }}>
          <b style={{ fontSize: 14 }}>{n.title}</b>
          <span className="mono muted" style={{ fontSize: 11, flex: "0 0 auto" }}>{n.time}</span>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 3, lineHeight: 1.45 }}>{n.body}</p>
      </div>
    </div>
  );

  return (
    <div className="page wide">
      <div className="settings-layout">
        {/* category sidebar */}
        <nav className="settings-nav">
          {NOTIF_CATS.map((c: any) => {
            const n = catCount(c);
            return (
              <a key={c.id} className={tab === c.id ? "active" : ""} onClick={() => setTab(c.id)}>
                <Icon name={c.icon} size={16} /> <span style={{ flex: 1 }}>{c.label}</span>
                {n > 0 && <span className="chip chip-sm" style={{ background: c.id === "unread" && n ? "var(--green)" : "var(--paper-2)", color: c.id === "unread" && n ? "#fff" : "var(--ink-3)", border: "none", fontWeight: 700, padding: "1px 7px" }}>{n}</span>}
              </a>
            );
          })}
        </nav>

        <div className="settings-content" style={{ maxWidth: 860 }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div>
              <h1 style={{ fontSize: 24 }}>Notifications</h1>
              <p className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{unread ? `${unread} unread` : "You're all caught up"} · updates on your reports, rescues and community.</p>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={markAll} disabled={!unread}><Icon name="checkSmall" size={15} /> Mark all read</button>
          </div>

          {/* pending help offers (actionable) */}
          {incomingHelp && incomingHelp.length > 0 && (
            <div className="card card-pad" style={{ marginBottom: 16, border: "1px solid var(--green-200)" }}>
              <div className="row" style={{ gap: 8, marginBottom: 10 }}>
                <Icon name="cross" size={16} style={{ color: "var(--green)" }} />
                <b style={{ fontFamily: "var(--ff-display)", fontSize: 15 }}>Help offers on your reports</b>
                <span className="chip chip-sm" style={{ marginLeft: "auto", background: "var(--green)", color: "#fff", border: "none" }}>{incomingHelp.length}</span>
              </div>
              {incomingHelp.map((h: any, i: number) => (
                <div key={h.id} className="row" style={{ gap: 11, padding: "11px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
                  <Avatar name={h.helper_name} color={colorFor(h.id)} size={36} avatar={h.helper_avatar_url} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{h.helper_name} <span className="muted" style={{ fontWeight: 400 }}>offered to help</span></div>
                    <div className="muted" style={{ fontSize: 12 }}>{h.species_label} {h.injured ? "(injured) " : ""}- {h.ward}{h.message ? ` - "${h.message}"` : ""}</div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={() => respondHelp(h.id, true)}>Accept</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => respondHelp(h.id, false)}>Decline</button>
                </div>
              ))}
            </div>
          )}

          {/* time-grouped notification feed */}
          {groups.length ? groups.map(([label, items]: any) => (
            <div key={label} style={{ marginBottom: 18 }}>
              <div className="section-title" style={{ marginBottom: 8, paddingLeft: 2 }}>{label}</div>
              <div className="card" style={{ overflow: "hidden" }}>
                {items.map((n: any, i: number) => <Row key={n.id} n={n} last={i === items.length - 1} />)}
              </div>
            </div>
          )) : (
            <div className="card"><Empty icon="bell" title="Nothing here" text={tab === "unread" ? "You have no unread notifications." : "No notifications in this category yet."} /></div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Settings ---------------- */
function SettingRow({ title, desc, children, danger }: any) {
  return (
    <div className="row" style={{ justifyContent: "space-between", gap: 18, padding: "14px 0", borderTop: "1px solid var(--line)", alignItems: "flex-start" }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: danger ? "var(--coral-600)" : "var(--ink)" }}>{title}</div>
        {desc && <div className="muted" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.45 }}>{desc}</div>}
      </div>
      <div style={{ flex: "0 0 auto" }}>{children}</div>
    </div>
  );
}

function ChangePasswordCard() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [nw2, setNw2] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (nw.length < 8) { toast.error("New password must be at least 8 characters"); return; }
    if (nw !== nw2) { toast.error("New passwords don't match"); return; }
    setBusy(true);
    try {
      await api.changePassword(cur, nw);
      toast.success("Password changed");
      setCur(""); setNw(""); setNw2(""); setOpen(false);
    } catch (e: any) { toast.error(e?.message || "Couldn't change password"); }
    finally { setBusy(false); }
  };
  return (
    <div className="card card-pad" style={{ marginBottom: 18 }}>
      <div className="row" style={{ gap: 9, marginBottom: 4 }}><Icon name="lock" size={17} style={{ color: "var(--green)" }} /><h3 style={{ fontSize: 16 }}>Account security</h3></div>
      <SettingRow title="Password" desc="Change the password you use to sign in.">
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)}><Icon name={open ? "chevUp" : "chevDown"} size={14} /> Change</button>
      </SettingRow>
      {open && (
        <div style={{ padding: "6px 2px 2px" }}>
          <div className="field" style={{ marginBottom: 10 }}><label>Current password</label><input className="input" type="password" value={cur} onChange={e => setCur(e.target.value)} autoComplete="current-password" /></div>
          <div className="grid-2" style={{ gap: 12 }}>
            <div className="field" style={{ margin: 0 }}><label>New password</label><input className="input" type="password" value={nw} onChange={e => setNw(e.target.value)} autoComplete="new-password" /></div>
            <div className="field" style={{ margin: 0 }}><label>Confirm new password</label><input className="input" type="password" value={nw2} onChange={e => setNw2(e.target.value)} autoComplete="new-password" /></div>
          </div>
          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={busy || !cur || !nw} onClick={submit}>{busy ? <span className="spinner" /> : "Update password"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Settings({ go }: any) {
  const { user: ME, settings: s, toggleSetting: t, setSetting, exportData, deleteAccount, uploadAvatar, updateProfile, saveDefaultLocation, avatarUploading, avatarProgress, nearestWardLL } = useStore();
  const { lang, setLang, t: tr } = useI18n();
  const { theme, setTheme, reduceMotion, setReduceMotion, largeText, setLargeText } = useAppearance();
  const changeLang = (code: string) => { setLang(code); setSetting("lang", code); updateProfile({ preferences: { lang: code } }, { silent: true }); };
  const [name, setName] = useState(ME.name);
  const [aiInfoOpen, setAiInfoOpen] = useState(false);
  const [uname, setUname] = useState((ME.handle || "").replace(/^@/, ""));
  const [savingName, setSavingName] = useState(false);
  const [savingUname, setSavingUname] = useState(false);
  const fileRef = useRef<any>(null);
  useEffect(() => { setName(ME.name); setUname((ME.handle || "").replace(/^@/, "")); }, [ME.name, ME.handle]);

  const unameClean = uname.trim().toLowerCase();
  const unameValid = /^[a-z][a-z0-9_]{2,19}$/.test(unameClean);
  const unameChanged = unameClean !== (ME.handle || "").replace(/^@/, "").toLowerCase();

  const saveName = async () => {
    if (!name.trim()) { toast.error("Name can't be empty"); return; }
    setSavingName(true);
    await updateProfile({ display_name: name.trim() }, { successMsg: "Name updated" });
    setSavingName(false);
  };
  const saveUname = async () => {
    if (!unameValid) { toast.error("3-20 chars, start with a letter, lowercase/numbers/underscore only"); return; }
    setSavingUname(true);
    await updateProfile({ username: unameClean }, { successMsg: "Username updated" });
    setSavingUname(false);
  };

  // Home Area picker state (interactive map + search).
  const [pin, setPin] = useState<any>(ME.defaultLat != null && ME.defaultLng != null ? { lat: ME.defaultLat, lng: ME.defaultLng } : null);
  const [center, setCenter] = useState<any>(pin);
  const pickedWard = pin ? nearestWardLL(pin.lng, pin.lat) : null;

  const SETTINGS_SECTIONS = [
    ["set-account", "user", "Profile"],
    ["set-home", "location", "Home area"],
    ["set-language", "globe", "Language"],
    ["set-appearance", "eye", "Appearance"],
    ["set-privacy", "shield", "Privacy & visibility"],
    ["set-ai", "sparkle", "AI & transparency"],
    ["set-notifications", "bell", "Notifications"],
    ["set-security", "lock", "Account security"],
    ["set-data", "stack", "Data & safety"],
  ];
  const [activeSec, setActiveSec] = useState("set-account");
  const goSec = (id: string) => { setActiveSec(id); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <div className="page wide">
      <div className="settings-layout">
        <nav className="settings-nav">
          {SETTINGS_SECTIONS.map(([id, icon, label]: any) => (
            <a key={id} className={activeSec === id ? "active" : ""} onClick={() => goSec(id)}><Icon name={icon} size={16} /> {label}</a>
          ))}
        </nav>
        <div className="settings-content">
      <div id="set-account" className="set-anchor" />
      {/* Account & profile */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="row" style={{ gap: 9, marginBottom: 14 }}><Icon name="user" size={17} style={{ color: "var(--green)" }} /><h3 style={{ fontSize: 16 }}>{tr("settings.profile")}</h3></div>
        <div className="row" style={{ gap: 16, marginBottom: 8, alignItems: "center" }}>
          <div style={{ position: "relative", cursor: avatarUploading ? "default" : "pointer" }} onClick={() => !avatarUploading && fileRef.current?.click()} title="Change photo">
            <div style={{ transition: "opacity .25s ease, filter .25s ease", opacity: avatarUploading ? 0.55 : 1, filter: avatarUploading ? "blur(1px)" : "none" }}>
              <Avatar name={ME.name} color={ME.color} size={64} ring avatar={ME.avatar} />
            </div>
            {avatarUploading
              ? <div style={{ position: "absolute", inset: 0, borderRadius: 99, display: "grid", placeItems: "center", background: "rgba(0,0,0,.35)", color: "#fff", fontWeight: 700, fontSize: 13 }}>{avatarProgress > 0 && avatarProgress < 100 ? `${avatarProgress}%` : <span className="spinner" style={{ width: 20, height: 20, borderWidth: 3 }} />}</div>
              : <div style={{ position: "absolute", right: -2, bottom: -2, width: 24, height: 24, borderRadius: 99, background: "var(--green)", color: "#fff", display: "grid", placeItems: "center", border: "2px solid var(--card)" }}><Icon name="camera" size={12} /></div>}
            <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ""; }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 18 }}>{ME.name}</div>
            <div className="muted" style={{ fontSize: 13 }}>{ME.handle} · {ME.levelName}</div>
            {avatarUploading
              ? <div style={{ marginTop: 6, maxWidth: 200 }}><div className="prob-track" style={{ height: 6 }}><div className="prob-fill" style={{ width: (avatarProgress || 5) + "%", background: "var(--green)", transition: "width .15s" }} /></div><div className="muted" style={{ fontSize: 11, marginTop: 3 }}>Uploading… {avatarProgress}%</div></div>
              : <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>Tap the photo to change it (JPG/PNG, max 8 MB).</div>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => go("profile")}><Icon name="user" size={15} /> View profile</button>
        </div>
        <div className="grid-2" style={{ gap: 14, marginTop: 12 }}>
          <div className="field" style={{ margin: 0 }}><label>Display name</label>
            <div className="row" style={{ gap: 8 }}>
              <input className="input" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
              <button className="btn btn-primary btn-sm" disabled={savingName || name.trim() === ME.name} onClick={saveName}>{savingName ? <span className="spinner" /> : "Save"}</button>
            </div>
          </div>
          <div className="field" style={{ margin: 0 }}><label>Username</label>
            <div className="row" style={{ gap: 8 }}>
              <div className="row" style={{ flex: 1, position: "relative" }}>
                <span style={{ position: "absolute", left: 11, color: "var(--ink-4)", fontWeight: 700, fontSize: 13.5 }}>@</span>
                <input className="input" style={{ paddingLeft: 24 }} value={uname} maxLength={20} onChange={e => setUname(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} />
              </div>
              <button className="btn btn-primary btn-sm" disabled={savingUname || !unameChanged || !unameValid} onClick={saveUname}>{savingUname ? <span className="spinner" /> : "Save"}</button>
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4, color: unameChanged && !unameValid ? "var(--coral-600)" : "var(--ink-4)" }}>
              {unameChanged && !unameValid ? "3-20 chars, start with a letter, lowercase/numbers/underscore." : "Your public @handle - used on your profile, leaderboard and mentions. Changeable every 14 days."}
            </div>
          </div>
        </div>
      </div>

      <div id="set-home" className="set-anchor" />
      {/* Home area (default location) - interactive map + search */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="row" style={{ gap: 9, marginBottom: 4 }}><Icon name="location" size={17} style={{ color: "var(--green)" }} /><h3 style={{ fontSize: 16 }}>{tr("settings.homeArea")}</h3></div>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Search for a place or drop a pin. We save the generalised <b>area</b> (never an exact address) as your default. New reports, "Near me", the leaderboard, dispatch board and area insights all start from here. Leave it unset to keep the app valley-wide.</p>
        <LocationSearch onSelect={(ll: any) => { setPin({ lat: ll.lat, lng: ll.lng }); setCenter({ lat: ll.lat, lng: ll.lng }); }} />
        <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)", height: 260, position: "relative", marginTop: 8 }}>
          <div className="leaflet-fill preview"><PinPickerMap pin={pin} species="dog" center={center} onPick={(p: any) => setPin(p)} /></div>
        </div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 12, flexWrap: "wrap", gap: 10 }}>
          <div className="row" style={{ gap: 8, fontSize: 13 }}>
            <Icon name="pin" size={14} style={{ color: "var(--green)" }} />
            {pickedWard ? <span>Area: <b>{pickedWard.name}</b> <span className="muted">({pickedWard.district})</span></span> : <span className="muted">No pin placed yet</span>}
            {ME.defaultWard && <span className="chip chip-sm" style={{ background: "var(--green-50)", color: "var(--green)", border: "none" }}>current: {ME.defaultWard}</span>}
          </div>
          <div className="row" style={{ gap: 8 }}>
            {(ME.defaultLat != null) && <button className="btn btn-ghost btn-sm" onClick={() => { setPin(null); updateProfile({ clear_location: true }, { successMsg: "Home area cleared" }); }}>Clear</button>}
            <button className="btn btn-primary btn-sm" disabled={!pin} onClick={() => pickedWard && saveDefaultLocation(pin.lat, pin.lng, pickedWard.name)}><Icon name="check" size={14} /> Save home area</button>
          </div>
        </div>
      </div>

      <div id="set-language" className="set-anchor" />
      {/* Language */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="row" style={{ gap: 9, marginBottom: 4 }}><Icon name="globe" size={17} style={{ color: "var(--green)" }} /><h3 style={{ fontSize: 16 }}>{tr("settings.language")}</h3></div>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{tr("settings.languageDesc")} Your choice is saved and applied across the app.</p>
        <div className="seg" style={{ maxWidth: 320 }}>
          {LANGS.map((l: any) => <button key={l.code} className={lang === l.code ? "on" : ""} onClick={() => changeLang(l.code)}>{l.native}</button>)}
        </div>
      </div>

      <div id="set-appearance" className="set-anchor" />
      {/* Appearance & accessibility */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="row" style={{ gap: 9, marginBottom: 4 }}><Icon name="eye" size={17} style={{ color: "var(--green)" }} /><h3 style={{ fontSize: 16 }}>Appearance &amp; accessibility</h3></div>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>These apply instantly and are saved on this device.</p>
        <SettingRow title="Theme" desc="Light, dark, or match your device.">
          <div className="seg">
            {[["light", "Light"], ["dark", "Dark"], ["system", "System"]].map(o => (
              <button key={o[0]} className={theme === o[0] ? "on" : ""} onClick={() => setTheme(o[0])}>{o[1]}</button>
            ))}
          </div>
        </SettingRow>
        <SettingRow title="Reduce motion" desc="Minimise animations and transitions.">
          <Toggle on={reduceMotion} onClick={() => setReduceMotion(!reduceMotion)} />
        </SettingRow>
        <SettingRow title="Larger text" desc="Increase the base text size for readability.">
          <Toggle on={largeText} onClick={() => setLargeText(!largeText)} />
        </SettingRow>
      </div>

      <div id="set-privacy" className="set-anchor" />
      {/* Privacy & visibility (functional controls) */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="row" style={{ gap: 9, marginBottom: 4 }}><Icon name="shield" size={17} style={{ color: "var(--green)" }} /><h3 style={{ fontSize: 16 }}>{tr("settings.privacy")}</h3></div>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Control how you appear to the community. Your exact location is always generalised to an area on the server, whatever you choose here.</p>
        <SettingRow title="Public profile & leaderboard" desc="Appear in community rankings and let others open your profile. Turn off to stay off the public leaderboard.">
          <Toggle on={s.publicProfile} onClick={() => t("publicProfile")} />
        </SettingRow>
        <div className="ai-note" style={{ borderTop: "1px solid var(--line)", marginTop: 4 }}><Icon name="lock" size={14} /><span>Always enforced on the server: your location is generalised to a ~100m area, and your precise coordinates are never shown to anyone.</span></div>
      </div>

      {/* How reports stay trustworthy (spam & moderation, explained simply) */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="row" style={{ gap: 9, marginBottom: 4 }}><Icon name="shield" size={17} style={{ color: "var(--green)" }} /><h3 style={{ fontSize: 16 }}>{tr("settings.trustworthy")}</h3></div>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Every report is checked automatically and by the community, so the map stays accurate and free of spam. Here's how it works in plain terms.</p>
        {[
          ["sparkle", "Automatic checks", "When you submit a report, SafeTails weighs several signals together - whether it looks like a genuine new sighting, how it compares with your recent activity, and whether the timing and location make sense - to catch fake or duplicate reports before they spread."],
          ["check", "Community verification", "Everyday reports appear in the feed for other members to confirm. A single confirmation from the community publishes them; injured or emergency reports go live straight away so help isn't delayed."],
          ["alert", "Community flagging", "Anyone can flag a report that looks fake or wrong. Flags from trusted, established members count for more, and enough of them will hide a report for review or take it down."],
          ["trophy", "Fair rewards & consequences", "Accurate reporting builds your reputation and can unlock instant publishing. Reports confirmed as spam cost you reputation and points - more for fake emergencies - and repeat offenders get a short cooldown before they can post again."],
        ].map(([icon, title, desc]: any) => (
          <div key={title} className="row" style={{ gap: 12, alignItems: "flex-start", padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "grid", placeItems: "center", background: "var(--green-50)", color: "var(--green)" }}><Icon name={icon} size={15} /></div>
            <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{title}</div><div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>{desc}</div></div>
          </div>
        ))}
        <div className="ai-note" style={{ borderTop: "1px solid var(--line)", marginTop: 4 }}><Icon name="info" size={14} /><span>You can always see exactly why one of your reports was held or removed on your <a onClick={() => go("myreports")} style={{ color: "var(--green)", fontWeight: 700, cursor: "pointer" }}>My reports</a> page.</span></div>
      </div>

      <div id="set-ai" className="set-anchor" />
      {/* AI assistance - functional controls + responsible-AI transparency */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="row" style={{ gap: 9, marginBottom: 4 }}><Icon name="sparkle" size={17} style={{ color: "var(--green)" }} /><h3 style={{ fontSize: 16 }}>{tr("settings.aiTransparency")}</h3></div>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Control how AI assists you. These apply across the app immediately.</p>

        <SettingRow title="AI assistance" desc="Master switch for AI species + injury assessment panels on reports.">
          <Toggle on={s.showAI !== false} onClick={() => t("showAI")} />
        </SettingRow>
        <SettingRow title="Show confidence scores" desc="Display the model's confidence percentages. Turn off to hide the numbers.">
          <Toggle on={s.aiConfidence !== false} onClick={() => t("aiConfidence")} />
        </SettingRow>
        <SettingRow title="Show AI explanations" desc="Display the written reasoning behind injury and species calls.">
          <Toggle on={s.aiRationale !== false} onClick={() => t("aiRationale")} />
        </SettingRow>
        <SettingRow title="AI recommendations" desc="Let AI suggest a species label and pre-fill the injury flag when you report.">
          <Toggle on={s.aiRecommend !== false} onClick={() => t("aiRecommend")} />
        </SettingRow>
        <SettingRow title="Notify me about AI insights" desc="Weekly AI-written summary of valley trends and hotspot alerts.">
          <Toggle on={s.aiInsightNotif !== false} onClick={() => t("aiInsightNotif")} />
        </SettingRow>

        <div className="ai-note" style={{ borderTop: "1px solid var(--line)", marginTop: 4 }}><Icon name="info" size={14} /><span>Every AI output is labelled "AI estimate - may be wrong", and you can rate any result with the "Was the AI right?" control on a report - your feedback is used to monitor model quality.</span></div>

        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setAiInfoOpen(v => !v)}>
          <Icon name={aiInfoOpen ? "chevUp" : "chevDown"} size={14} /> How our AI works &amp; responsible-AI commitments
        </button>
        {aiInfoOpen && (
          <div style={{ marginTop: 6 }}>
            {[
              ["paw", "What the AI does", "One in-house model classifies the animal (dog, cat, cow, buffalo or other) from your photo. A separate assisted check flags possible injury. Both are aids for triage, not diagnoses."],
              ["chart", "Reading confidence", "Every prediction shows a confidence score. Below a set threshold the species is marked \"Unverified\" rather than guessed, and a second-opinion check may run. Treat scores as a guide, not certainty."],
              ["shield", "Fairness & bias safeguards", "The model was trained and tested on diverse Kathmandu-relevant images, reports low-confidence cases honestly instead of forcing a label, and is always open to human correction and community verification."],
              ["user", "You're always in control", "You can override the species and injury flag on any report. Human corrections are kept alongside the original AI output, never hidden."],
              ["lock", "Privacy", "Photos are used only to produce these results; hidden photo details are stripped and your exact location is generalised."],
            ].map(([icon, title, desc]: any) => (
              <div key={title} className="row" style={{ gap: 12, alignItems: "flex-start", padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "grid", placeItems: "center", background: "var(--green-50)", color: "var(--green)" }}><Icon name={icon} size={15} /></div>
                <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{title}</div><div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>{desc}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div id="set-notifications" className="set-anchor" />
      {/* Notifications */}
      <div className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="row" style={{ gap: 9, marginBottom: 10 }}><Icon name="bell" size={17} style={{ color: "var(--green)" }} /><h3 style={{ fontSize: 16 }}>{tr("settings.notifications")}</h3></div>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 8, marginTop: -2 }}>Choose which alerts appear in your bell / Alerts page. Each category can be turned off independently.</p>
        <SettingRow title="Rescue & dispatch" desc="Urgent injured cases nearby and accepted help offers."><Toggle on={s.pushUrgent} onClick={() => t("pushUrgent")} /></SettingRow>
        <SettingRow title="Activity on my reports" desc="When your report publishes, gets confirmed, or a sighting appears in your saved area."><Toggle on={s.pushConfirm} onClick={() => t("pushConfirm")} /></SettingRow>
        <SettingRow title="Comments & community" desc="When someone comments on a report you posted."><Toggle on={s.pushComment} onClick={() => t("pushComment")} /></SettingRow>
        <SettingRow title="Achievements & badges" desc="Points you earn or lose, badges unlocked, and milestones."><Toggle on={s.pushAchievements !== false} onClick={() => t("pushAchievements")} /></SettingRow>
        <SettingRow title="Weekly valley digest" desc="The AI-written summary of trends across the valley."><Toggle on={s.digest} onClick={() => t("digest")} /></SettingRow>
      </div>

      <div id="set-security" className="set-anchor" />
      {/* Account security */}
      <ChangePasswordCard />

      <div id="set-data" className="set-anchor" />
      {/* Data & safety */}
      <div className="card card-pad">
        <div className="row" style={{ gap: 9, marginBottom: 4 }}><Icon name="lock" size={17} style={{ color: "var(--green)" }} /><h3 style={{ fontSize: 16 }}>{tr("settings.dataSafety")}</h3></div>
        <SettingRow title="Download my data" desc="Export your reports, comments and points as JSON.">
          <button className="btn btn-ghost btn-sm" onClick={() => exportData()}><Icon name="upload" size={15} /> Export</button>
        </SettingRow>
        <SettingRow title="Delete account" desc="Permanently remove your profile. Reports stay anonymised to preserve welfare history." danger>
          <button className="btn btn-sm" style={{ background: "var(--coral-50)", color: "var(--coral-600)", border: "1px solid var(--coral-100)" }} onClick={async () => { if (confirm("Delete your SafeTails account? Your reports stay anonymised for welfare history; everything else is removed. This cannot be undone.")) { const ok = await deleteAccount(); if (ok) go("landing"); } }}><Icon name="x" size={15} /> Delete</button>
        </SettingRow>
        <div className="ai-note" style={{ borderTop: "1px solid var(--line)", marginTop: 4 }}><Icon name="info" size={14} /><span>SafeTails · v0.9 demo · A community animal-welfare system for the Kathmandu Valley. Partners: KAT Centre, Sneha's Care, Animal Nepal.</span></div>
      </div>
        </div>
      </div>
    </div>
  );
}
