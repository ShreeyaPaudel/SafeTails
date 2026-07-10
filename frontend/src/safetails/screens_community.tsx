// @ts-nocheck - verbatim port of the SafeTails design reference (authored without strict typing)
/* ============================================================
   SafeTails - Feed, Leaderboard, Profile, Adoption, Insights
   ============================================================ */
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, RadialBarChart, RadialBar,
  ScatterChart, Scatter, ZAxis, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ComposedChart, Line, Legend,
} from "recharts";
import { Icon } from "./icons";
import { LikeButton, ConfirmButton } from "./components";
import {
  Avatar, Ph, Photo, Gallery, SpeciesChip, StatusChip, InjuredTag, AISummary, StatCard, Empty,
} from "./components";
import { toast } from "sonner";
import {
  WARDS, SPECIES, STATUS, LEADERS, BADGES, ACTIVITY, SHELTERS,
  normalizePerson,
} from "./data";
import { HeatPreviewMap, HotspotMap } from "./RealMap";
import { useStore } from "./store";
import { api, imageUrl } from "@/lib/api";
import { colorFor, levelName, adaptReport } from "./adapt";
import { useI18n } from "./i18n";
import { downloadCertificate, downloadBadge } from "./Certificate";

/* ---------- shared chart tooltip ---------- */
function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 11px", boxShadow: "var(--shadow)", fontSize: 12.5 }}>
      {label != null && <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} className="row" style={{ gap: 7, color: "var(--ink-2)" }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: p.color || p.fill }}></span>
          <span style={{ fontWeight: 600 }}>{p.name}</span>
          <span className="mono" style={{ marginLeft: "auto", fontWeight: 700 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* Tooltip for the risk scatter (shows the AREA name, not just raw x/y values). */
function RiskScatterTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 11px", boxShadow: "var(--shadow)", fontSize: 12.5 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.ward}</div>
      <div className="muted" style={{ fontSize: 12 }}>Risk score <b style={{ color: "var(--ink)" }}>{d.risk}/100</b> · {d.reports} reports · {Math.max(0, d.open - 1)} open injured</div>
    </div>
  );
}

/* ============================================================
   FEED
   ============================================================ */
const CONFIRMS_NEEDED = 1;  // a single peer confirmation publishes a held report (mirrors backend)

function FeedCard({ r, go }: any) {
  const { toggleLike, isLiked, confirmReport, shareReport, me, isSaved, toggleSave } = useStore();
  const liked = isLiked(r.id);
  const saved = isSaved(r.id);
  const pending = r.moderationState === "pending_confirmation";
  const isOwner = me && r.reporterId === me.id;
  const remaining = Math.max(0, CONFIRMS_NEEDED - (r.confirmCount ?? 0));
  return (
    <div className="card post-card" style={{ overflow: "hidden", ...(pending ? { borderColor: "var(--gold-200)", boxShadow: "inset 3px 0 0 var(--gold-600)" } : {}) }}>
      {pending && (
        <div className="row" style={{ gap: 8, padding: "8px 16px", background: "var(--gold-50)", borderBottom: "1px solid var(--gold-200)", fontSize: 12, color: "var(--gold-700, var(--gold-600))", fontWeight: 600 }}>
          <Icon name="clock" size={13} />
          <span>{isOwner ? "Your report is awaiting community verification" : "Pending verification - help confirm this sighting"}</span>
          <span className="chip chip-sm" style={{ marginLeft: "auto", background: "var(--card)", color: "var(--gold-600)", border: "none", fontWeight: 700 }}>{r.confirmCount ?? 0}/{CONFIRMS_NEEDED} confirmed</span>
        </div>
      )}
      <div className="card-pad" style={{ paddingBottom: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 10, cursor: "pointer", minWidth: 0, flex: 1 }} onClick={() => go("user", r.reporterId)}>
            <Avatar name={r.reporter} color={r.reporterColor} size={40} avatar={r.reporterAvatar} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 7 }}>
                <b className="link-name" style={{ fontSize: 14 }}>{r.reporter}</b>
                <span className="mono" style={{ fontSize: 10.5, color: "var(--green)", background: "var(--green-50)", padding: "1px 7px", borderRadius: 99 }}>rep {r.reporterRep}</span>
              </div>
              <div className="muted" style={{ fontSize: 12 }}><Icon name="location" size={11} style={{ verticalAlign: -1 }} /> {r.ward} · {r.time}</div>
            </div>
          </div>
          {pending
            ? <span className="chip chip-sm" style={{ background: "var(--gold-50)", color: "var(--gold-600)", border: "1px solid var(--gold-200)", fontWeight: 700 }}><Icon name="clock" size={11} /> Needs confirmation</span>
            : <StatusChip status={r.status} sm />}
        </div>
      </div>
      <div style={{ position: "relative", cursor: "pointer" }} onClick={() => go("report", r.id)}>
        <Gallery report={r} h={260} r={0} label={`${SPECIES[r.species].label} - ${r.ward}`} />
        <div className="row" style={{ position: "absolute", left: 14, bottom: 14, gap: 6 }}>
          <SpeciesChip sp={r.species} sm />
          {r.injured && <InjuredTag sm />}
        </div>
        <div style={{ position: "absolute", right: 14, top: 14 }} className="chip chip-sm">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--ff-mono)", fontSize: 11, color: "var(--green)" }}><Icon name="sparkle" size={12} /> {Math.round(r.conf * 100)}%</span>
        </div>
      </div>
      <div className="card-pad" style={{ paddingTop: 14 }}>
        {(() => {
          const parts = (r.note || "").split("[Injury - reporter]");
          const base = parts[0].trim();
          const humanInjury = parts[1]?.trim();
          return (
            <>
              {base ? <p style={{ fontSize: 14.5, lineHeight: 1.5 }}>{base}</p> : null}
              {humanInjury && (
                <div className="ai-note" style={{ borderTop: "none", paddingTop: 10, color: "var(--coral-600)" }}>
                  <Icon name="cross" size={14} style={{ color: "var(--coral)" }} />
                  <span><span className="chip chip-sm tag-injured" style={{ marginRight: 6 }}><Icon name="user" size={10} /> Reporter</span>{humanInjury}</span>
                </div>
              )}
              {r.injured && (
                <div className="ai-note" style={{ borderTop: "none", paddingTop: 8, color: "var(--ink-3)" }}>
                  <Icon name="sparkle" size={14} style={{ color: "var(--green)", flex: "0 0 14px" }} />
                  <span><span className="chip chip-sm" style={{ marginRight: 6, background: "var(--green-50)", color: "var(--green)", borderColor: "var(--green-200)", fontFamily: "var(--ff-mono)", fontSize: 10 }}>AI</span>possible injury ({r.aiInjury.severity}) - {r.aiInjury.rationale} <i style={{ color: "var(--ink-4)" }}>estimate, may be wrong.</i></span>
                </div>
              )}
            </>
          );
        })()}
        {pending && !isOwner && !r.confirmedByMe && (
          <div className="ai-note" style={{ borderTop: "none", paddingTop: 10, color: "var(--ink-3)" }}>
            <Icon name="shield" size={14} style={{ color: "var(--gold-600)", flex: "0 0 14px" }} />
            <span>Seen this animal or trust the reporter? A single <b>confirmation</b> publishes it to everyone - and every extra confirmation boosts the reporter's trust &amp; points.</span>
          </div>
        )}
        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <LikeButton liked={liked} count={r.likes} onClick={() => toggleLike(r.id)} />
          <button className="btn btn-ghost btn-sm" onClick={() => go("report", r.id)}><Icon name="comment" size={15} /> {r.commentCount ?? r.comments.length}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => shareReport(r.id)}><Icon name="share" size={15} /></button>
          <button className="btn btn-ghost btn-sm" title={saved ? "Saved" : "Save"} onClick={() => toggleSave(r.id)} style={{ color: saved ? "var(--gold-600)" : "var(--ink-3)" }}><Icon name="star" size={15} /></button>
          <div style={{ flex: 1 }}></div>
          <ConfirmButton report={r} isOwner={isOwner} onConfirm={() => confirmReport(r.id)} />
        </div>
      </div>
    </div>
  );
}

export function Feed({ go }: any) {
  const { reports, user, me, search } = useStore();
  const { t } = useI18n();
  const [tab, setTab] = useState("recent");
  const q = (search || "").trim().toLowerCase();

  // Pending posts awaiting THIS member's verification (not their own, not already confirmed).
  const toVerify = useMemo(
    () => reports.filter((r: any) => r.moderationState === "pending_confirmation" && !(me && r.reporterId === me.id) && !r.confirmedByMe),
    [reports, me],
  );

  // The user's "home" ward may be a ward name OR a district name (default is "Kathmandu", a
  // district). Resolve to a district either way so "Near me" always works.
  const userDistrict = WARDS.find((w: any) => w.name === user.ward)?.district || user.ward || "Kathmandu";
  let list = tab === "verify" ? toVerify
    : tab === "injured" ? reports.filter((r: any) => r.injured)
    : tab === "nearby" ? reports.filter((r: any) => r.district === userDistrict)
    : tab === "popular" ? reports.slice().sort((a: any, b: any) => b.likes - a.likes)
    // Recent: published first, then still-pending, each newest-first (pending stay easy to spot).
    : reports;
  if (q) list = list.filter((r: any) => r.note.toLowerCase().includes(q) || r.ward.toLowerCase().includes(q) || r.reporter.toLowerCase().includes(q) || SPECIES[r.species].label.toLowerCase().includes(q));
  list = list.slice(0, 40);

  // Trending areas computed from the real reports.
  const trending = useMemo(() => {
    const m: any = {};
    reports.forEach((r: any) => { if (!r.ward) return; m[r.ward] = m[r.ward] || { name: r.ward, reports: 0, injured: 0 }; m[r.ward].reports++; if (r.injured) m[r.ward].injured++; });
    return Object.values(m).sort((a: any, b: any) => b.reports - a.reports).slice(0, 6);
  }, [reports]);
  // Top reporters from the live leaderboard.
  const [topReporters, setTopReporters] = useState<any[]>([]);
  useEffect(() => {
    let on = true;
    api.leaderboard().then((rows: any[]) => { if (on) setTopReporters(rows.slice(0, 5).map((r, i) => ({ id: r.id, rank: i + 1, name: r.display_name || r.username, color: colorFor(r.id), avatar: r.avatar_url, points: r.points }))); }).catch(() => {});
    return () => { on = false; };
  }, []);

  return (
    <div className="page" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 28 }}>
      <div>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
          <div className="seg" style={{ width: 460 }}>
            {[["recent",t("feed.recent")],["popular",t("feed.popular")],["nearby",t("feed.nearby")],["injured",t("feed.injured")],["verify",t("feed.toVerify")]].map(o => (
              <button key={o[0]} className={tab === o[0] ? "on" : ""} onClick={() => setTab(o[0])} style={{ position: "relative" }}>
                {o[1]}
                {o[0] === "verify" && toVerify.length > 0 && <span style={{ marginLeft: 5, fontSize: 10.5, fontWeight: 700, background: "var(--gold-600)", color: "#fff", borderRadius: 99, padding: "0 6px", minWidth: 16, display: "inline-block", textAlign: "center" }}>{toVerify.length}</span>}
              </button>
            ))}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => go("submit")}><Icon name="plus" size={15} /> Report</button>
        </div>
        {tab === "verify" && (
          <div className="row" style={{ gap: 8, marginBottom: 14, padding: "10px 13px", background: "var(--gold-50)", border: "1px solid var(--gold-200)", borderRadius: 12, fontSize: 12.5, color: "var(--gold-700, var(--gold-600))" }}>
            <Icon name="shield" size={15} />
            <span>These sightings are waiting for the community to verify them. Confirm the ones you recognise - a <b>single confirmation</b> makes one public. You earn points for verifying, and the reporter earns more trust with every confirmation.</span>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {list.map((r: any) => <FeedCard key={r.id} r={r} go={go} />)}
          {!list.length && (
            tab === "verify"
              ? <Empty icon="check" title="Nothing to verify right now" text="You're all caught up - there are no pending sightings waiting for your confirmation." />
              : <div className="card card-pad muted" style={{ textAlign: "center" }}>No reports match.</div>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* impact */}
        <div className="card card-pad" style={{ position: "sticky", top: 16, background: "var(--tint-blue)" }}>
          <div className="section-title" style={{ marginBottom: 12 }}>{t("feed.yourImpact")}</div>
          <div className="grid-3" style={{ gap: 10 }}>
            {[["points", user.points.toLocaleString(), "var(--green)"],["reports", user.reports, "var(--ink)"],["rep", user.reputation, "var(--gold-600)"]].map((s: any, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <div className="kpi" style={{ fontSize: 22, color: s[2] }}>{s[1]}</div>
                <div className="muted" style={{ fontSize: 11, fontWeight: 600 }}>{s[0]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* trending areas */}
        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 12 }}>{t("feed.trending")}</div>
          {!trending.length && <div className="muted" style={{ fontSize: 13 }}>No reports yet.</div>}
          {trending.map((w: any, i) => {
            const max = trending[0]?.reports || 1;
            return (
              <div key={w.name} style={{ marginBottom: 10 }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                  <span className="row" style={{ gap: 8, fontSize: 13, fontWeight: 600 }}><span className="mono muted" style={{ fontSize: 11 }}>{i + 1}</span>{w.name}</span>
                  <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{w.reports} · <span style={{ color: "var(--coral-600)" }}>{w.injured} inj</span></span>
                </div>
                <div className="prob-track" style={{ height: 6 }}><div className="prob-fill" style={{ width: (w.reports / max * 100) + "%", background: "var(--green-400)" }}></div></div>
              </div>
            );
          })}
        </div>

        {/* top reporters */}
        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <div className="section-title">{t("feed.topReporters")}</div>
            <button className="btn-sm" style={{ color: "var(--green)", fontWeight: 700, fontSize: 12 }} onClick={() => go("leaderboard")}>{t("label.seeAll")}</button>
          </div>
          {topReporters.map((l: any) => (
            <div key={l.rank} className="row lb-row" onClick={() => go("user", l.id)} style={{ gap: 10, padding: "7px 6px", borderRadius: 8, cursor: "pointer" }}>
              <span className="mono" style={{ width: 16, fontSize: 12, fontWeight: 700, color: l.rank <= 3 ? "var(--gold-600)" : "var(--ink-4)" }}>{l.rank}</span>
              <Avatar name={l.name} color={l.color} size={30} avatar={l.avatar} />
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13 }}>{l.name}</div></div>
              <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{l.points.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   LEADERBOARD
   ============================================================ */
export function Leaderboard({ go }: any) {
  const { user, me: myUser } = useStore();
  // Default to the full board so you always see yourself ranked; "My district" (your saved home
  // area from Settings) is one click away.
  const [scope, setScope] = useState("all");
  const [live, setLive] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // "My district" is derived from the SAVED home area (Settings), not from where the user's reports
  // happen to be. Resolve the saved ward to its district (a ward may itself be a district name).
  const homeWard = user.defaultWard || null;
  const myArea = homeWard ? (WARDS.find((w: any) => w.name === homeWard)?.district || homeWard) : null;

  useEffect(() => {
    let on = true;
    setLoading(true);
    // "This week" pulls a real weekly board (points earned in the last 7 days); the other scopes
    // filter the all-time board client-side.
    api.leaderboard(scope === "week" ? "week" : "all").then((rows: any[]) => {
      if (!on) return;
      setLoading(false);
      setLive(rows.map((r: any) => ({
        id: r.id,
        name: r.display_name || r.username,
        handle: "@" + r.username,
        color: colorFor(r.id),
        avatar: r.avatar_url,
        rep: Math.round(r.reputation),
        points: r.points,
        reports: r.reports_count ?? 0,
        // For the current user, show their SAVED home area (Settings) as their location.
        ward: (myUser && r.id === myUser.id && homeWard) ? homeWard : (r.ward || "Kathmandu"),
        level: r.level,
        levelName: levelName(r.points),
        badges: 0,
        trend: "0",
        me: !!(myUser && r.id === myUser.id),
      })));
    }).catch(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [myUser, scope]);

  const SRC = live;  // live leaderboard only - no seed/mock fallback

  const ranked = useMemo(() => {
    let list = SRC.slice();
    // Weekly ordering already comes from the server. "My district" filters to reporters whose
    // home district matches yours - and always keeps YOU in the list.
    if (scope === "area" && myArea) list = list.filter((l: any) => l.me || (WARDS.find((w: any) => w.name === l.ward)?.district || l.ward) === myArea);
    return list.map((l: any, i: number) => ({ ...l, displayRank: i + 1 }));
  }, [scope, myArea, SRC]);

  const podium = [ranked[1], ranked[0], ranked[2]].filter(Boolean);
  const podiumH = [110, 142, 92];
  const me = ranked.find((l: any) => l.me);
  const chartData = SRC.slice(0, 8).map((l: any) => ({ name: l.name.split(" ")[0], points: l.points, me: l.me }));

  return (
    <div className="page" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 360px", gap: 28 }}>
      <div>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 28 }}>Community leaderboard</h1>
            <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>Points come from <b style={{ color: "var(--green)" }}>verified</b> reporting - quality over quantity.</p>
          </div>
          <div className="seg" style={{ width: 300 }}>
            {[["all","All time"],["week","This week"],["area","My district"]].map(o => <button key={o[0]} className={scope === o[0] ? "on" : ""} onClick={() => setScope(o[0])}>{o[1]}</button>)}
          </div>
        </div>

        {/* podium */}
        {podium.length === 3 && (
          <div className="card card-pad" style={{ background: "var(--tint-gold)" }}>
            <div className="row" style={{ alignItems: "flex-end", justifyContent: "center", gap: 22, padding: "6px 0" }}>
              {podium.map((l: any, i) => (
                <div key={l.rank} onClick={() => go("user", l.id)} style={{ textAlign: "center", flex: 1, maxWidth: 150, cursor: "pointer" }}>
                  <div style={{ position: "relative", display: "inline-block" }}>
                    <Avatar name={l.name} color={l.color} size={i === 1 ? 66 : 52} ring avatar={l.avatar} />
                    {i === 1 && <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", color: "var(--gold-600)" }}><Icon name="trophy" size={20} /></div>}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginTop: 8 }}>{l.name.split(" ")[0]}</div>
                  <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{l.points.toLocaleString()} pts</div>
                  <div style={{ height: podiumH[i], background: i === 1 ? "linear-gradient(180deg,var(--gold),var(--gold-600))" : "var(--green-100)", borderRadius: "12px 12px 0 0", marginTop: 10, display: "grid", placeItems: "start center", paddingTop: 10 }}>
                    <span style={{ fontFamily: "var(--ff-display)", fontWeight: 800, fontSize: 26, color: i === 1 ? "#3a2a05" : "var(--green)" }}>{l.displayRank}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* table */}
        <div className="card" style={{ marginTop: 20, overflow: "hidden" }}>
          {ranked.map((l: any, idx: number) => (
            <div key={l.handle} className="row lb-row" onClick={() => go("user", l.id)} style={{ gap: 14, padding: "13px 18px", borderTop: idx ? "1px solid var(--line)" : "none", background: l.me ? "var(--green-50)" : "transparent", cursor: "pointer" }}>
              <span className="mono" style={{ width: 24, fontSize: 14, fontWeight: 700, color: l.displayRank <= 3 ? "var(--gold-600)" : "var(--ink-4)" }}>{l.displayRank}</span>
              <Avatar name={l.name} color={l.color} size={38} ring={l.displayRank <= 3} avatar={l.avatar} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 7 }}><b style={{ fontSize: 14 }}>{l.name}</b>{l.me && <span className="chip chip-sm" style={{ background: "var(--green)", color: "#fff", border: "none" }}>You</span>}</div>
                <div className="muted" style={{ fontSize: 12 }}><span className="chip chip-sm" style={{ padding: "1px 7px", marginRight: 6 }}>Lv {l.level}</span>{l.levelName} · {l.reports} reports · {l.ward}</div>
              </div>
              <div style={{ width: 92 }} className="lb-rep">
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 3 }}><span style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 600 }}>REP</span><span className="mono" style={{ fontSize: 11, fontWeight: 700 }}>{l.rep}</span></div>
                <div className="prob-track" style={{ height: 6 }}><div className="prob-fill" style={{ width: l.rep + "%", background: l.rep >= 80 ? "var(--green-400)" : "var(--gold)" }}></div></div>
              </div>
              <div style={{ textAlign: "right", width: 76 }}>
                <div className="mono" style={{ fontWeight: 700, fontSize: 14 }}>{l.points.toLocaleString()}</div>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: "var(--ink-4)" }}>{scope === "week" ? "this week" : "pts"}</div>
              </div>
            </div>
          ))}
          {loading && !ranked.length && <div className="card-pad muted" style={{ textAlign: "center" }}>Loading leaderboard…</div>}
          {!loading && !ranked.length && <div className="card-pad muted" style={{ textAlign: "center" }}>{scope === "week" ? "No points earned across the community this week yet." : scope === "area" ? "No reporters in your district yet." : "No reporters yet."}</div>}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {me && (
          <div className="card card-pad" style={{ background: "linear-gradient(135deg,var(--green),var(--green-500))", color: "#fff" }}>
            <div style={{ fontSize: 12, opacity: .85, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em" }}>Your standing</div>
            <div className="row" style={{ gap: 12, marginTop: 12 }}>
              <Avatar name={me.name} color="#0c3d24" size={48} ring />
              <div>
                <div style={{ fontFamily: "var(--ff-display)", fontWeight: 800, fontSize: 28 }}>#{me.displayRank}</div>
                <div style={{ fontSize: 12.5, opacity: .9 }}>{me.points.toLocaleString()} {scope === "week" ? "pts this week" : "pts"} · Lv {me.level}</div>
              </div>
            </div>
          </div>
        )}

        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 12 }}>Points · top 8</div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 6, right: 12, top: 0, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={62} tick={{ fontSize: 11, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "var(--paper-2)" }} />
                <Bar dataKey="points" name="Points" radius={[0, 6, 6, 0]}>
                  {chartData.map((d: any, i: number) => <Cell key={i} fill={d.me ? "var(--gold)" : "var(--green-400)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 12 }}>How points work</div>
          {[["Valid report","+20","var(--green)"],["Peer-confirmed","+30","var(--green)"],["Agrees with AI","+10","var(--green)"],["Injured (confirmed)","+15","var(--gold-600)"],["Flagged as spam","−25","var(--coral-600)"]].map((p,i)=>(
            <div key={i} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderTop: i ? "1px solid var(--line)" : "none" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p[0]}</span>
              <span className="mono" style={{ fontWeight: 700, fontSize: 13.5, color: p[2] }}>{p[1]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PROFILE  (all data is real, from /users/{id}/profile + the live reports)
   ============================================================ */
const BADGE_META: any = {
  first_report: ["paw", "#3aa3b5"], reporter_10: ["stack", "#d98a1f"], reporter_50: ["trophy", "#6d5bd0"],
  ward_explorer: ["map", "#3f7ec2"], verified_reporter: ["shield", "#157d8f"], pillar_of_trust: ["shield", "#2e9e5b"],
  helper: ["heart", "#6d5bd0"], first_responder: ["cross", "#2e9e5b"], top_helper: ["heart", "#c2402a"],
  rapid_responder: ["flame", "#d98a1f"], on_a_roll: ["flame", "#e0662a"], community_guardian: ["shield", "#3f7ec2"],
  false_alarm: ["alert", "#c2402a"],
};

const PROFILE_PAGE = 12;  // reports fetched per lazy-load page

function ProfilePage({ person, profile, isMe, go }: any) {
  const { reports } = useStore();
  const ME = person;
  const [tab, setTab] = useState("reports");
  const own = useMemo(() => reports.filter((r: any) => r.reporterId === person.id), [reports, person.id]);

  // COMPLETE report history, lazy-loaded page by page from the server (no fixed cap). `own` (the
  // in-store feed slice) still powers the aggregate charts below.
  const [profileReports, setProfileReports] = useState<any[]>([]);
  const [repHasMore, setRepHasMore] = useState(true);
  const [repLoading, setRepLoading] = useState(false);
  const repOffset = useRef(0);
  const loadMoreReports = useCallback(async () => {
    setRepLoading(true);
    try {
      const rows = await api.userReports(person.id, PROFILE_PAGE, repOffset.current);
      repOffset.current += rows.length;
      setProfileReports(prev => [...prev, ...rows.map(adaptReport)]);
      setRepHasMore(rows.length === PROFILE_PAGE);
    } catch { setRepHasMore(false); } finally { setRepLoading(false); }
  }, [person.id]);
  useEffect(() => {
    repOffset.current = 0; setProfileReports([]); setRepHasMore(true);
    loadMoreReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [person.id]);
  // Infinite scroll: load the next page when the sentinel scrolls into view.
  const sentinel = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (tab !== "reports" || !sentinel.current) return;
    const io = new IntersectionObserver((e) => {
      if (e[0].isIntersecting && repHasMore && !repLoading) loadMoreReports();
    }, { rootMargin: "300px" });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [tab, repHasMore, repLoading, loadMoreReports]);

  const rep = Math.round(ME.reputation || 0);
  const ring = 2 * Math.PI * 34;
  const reportsCount = profile?.stats?.total_reports ?? own.length;
  const badgesCount = profile?.badges?.length ?? 0;
  const rank = profile?.rank ?? null;
  const allBadges = profile?.all_badges ?? [];
  // Reports this user has peer-confirmed (their review contribution) - own profile only.
  const [confirmedReports, setConfirmedReports] = useState<any[]>([]);
  useEffect(() => {
    if (!isMe) { setConfirmedReports([]); return; }
    api.myConfirmedReports().then((rows: any[]) => setConfirmedReports(rows.map(adaptReport))).catch(() => {});
  }, [isMe]);
  // Real points/reputation growth from the PointEvent audit trail.
  const [growth, setGrowth] = useState<any[]>([]);
  useEffect(() => {
    api.pointsHistory(person.id, 30).then((d: any) => setGrowth(d.series || [])).catch(() => setGrowth([]));
  }, [person.id]);
  const tabs: any[] = [["reports", "Reports"], ["badges", "Badges"], ...(isMe ? [["confirmed", "Confirmed"]] : []), ["activity", "Activity"]];
  const earnedAt: any = {};
  (profile?.badges ?? []).forEach((b: any) => { earnedAt[b.code] = b.awarded_at; });
  const rb = profile?.reputation_breakdown ?? {};

  const mySpecies = useMemo(() => Object.keys(SPECIES).map(k => ({ name: SPECIES[k].label, value: own.filter((r: any) => r.species === k).length, color: SPECIES[k].hex })).filter(d => d.value > 0), [own]);

  // Real 14-day activity computed from this reporter's own reports (by report age in minutes).
  const activitySeries = useMemo(() => {
    const days: any[] = [];
    for (let d = 13; d >= 0; d--) {
      const from = d * 1440, to = (d + 1) * 1440;
      const n = own.filter((r: any) => (r.mins ?? 0) >= from && (r.mins ?? 0) < to).length;
      days.push({ day: d === 0 ? "Today" : d === 1 ? "Yest" : `-${d}d`, reports: n });
    }
    return days;
  }, [own]);
  const nextLevel = ME.points >= 3500 ? 5000 : ME.points >= 1700 ? 3500 : ME.points >= 1000 ? 1700 : ME.points >= 400 ? 1000 : 400;

  return (
    <div className="page">
      {!isMe && (
        <button className="btn btn-ghost btn-sm" onClick={() => go("feed")} style={{ marginBottom: 14 }}><Icon name="chevLeft" size={15} /> Back to feed</button>
      )}
      {/* header */}
      <div className="card" style={{ overflow: "hidden" }}>
        <div style={{ height: 120, background: "linear-gradient(120deg, var(--green), var(--green-500))", position: "relative" }}>
          <svg viewBox="0 0 24 24" style={{ position: "absolute", right: 24, top: 12, width: 130, opacity: 0.16, color: "#fff" }} fill="currentColor"><Icon name="paw" size={130} /></svg>
          {rank && rank <= 10 && (
            <span className="chip" style={{ position: "absolute", left: 24, top: 16, background: "rgba(255,255,255,.18)", color: "#fff", border: "1px solid rgba(255,255,255,.3)", fontWeight: 700 }}><Icon name="trophy" size={13} /> Rank #{rank}</span>
          )}
        </div>
        <div className="card-pad" style={{ paddingTop: 0, position: "relative", zIndex: 2 }}>
          {/* avatar straddles the cover, actions on the right */}
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <div style={{ border: "4px solid var(--card)", borderRadius: 99, background: "var(--card)", lineHeight: 0, marginTop: -52 }}><Avatar name={ME.name} color={ME.color} size={104} avatar={ME.avatar} /></div>
            <div style={{ paddingBottom: 4 }}>
              {isMe ? (
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-gold btn-sm" onClick={() => downloadCertificate(ME)}><Icon name="award" size={15} /> Certificate</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => go("settings")}><Icon name="settings" size={15} /> Edit profile</button>
                </div>
              ) : null}
            </div>
          </div>
          {/* name + meta sit below the cover on white */}
          <div style={{ marginTop: 14 }}>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}><h1 style={{ fontSize: 26 }}>{ME.name}</h1><span className="chip" style={{ background: "var(--green-50)", color: "var(--green)", borderColor: "var(--green-200)", fontWeight: 700 }}><Icon name="shield" size={13} /> {ME.levelName}</span></div>
            <div className="muted row" style={{ fontSize: 13.5, marginTop: 6, gap: 6, flexWrap: "wrap" }}>
              <span>{ME.handle}</span>
              <span>·</span>
              <span className="row" style={{ gap: 3 }}><Icon name="location" size={12} /> {ME.ward}</span>
              <span>·</span>
              <span>Lv {ME.level}</span>
              {isMe && <><span>·</span><span>joined {ME.joined}</span></>}
            </div>
          </div>

          <div className="grid-4" style={{ marginTop: 22, gap: 14 }}>
            {[["points", ME.points.toLocaleString(), "var(--green)"],["reports", reportsCount, "var(--ink)"],["badges", badgesCount, "var(--gold-600)"]].map((s: any, i) => (
              <div key={i} className="card-pad" style={{ background: "var(--paper-2)", borderRadius: 14, textAlign: "center" }}>
                <div className="kpi" style={{ color: s[2] }}>{s[1]}</div><div className="muted" style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>{s[0]}</div>
              </div>
            ))}
            <div className="card-pad" style={{ background: "var(--paper-2)", borderRadius: 14, display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
              <svg width="80" height="80" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="34" fill="none" stroke="var(--line)" strokeWidth="8" />
                <circle cx="40" cy="40" r="34" fill="none" stroke="var(--green)" strokeWidth="8" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring * (1 - rep / 100)} transform="rotate(-90 40 40)" />
                <text x="40" y="38" textAnchor="middle" fontFamily="Bricolage Grotesque" fontWeight="700" fontSize="20" fill="var(--ink)">{rep}</text>
                <text x="40" y="52" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="8" fill="var(--ink-3)">REP</text>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* engagement strip: level progress + streak + helped + trust */}
      {(() => {
        const st = profile?.stats || {};
        const prevLevel = ME.points >= 3500 ? 3500 : ME.points >= 1700 ? 1700 : ME.points >= 1000 ? 1000 : ME.points >= 400 ? 400 : 0;
        const pct = Math.min(100, Math.round(((ME.points - prevLevel) / (nextLevel - prevLevel)) * 100));
        const strikes = st.spam_strikes || 0;
        return (
          <div className="grid-4" style={{ marginTop: 20, gap: 16 }}>
            <div className="card card-pad" style={{ gridColumn: "span 2" }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                <div className="section-title">Progress to next level</div>
                <span className="mono muted" style={{ fontSize: 12 }}>{ME.points.toLocaleString()} / {nextLevel.toLocaleString()} pts</span>
              </div>
              <div className="prob-track" style={{ height: 10 }}><div className="prob-fill" style={{ width: pct + "%", background: "linear-gradient(90deg,var(--green),var(--gold-600))" }} /></div>
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{nextLevel - ME.points > 0 ? `${(nextLevel - ME.points).toLocaleString()} points to go` : "Top tier reached"} · earn points by reporting accurately, helping, verifying & moderating.</div>
            </div>
            <div className="card card-pad" style={{ textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div className="row" style={{ gap: 6, justifyContent: "center", color: "var(--gold-600)" }}><Icon name="flame" size={20} /><span className="kpi" style={{ fontSize: 26 }}>{st.reporting_streak || 0}</span></div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>day streak</div>
            </div>
            <div className="card card-pad" style={{ textAlign: "center", display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div className="row" style={{ gap: 6, justifyContent: "center", color: "var(--coral-600)" }}><Icon name="heart" size={18} /><span className="kpi" style={{ fontSize: 26 }}>{st.helped_count || 0}</span></div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginTop: 4 }}>cases helped</div>
            </div>
            {isMe && (strikes > 0 || st.suspended) && (
              <div className="card card-pad" style={{ gridColumn: "span 4", background: "var(--coral-50)", border: "1px solid var(--coral-100)" }}>
                <div className="row" style={{ gap: 8, color: "var(--coral-600)" }}>
                  <Icon name="alert" size={16} />
                  <b style={{ fontSize: 13.5 }}>Trust &amp; safety</b>
                  <span className="chip chip-sm" style={{ background: "var(--card)", color: "var(--coral-600)", border: "none", fontWeight: 700 }}>{strikes} spam strike{strikes === 1 ? "" : "s"}</span>
                  {st.suspended && <span className="chip chip-sm" style={{ background: "var(--coral-600)", color: "#fff", border: "none", fontWeight: 700 }}>posting restricted</span>}
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Reports confirmed as spam reduce your reputation and points. Repeated offences trigger posting cooldowns. Report accurately to recover your standing.</div>
              </div>
            )}
          </div>
        );
      })()}

      {/* charts row */}
      <div className="grid-2" style={{ marginTop: 20, gridTemplateColumns: "1.5fr 1fr", alignItems: "start" }}>
        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 8 }}>Your reporting activity</div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activitySeries} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
                <defs><linearGradient id="pAct" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--green)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--green)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="reports" name="Reports" stroke="var(--green)" strokeWidth={2.5} fill="url(#pAct)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 8 }}>Species you report</div>
          <div style={{ height: 200, position: "relative" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={mySpecies} dataKey="value" nameKey="name" innerRadius={48} outerRadius={76} paddingAngle={2} stroke="none">
                  {mySpecies.map((d: any, i: number) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip content={<ChartTip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 4 }}>
            {mySpecies.map((d: any, i: number) => <span key={i} className="row" style={{ gap: 6, fontSize: 11.5, color: "var(--ink-3)" }}><i style={{ width: 9, height: 9, borderRadius: 99, background: d.color }}></i>{d.name}</span>)}
          </div>
        </div>
      </div>

      {/* points / reputation growth over the last 30 days (real, from the audit trail) */}
      <div className="card card-pad" style={{ marginTop: 20 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <div className="section-title">Points growth · last 30 days</div>
          {growth.length > 0 && <span className="chip chip-sm" style={{ background: "var(--green-50)", color: "var(--green)", border: "none", fontWeight: 700 }}>+{Math.max(0, (growth[growth.length - 1]?.points || 0) - (growth[0]?.points || 0) + (growth[0]?.gained || 0))} pts</span>}
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 10 }}>Your running total climbs as you report accurately, verify sightings, and help on cases.</p>
        <div style={{ height: 210 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={growth} margin={{ left: -14, right: 8, top: 8, bottom: 0 }}>
              <defs><linearGradient id="pGrow" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--gold-600)" stopOpacity={0.32} /><stop offset="100%" stopColor="var(--gold-600)" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 9.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} width={34} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="points" name="Total points" stroke="var(--gold-600)" strokeWidth={2.5} fill="url(#pGrow)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* reputation breakdown + progress */}
      <div className="grid-2" style={{ marginTop: 20, alignItems: "start" }}>
        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 14 }}>Reputation breakdown</div>
          {[["Confirmation rate", rb.confirmation_rate ?? 0, "var(--green-400)", `${rb.confirmed ?? 0} of ${rb.total ?? 0} reports peer-confirmed`],["AI-agreement rate", rb.ai_agreement_rate ?? 0, "var(--sp-buffalo)", "labels that matched the model"],["Flag rate", rb.flag_rate ?? 0, "var(--coral)", "reports ever flagged (lower is better)"]].map((m: any,i)=>(
            <div key={i} style={{ marginBottom: 16 }}>
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}><span style={{ fontSize: 13.5, fontWeight: 600 }}>{m[0]}</span><span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{m[1]}%</span></div>
              <div className="prob-track" style={{ height: 8 }}><div className="prob-fill" style={{ width: m[1] + "%", background: m[2] }}></div></div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 5 }}>{m[3]}</div>
            </div>
          ))}
          <div className="ai-note"><Icon name="info" size={14} /><span>Reputation = weighted blend of confirmation rate, AI-agreement, and (inverse) flag rate. High reputation lets your reports publish without waiting.</span></div>
        </div>

        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
            <div className="section-title">Progress to level {ME.level + 1}</div>
            <span className="mono muted" style={{ fontSize: 12 }}>{ME.points.toLocaleString()} / {nextLevel.toLocaleString()}</span>
          </div>
          <div className="prob-track" style={{ height: 12, marginBottom: 18 }}><div className="prob-fill" style={{ width: Math.min(100, ME.points / nextLevel * 100) + "%", background: "linear-gradient(90deg,var(--gold),var(--green-400))" }}></div></div>

          {/* Unlockable reward: instant publishing at reputation 75 */}
          {isMe && rep < 75 && (
            <div style={{ padding: 12, background: "var(--green-50)", border: "1px solid var(--green-200)", borderRadius: 12, marginBottom: 16 }}>
              <div className="row" style={{ gap: 8, marginBottom: 6 }}><Icon name="sparkle" size={14} style={{ color: "var(--green)" }} /><b style={{ fontSize: 13 }}>Unlock: instant publishing</b><span className="mono muted" style={{ fontSize: 11.5, marginLeft: "auto" }}>{rep}/75 rep</span></div>
              <div className="prob-track" style={{ height: 7 }}><div className="prob-fill" style={{ width: Math.min(100, rep / 75 * 100) + "%", background: "var(--green)" }} /></div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>Reach reputation 75 and your reports publish immediately, no waiting for confirmation.</div>
            </div>
          )}

          <div className="section-title" style={{ marginBottom: 12 }}>Next milestones</div>
          {(() => {
            const st2 = profile?.stats || {};
            const PROG: any = {
              first_report: [st2.published_reports || 0, 1], reporter_10: [st2.published_reports || 0, 10],
              reporter_50: [st2.published_reports || 0, 50], ward_explorer: [st2.distinct_wards || 0, 5],
              verified_reporter: [Math.round(rep), 80], pillar_of_trust: [Math.round(rep), 95],
              helper: [st2.resolved_reports || 0, 3], top_helper: [st2.helped_count || 0, 10],
              on_a_roll: [st2.reporting_streak || 0, 7],
            };
            const next = allBadges.filter((b: any) => !b.earned && !b.negative)
              .map((b: any) => ({ ...b, prog: PROG[b.code] }))
              .sort((a: any, b: any) => {
                const ra = a.prog ? a.prog[0] / a.prog[1] : 0, rb2 = b.prog ? b.prog[0] / b.prog[1] : 0;
                return rb2 - ra;  // closest to completion first
              }).slice(0, 5);
            if (!next.length) return <div className="muted" style={{ fontSize: 13 }}>All milestones unlocked - amazing!</div>;
            return next.map((b: any) => {
              const [icon, color] = BADGE_META[b.code] || ["star", "#3aa3b5"];
              const cur = b.prog ? Math.min(b.prog[0], b.prog[1]) : 0, target = b.prog ? b.prog[1] : 0;
              const pct = b.prog ? Math.min(100, Math.round(cur / target * 100)) : 0;
              return (
                <div key={b.code} className="row" style={{ gap: 12, padding: "10px 0", borderTop: "1px solid var(--line)", alignItems: "flex-start" }}>
                  <div className="badge-medal" style={{ width: 34, height: 34, background: color, opacity: .55, flexShrink: 0 }}><Icon name={icon} size={16} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}><div style={{ fontWeight: 700, fontSize: 13 }}>{b.name}</div>{b.prog && <span className="mono muted" style={{ fontSize: 11 }}>{cur}/{target}</span>}</div>
                    <div className="muted" style={{ fontSize: 11.5, margin: "2px 0 5px" }}>{b.description}</div>
                    {b.prog && <div className="prob-track" style={{ height: 5 }}><div className="prob-fill" style={{ width: pct + "%", background: color }} /></div>}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      {/* How the reward system works - a clear guide so users know how to earn and advance */}
      {isMe && (
        <div className="card card-pad" style={{ marginTop: 20 }}>
          <div className="section-title" style={{ marginBottom: 6 }}>How SafeTails rewards work</div>
          <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>Every action helps street animals and earns recognition. Here's how each part fits together.</p>
          <div className="grid-2" style={{ gap: 16, alignItems: "start" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}><Icon name="zap" size={14} style={{ color: "var(--gold-600)" }} /> Points (XP) - how you earn</div>
              {[["Submit a valid report", "+10"],["Report an injured/emergency case", "+20"],["Your species label matches the AI", "+5"],["Help resolve a case", "+15"],["Confirm someone else's sighting", "+2"],["A report flagged as spam", "−8 to −25"]].map((p: any, i) => (
                <div key={i} className="row" style={{ justifyContent: "space-between", padding: "6px 0", borderTop: i ? "1px solid var(--line)" : "none", fontSize: 13 }}>
                  <span style={{ color: "var(--ink-2)" }}>{p[0]}</span>
                  <span className="mono" style={{ fontWeight: 700, color: p[1].includes("−") ? "var(--coral-600)" : "var(--green)" }}>{p[1]}</span>
                </div>
              ))}
            </div>
            <div className="col" style={{ gap: 12 }}>
              {[["shield","Levels","Your level rises as points grow (a gentle curve, so early progress feels fast). Your progress bar above shows points to the next level."],["star","Reputation (0-100)","A trust score blending how often your reports are peer-confirmed, how often your labels match the AI, and how rarely you're flagged. High reputation lets your reports publish instantly."],["award","Badges","Milestones for consistency and impact - first report, 10 reports, exploring 5+ wards, helping resolve cases. Earned badges are downloadable."],["trophy","Ranking","The leaderboard ranks guardians by points. Keep reporting and helping to climb."]].map((c: any, i) => (
                <div key={i} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, flex: "0 0 30px", display: "grid", placeItems: "center", background: "var(--green-50)", color: "var(--green)" }}><Icon name={c[0]} size={15} /></div>
                  <div><div style={{ fontWeight: 700, fontSize: 13.5 }}>{c[1]}</div><div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>{c[2]}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* tabs */}
      <div className="row" style={{ gap: 0, margin: "26px 0 16px", borderBottom: "1px solid var(--line)" }}>
        {tabs.map(t => (
          <button key={t[0]} onClick={() => setTab(t[0])} style={{ padding: "12px 18px", fontWeight: 700, fontSize: 14.5, color: tab === t[0] ? "var(--green)" : "var(--ink-3)", borderBottom: tab === t[0] ? "2.5px solid var(--green)" : "2.5px solid transparent", marginBottom: -1 }}>{t[1]}{t[0] === "confirmed" && confirmedReports.length ? ` (${confirmedReports.length})` : ""}</button>
        ))}
      </div>

      {tab === "reports" && (
        <>
          <div className="grid-3">
            {profileReports.map((r: any) => (
              <div key={r.id} className="card post-card" style={{ overflow: "hidden", cursor: "pointer" }} onClick={() => go("report", r.id)}>
                <div style={{ position: "relative" }}>
                  <Photo report={r} h={130} r={0} label={SPECIES[r.species].label} />
                  <div className="row" style={{ position: "absolute", left: 10, bottom: 10, gap: 5 }}><SpeciesChip sp={r.species} sm />{r.injured && <InjuredTag sm />}</div>
                </div>
                <div className="card-pad" style={{ padding: 13 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}><StatusChip status={r.status} sm /><span className="muted mono" style={{ fontSize: 11 }}>{r.time}</span></div>
                  <p style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.note}</p>
                </div>
              </div>
            ))}
            {!profileReports.length && !repLoading && <div className="card card-pad muted" style={{ gridColumn: "1 / -1", textAlign: "center" }}>No published reports to show yet.</div>}
          </div>
          {/* infinite-scroll sentinel + explicit fallback */}
          <div ref={sentinel} />
          {repLoading && <div className="muted" style={{ textAlign: "center", padding: "18px 0", fontSize: 13 }}>Loading reports…</div>}
          {!repLoading && repHasMore && profileReports.length > 0 && (
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button className="btn btn-soft btn-sm" onClick={() => loadMoreReports()}><Icon name="refresh" size={14} /> Load more</button>
            </div>
          )}
          {!repHasMore && profileReports.length >= PROFILE_PAGE && <div className="muted" style={{ textAlign: "center", padding: "14px 0", fontSize: 12 }}>That's all {reportsCount} report{reportsCount === 1 ? "" : "s"}.</div>}
        </>
      )}

      {tab === "badges" && (
        <div className="grid-4">
          {allBadges.map((b: any) => {
            const [icon, color] = BADGE_META[b.code] || ["star", "#3aa3b5"];
            return (
              <div key={b.code} className={"badge-tile" + (b.earned ? "" : " locked")}>
                <div className="badge-medal" style={{ background: b.negative ? "#c2402a" : color }}><Icon name={icon} size={24} /></div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{b.name}</div>
                <div className="muted" style={{ fontSize: 12, lineHeight: 1.4 }}>{b.description}</div>
                {b.earned
                  ? <span className="chip chip-sm status-resolved" style={{ marginTop: 2 }}><Icon name="checkSmall" size={11} /> {earnedAt[b.code] ? new Date(earnedAt[b.code]).toLocaleDateString("en", { month: "short", year: "numeric" }) : "Earned"}</span>
                  : <span className="chip chip-sm" style={{ marginTop: 2 }}><Icon name="lock" size={11} /> Locked</span>}
                {isMe && b.earned && !b.negative && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 8 }}
                    onClick={() => downloadBadge({ name: b.name, description: b.description, icon, color, date: earnedAt[b.code] }, ME)}
                  >
                    <Icon name="upload" size={13} /> Download
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {tab === "confirmed" && (
        <div className="card card-pad" style={{ maxWidth: 640 }}>
          <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: confirmedReports.length ? 14 : 0 }}>Sightings you vouched for by confirming. Each confirmation earns +2 points and builds your reputation.</p>
          {confirmedReports.length ? confirmedReports.map((r: any, i: number) => (
            <div key={r.id} className="row" style={{ gap: 12, padding: "12px 0", borderTop: i ? "1px solid var(--line)" : "none", cursor: "pointer" }} onClick={() => go("report", r.id)}>
              <div style={{ width: 34, height: 34, borderRadius: 9, flex: "0 0 34px", display: "grid", placeItems: "center", background: "var(--green-50)", color: "var(--green)" }}><Icon name="checkSmall" size={16} /></div>
              <div style={{ flex: 1 }}>Confirmed a {SPECIES[r.species].label.toLowerCase()} in {r.ward}{r.injured ? " (injured)" : ""} · by {r.reporter}</div>
              <span className="chip chip-sm" style={{ textTransform: "capitalize" }}>{STATUS[r.status]?.label || r.status}</span>
              <span className="muted mono" style={{ fontSize: 11.5 }}>{r.time}</span>
            </div>
          )) : <div className="muted" style={{ fontSize: 13, textAlign: "center", padding: "20px 0" }}>You haven't confirmed any sightings yet. Confirming others' reports helps validate them and earns you points.</div>}
        </div>
      )}

      {tab === "activity" && (
        <div className="card card-pad" style={{ maxWidth: 640 }}>
          {own.length ? own.slice(0, 15).map((r: any, i: number) => (
            <div key={r.id} className="row" style={{ gap: 12, padding: "12px 0", borderTop: i ? "1px solid var(--line)" : "none", cursor: "pointer" }} onClick={() => go("report", r.id)}>
              <div style={{ width: 34, height: 34, borderRadius: 9, flex: "0 0 34px", display: "grid", placeItems: "center", background: r.injured ? "var(--coral-50)" : "var(--green-50)", color: r.injured ? "var(--coral-600)" : "var(--green)" }}><Icon name={r.injured ? "cross" : "paw"} size={16} /></div>
              <div style={{ flex: 1 }}>Reported a {SPECIES[r.species].label.toLowerCase()} in {r.ward}{r.injured ? " (injured)" : ""}</div>
              <span className="chip chip-sm" style={{ textTransform: "capitalize" }}>{STATUS[r.status]?.label || r.status}</span>
              <span className="muted mono" style={{ fontSize: 11.5 }}>{r.time}</span>
            </div>
          )) : <div className="muted" style={{ fontSize: 13, textAlign: "center", padding: "20px 0" }}>No activity yet.</div>}
        </div>
      )}
    </div>
  );
}

function ProfileLoader({ userId, isMe, go }: any) {
  const { user, me } = useStore();
  const [profile, setProfile] = useState<any>(null);
  useEffect(() => {
    let on = true;
    setProfile(null);
    if (userId) api.profile(userId).then((p: any) => { if (on) setProfile(p); }).catch(() => {});
    return () => { on = false; };
  }, [userId]);
  const u = profile?.user;
  // The server is the only place that knows the real totals: the in-store feed is a paginated
  // slice, so counting it undercounts. Everything the profile header and the certificate show
  // comes from `profile.stats` for that reason.
  const st = profile?.stats;
  const person = u
    ? {
        id: u.id, name: u.display_name || u.username, handle: "@" + u.username, avatar: u.avatar_url || null,
        color: colorFor(u.id), level: u.level, levelName: levelName(u.points), points: u.points,
        reputation: Math.round(u.reputation), ward: u.default_ward || "Kathmandu",
        joined: new Date(u.created_at).toLocaleString("en", { month: "short", year: "numeric" }),
        reports: st?.total_reports ?? 0,
        published: st?.published_reports ?? 0,
        resolved: st?.resolved_reports ?? 0,
        areas: st?.distinct_wards ?? 0,
        helped: st?.helped_count ?? 0,
        streak: st?.reporting_streak ?? 0,
        rank: profile?.rank ?? null,
        badges: (profile?.badges || []).map((b: any) => b.name).filter(Boolean),
      }
    : isMe
      ? user
      : { id: userId, name: "Reporter", handle: "@reporter", avatar: null, color: colorFor(userId || ""), level: 1, levelName: "Newcomer", points: 0, reputation: 50, ward: "Kathmandu", joined: "" };
  return <ProfilePage person={person} profile={profile} isMe={isMe} go={go} />;
}

export function Profile({ go }: any) {
  const { me } = useStore();
  return <ProfileLoader userId={me?.id} isMe go={go} />;
}

export function UserProfile({ name, go }: any) {
  // `name` is the user id (navigation passes reporterId / leaderboard id).
  const { me } = useStore();
  return <ProfileLoader userId={name} isMe={!!me && name === me.id} go={go} />;
}

/* ============================================================
   ADOPTION
   ============================================================ */
export function Adoption({ go }: any) {
  // Adoptable-animal listings (from the DB) + the partner-shelter directory. Listings only:
  // no payments, no in-app messaging (contact happens off-platform).
  const { me } = useStore();
  const emailFor = (name: string) => "adopt@" + name.toLowerCase().replace(/[^a-z]+/g, "") + ".org.np";
  const [listings, setListings] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", contact_info: "" });
  const [busy, setBusy] = useState(false);
  const load = () => api.adoptions("available").then(setListings).catch(() => setListings([]));
  useEffect(() => { load(); }, []);
  const submit = async () => {
    if (!form.title.trim()) { toast.error("Give the listing a title"); return; }
    if (!form.contact_info.trim()) { toast.error("Add a contact so adopters can reach you"); return; }
    setBusy(true);
    try {
      await api.createAdoption({ title: form.title.trim(), description: form.description.trim(), contact_info: form.contact_info.trim() });
      toast.success("Listing published");
      setForm({ title: "", description: "", contact_info: "" }); setShowForm(false); load();
    } catch (e: any) { toast.error(e?.message || "Couldn't publish listing"); }
    finally { setBusy(false); }
  };
  const markAdopted = async (id: string) => { try { await api.updateAdoption(id, "adopted"); toast.success("Marked as adopted"); load(); } catch (e: any) { toast.error(e?.message || "Failed"); } };
  const remove = async (id: string) => { if (!confirm("Remove this listing?")) return; try { await api.deleteAdoption(id); load(); } catch (e: any) { toast.error(e?.message || "Failed"); } };

  return (
    <div className="page">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 8 }}>
        <div>
          <h1 style={{ fontSize: 28 }}>Adopt a friend</h1>
          <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>Rescued animals looking for a home, plus Kathmandu&apos;s partner shelters. SafeTails connects you; adoption is arranged directly with the lister or shelter.</p>
        </div>
        {me && <button className="btn btn-gold" onClick={() => setShowForm(v => !v)}><Icon name="plus" size={15} /> List an animal</button>}
      </div>

      {showForm && (
        <div className="card card-pad" style={{ marginBottom: 18 }}>
          <div className="section-title" style={{ marginBottom: 10 }}>List an animal for adoption</div>
          <div className="grid-2" style={{ gap: 12 }}>
            <div className="field" style={{ margin: 0 }}><label>Title</label><input className="input" placeholder="e.g. Friendly brown street pup" maxLength={120} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="field" style={{ margin: 0 }}><label>Contact (phone or email)</label><input className="input" placeholder="How adopters reach you" maxLength={200} value={form.contact_info} onChange={e => setForm(f => ({ ...f, contact_info: e.target.value }))} /></div>
          </div>
          <div className="field" style={{ marginTop: 12, marginBottom: 12 }}><label>Description</label><textarea className="input" rows={3} placeholder="Temperament, age, health, vaccination status…" maxLength={2000} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
          <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={submit}>{busy ? <span className="spinner" /> : "Publish listing"}</button>
          </div>
        </div>
      )}

      {listings.length > 0 && (
        <>
          <div className="section-title" style={{ marginBottom: 12 }}>Looking for a home · {listings.length}</div>
          <div className="grid-3" style={{ marginBottom: 26 }}>
            {listings.map((a: any) => (
              <div key={a.id} className="card post-card" style={{ overflow: "hidden" }}>
                <div style={{ height: 96, background: "linear-gradient(120deg, var(--green), var(--green-500))", position: "relative", display: "grid", placeItems: "center" }}>
                  {a.photo_path ? <img src={imageUrl(a.photo_path)} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : <Icon name="paw" size={34} style={{ color: "#fff", opacity: 0.9 }} />}
                </div>
                <div className="card-pad">
                  <h3 style={{ fontSize: 17 }}>{a.title}</h3>
                  {a.description && <p className="muted" style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.description}</p>}
                  <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Listed by {a.created_by_name || "a member"}</div>
                  <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    <a href={a.contact_info.includes("@") ? `mailto:${a.contact_info}` : `tel:${a.contact_info.replace(/[^0-9+]/g, "")}`} className="btn btn-primary btn-sm" style={{ flex: 1 }}><Icon name="mail" size={14} /> Contact</a>
                    {me && me.id === a.created_by && <>
                      <button className="btn btn-ghost btn-sm" title="Mark adopted" onClick={() => markAdopted(a.id)}><Icon name="check" size={14} /></button>
                      <button className="btn btn-ghost btn-sm" title="Remove" onClick={() => remove(a.id)}><Icon name="x" size={14} /></button>
                    </>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title" style={{ marginBottom: 12 }}>Partner shelters</div>

      <div className="grid-3" style={{ marginTop: 18 }}>
        {SHELTERS.map(s => (
          <div key={s.id} className="card post-card" style={{ overflow: "hidden" }}>
            <div style={{ height: 96, background: `linear-gradient(120deg, ${s.color}, ${s.color}cc)`, position: "relative", display: "grid", placeItems: "center" }}>
              <Icon name="building" size={34} style={{ color: "#fff", opacity: 0.9 }} />
            </div>
            <div className="card-pad">
              <h3 style={{ fontSize: 19 }}>{s.name}</h3>
              <div className="muted row" style={{ fontSize: 12.5, marginTop: 3, gap: 5 }}><Icon name="location" size={12} /> {s.area}, Kathmandu Valley</div>
              <div className="row" style={{ gap: 6, margin: "12px 0", flexWrap: "wrap" }}>
                <span className="chip chip-sm"><Icon name="cross" size={11} /> {s.vets} vets on call</span>
                <span className="chip chip-sm status-resolved"><Icon name="heart" size={11} /> Adoptions open</span>
              </div>
              <div className="col" style={{ gap: 8, marginTop: 6 }}>
                <a href={`tel:${s.phone.replace(/[^0-9]/g, "")}`} className="btn btn-primary btn-sm" style={{ width: "100%" }}><Icon name="mail" size={15} /> Call {s.phone}</a>
                <a href={`mailto:${emailFor(s.name)}`} className="btn btn-ghost btn-sm" style={{ width: "100%" }}><Icon name="mail" size={15} /> {emailFor(s.name)}</a>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="ai-note" style={{ marginTop: 18, borderTop: "none" }}><Icon name="info" size={14} /><span>Phone numbers are the shelters&apos; public lines. SafeTails does not handle payments or transport.</span></div>
    </div>
  );
}

/* ============================================================
   INSIGHTS
   ============================================================ */
/* ============================================================
   PREDICTIONS - real-data ML / predictive analytics
   ============================================================ */
const RISK_COLOR: any = { high: "var(--coral-600)", medium: "var(--gold-600)", low: "var(--green)" };
export function Predictions({ go }: any) {
  const [p, setP] = useState<any>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let on = true;
    api.predictions().then((d: any) => { if (on) setP(d); }).catch(() => setErr(true));
    return () => { on = false; };
  }, []);

  if (err) return <div className="page wide"><Empty icon="chart" title="Predictions unavailable" text="Could not reach the prediction service. Is the backend running?" /></div>;
  if (!p) return <div className="page wide"><div className="card card-pad muted">Computing predictions from live data...</div></div>;

  const h = p.headline || {};
  const risk = (p.area_risk || []);
  const combined = [...(p.forecast?.history || []), ...(p.forecast?.forecast || [])];
  const cutIdx = (p.forecast?.history || []).length;
  const spRisk = (p.species_injury_risk || []).map((s: any) => ({ name: SPECIES[s.species.toLowerCase()]?.label || s.species, rate: Math.round(s.injury_probability * 100), color: SPECIES[s.species.toLowerCase()]?.hex || "var(--green)" })).sort((a: any, b: any) => b.rate - a.rate);
  // Raw factors behind the score for the top hotspots - shows WHY each area ranks high.
  const drivers = risk.slice(0, 6).map((w: any) => ({ ward: w.ward, reports: w.reports || 0, open_injured: w.open_injured || 0, severe: w.severe || 0, recent: w.recent || 0 }));
  // Risk-level mix (how many areas fall in each band) + open injured load per area (real).
  const riskMix = ["high", "medium", "low"].map(l => ({ name: l[0].toUpperCase() + l.slice(1) + " risk", value: risk.filter((w: any) => w.risk_level === l).length, color: RISK_COLOR[l] }));
  const openLoad = risk.map((w: any) => ({ ward: w.ward, open_injured: w.open_injured || 0 })).filter((w: any) => w.open_injured > 0).slice(0, 8);
  const trendWord = h.trend === "rising" ? "rising" : h.trend === "falling" ? "easing off" : "holding steady";
  const perDay = p.forecast?.trend_per_day ?? 0;
  // Risk vs volume: does an area's danger track its report count, or is it disproportionately risky?
  const riskScatter = risk.map((w: any) => ({ ward: w.ward, reports: w.reports || 0, risk: w.risk_score || 0, open: (w.open_injured || 0) + 1, level: w.risk_level }));
  // Risk-factor radar for the single highest-risk area (each factor normalised 0-100 across areas).
  const rmax = (k: string) => Math.max(1, ...risk.map((w: any) => w[k] || 0));
  const topArea = risk[0];
  const radarData = topArea ? [
    { factor: "Volume", v: Math.round((topArea.reports || 0) / rmax("reports") * 100) },
    { factor: "Open injured", v: Math.round((topArea.open_injured || 0) / rmax("open_injured") * 100) },
    { factor: "Severe", v: Math.round((topArea.severe || 0) / rmax("severe") * 100) },
    { factor: "Recent", v: Math.round((topArea.recent || 0) / rmax("recent") * 100) },
    { factor: "Unresolved", v: Math.round((topArea.unresolved || 0) / rmax("unresolved") * 100) },
  ] : [];

  return (
    <div className="page wide">
      <div className="row" style={{ gap: 10, marginBottom: 4 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, display: "grid", placeItems: "center", background: "linear-gradient(135deg,var(--green),var(--sp-buffalo))", color: "#fff" }}><Icon name="sparkle" size={18} /></div>
        <h1 style={{ fontSize: 28 }}>Risk &amp; Predictions</h1>
        <span className="chip chip-sm" style={{ background: "var(--green-50)", color: "var(--green)", borderColor: "var(--green-200)", fontWeight: 700 }}>ML &middot; live data</span>
      </div>
      <p className="muted" style={{ fontSize: 14, marginTop: 4, marginBottom: 18 }}>Predictive analytics computed from real reports - area risk scoring, a 7-day incident forecast, and species injury risk. Not simulated.</p>

      {/* Plain-language takeaway */}
      <div className="card card-pad" style={{ background: "var(--tint-green)", marginBottom: 20 }}>
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: "grid", placeItems: "center", background: "var(--green)", color: "#fff" }}><Icon name="zap" size={16} /></div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>
            {h.top_hotspot
              ? <><b style={{ color: "var(--ink)" }}>{h.top_hotspot}</b> needs the most attention right now - it scores highest on our risk model (density, injured load, severe &amp; recent cases). {h.high_risk_areas > 0 ? <><b>{h.high_risk_areas}</b> area{h.high_risk_areas === 1 ? " is" : "s are"} in the high-risk band. </> : "No area is in the high-risk band yet. "}Overall reporting is <b>{trendWord}</b>{perDay ? ` (${perDay >= 0 ? "+" : ""}${perDay}/day)`: ""}, with about <b>{p.forecast?.next7_total ?? 0}</b> more sightings expected over the next week. {spRisk[0] ? <>{spRisk[0].name} sightings are the most likely to be injured ({spRisk[0].rate}%).</> : ""}</>
              : "Not enough reports yet to make a confident prediction - check back as more sightings come in."}
          </div>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 20 }}>
        <StatCard icon="alert" label="Top predicted hotspot" value={h.top_hotspot || "-"} sub={`risk score ${h.top_hotspot_score ?? 0}/100`} color="var(--coral)" accent="var(--coral-600)" />
        <StatCard icon="layers" label="High-risk areas" value={h.high_risk_areas ?? 0} sub="need proactive attention" color="var(--gold-600)" accent="var(--gold-600)" />
        <StatCard icon="chart" label="Forecast (next 7 days)" value={p.forecast?.next7_total ?? 0} sub={`trend ${h.trend || "steady"} (${p.forecast?.trend_per_day >= 0 ? "+" : ""}${p.forecast?.trend_per_day}/day)`} color="var(--sp-buffalo)" />
        <StatCard icon="cross" label="Most injury-prone" value={spRisk[0]?.name || "-"} sub={`${spRisk[0]?.rate ?? 0}% of its sightings injured`} color="var(--green)" />
      </div>

      <div className="bento" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        {/* Area risk ranking */}
        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <div className="section-title">Predicted area risk</div>
            <span className="chip chip-sm">weighted model</span>
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>Score from report density, open injured load, severe cases &amp; recent activity. Tap an area to explore it on the map.</p>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={risk} layout="vertical" margin={{ left: 14, right: 42, top: 0, bottom: 0 }} barCategoryGap={5}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="ward" width={92} tick={{ fontSize: 11.5, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "var(--paper-2)" }} />
                <Bar dataKey="risk_score" name="Risk" radius={[0, 6, 6, 0]} label={{ position: "right", formatter: (v: any) => `${v}`, fontSize: 11, fill: "var(--ink-3)" }} onClick={(d: any) => go("map")}>
                  {risk.map((w: any, i: number) => <Cell key={i} fill={RISK_COLOR[w.risk_level]} cursor="pointer" />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="row" style={{ gap: 14, marginTop: 4 }}>
            {["high", "medium", "low"].map(l => <span key={l} className="row" style={{ gap: 6, fontSize: 11.5, color: "var(--ink-3)", textTransform: "capitalize" }}><i style={{ width: 10, height: 10, borderRadius: 3, background: RISK_COLOR[l] }} />{l} risk</span>)}
          </div>
        </div>

        {/* Forecast + species risk stacked */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card card-pad">
            <div className="section-title" style={{ marginBottom: 8 }}>7-day incident forecast</div>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={combined} margin={{ left: -20, right: 8, top: 6, bottom: 0 }}>
                  <defs><linearGradient id="pf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--sp-buffalo)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--sp-buffalo)" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 9.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} interval={2} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} width={26} />
                  <Tooltip content={<ChartTip />} />
                  <Area type="monotone" dataKey="reports" stroke="var(--sp-buffalo)" strokeWidth={2.5} fill="url(#pf)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Last 14 days + projected next 7 (least-squares trend).</div>
          </div>
          <div className="card card-pad">
            <div className="section-title" style={{ marginBottom: 10 }}>Species injury risk</div>
            {spRisk.map((s: any) => (
              <div key={s.name} style={{ marginBottom: 9 }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 3 }}><span style={{ fontSize: 12.5, fontWeight: 600 }}>{s.name}</span><span className="mono muted" style={{ fontSize: 11.5 }}>{s.rate}%</span></div>
                <div className="prob-track" style={{ height: 7 }}><div className="prob-fill" style={{ width: s.rate + "%", background: s.color }}></div></div>
              </div>
            ))}
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>P(injured | species) from historical reports.</div>
          </div>
        </div>
      </div>

      {/* Risk-level mix + open injured load (both live) */}
      <div className="bento" style={{ marginTop: 20, gridTemplateColumns: "1fr 1.5fr" }}>
        <div className="card card-pad" style={{ display: "flex", flexDirection: "column" }}>
          <div className="section-title" style={{ marginBottom: 6 }}>How risk is spread</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 4 }}>Areas grouped by risk band.</p>
          <div style={{ flex: 1, minHeight: 190, position: "relative" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={riskMix} dataKey="value" nameKey="name" innerRadius={46} outerRadius={72} paddingAngle={2} stroke="none">
                  {riskMix.map((d: any, i: number) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip content={<ChartTip />} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
              <div style={{ textAlign: "center" }}><div className="kpi" style={{ fontSize: 22 }}>{risk.length}</div><div className="muted" style={{ fontSize: 10.5 }}>areas</div></div>
            </div>
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 6 }}>
            {riskMix.map((d: any, i: number) => <span key={i} className="row" style={{ gap: 6, fontSize: 11.5, color: "var(--ink-3)" }}><i style={{ width: 9, height: 9, borderRadius: 99, background: d.color }} />{d.name} <b className="mono" style={{ color: "var(--ink-2)" }}>{d.value}</b></span>)}
          </div>
        </div>

        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 4 }}>Open injured cases needing a responder</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 10 }}>Injured animals still unresolved, by area - where help is needed most urgently.</p>
          {openLoad.length ? (
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={openLoad} layout="vertical" margin={{ left: 14, right: 34, top: 0, bottom: 0 }} barCategoryGap={6}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="ward" width={92} tick={{ fontSize: 11.5, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "var(--paper-2)" }} />
                  <Bar dataKey="open_injured" name="Open injured" fill="var(--coral-600)" radius={[0, 6, 6, 0]} label={{ position: "right", formatter: (v: any) => `${v}`, fontSize: 11, fill: "var(--ink-3)" }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="muted" style={{ fontSize: 13, padding: "30px 0", textAlign: "center" }}>No open injured cases right now - every injured animal has a responder.</div>}
        </div>
      </div>

      {/* Risk vs volume (scatter) + top-area risk profile (radar) */}
      <div className="bento" style={{ marginTop: 20, gridTemplateColumns: "1.5fr 1fr" }}>
        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 4 }}>Risk vs. how busy an area is</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 10 }}>Each dot is an area. Dots high up but not far right are <b>disproportionately risky</b> for their volume - bubble size = open injured cases.</p>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: -8, right: 16, top: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
                <XAxis type="number" dataKey="reports" name="Reports" tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} label={{ value: "reports", position: "insideBottom", offset: -2, fontSize: 10, fill: "var(--ink-4)" }} />
                <YAxis type="number" dataKey="risk" name="Risk" domain={[0, 100]} tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} width={30} />
                <ZAxis type="number" dataKey="open" range={[40, 340]} />
                <Tooltip content={<RiskScatterTip />} cursor={{ strokeDasharray: "3 3" }} />
                <Scatter data={riskScatter}>
                  {riskScatter.map((w: any, i: number) => <Cell key={i} fill={RISK_COLOR[w.level]} fillOpacity={0.7} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="row" style={{ gap: 14, marginTop: 4 }}>
            {["high", "medium", "low"].map(l => <span key={l} className="row" style={{ gap: 6, fontSize: 11.5, color: "var(--ink-3)", textTransform: "capitalize" }}><i style={{ width: 10, height: 10, borderRadius: 99, background: RISK_COLOR[l] }} />{l}</span>)}
          </div>
        </div>

        <div className="card card-pad" style={{ display: "flex", flexDirection: "column" }}>
          <div className="section-title" style={{ marginBottom: 2 }}>Risk profile · {topArea?.ward || "-"}</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 4 }}>What makes the top area risky, factor by factor.</p>
          <div style={{ flex: 1, minHeight: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="var(--line)" />
                <PolarAngleAxis dataKey="factor" tick={{ fontSize: 10.5, fill: "var(--ink-3)" }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar dataKey="v" stroke="var(--coral-600)" fill="var(--coral)" fillOpacity={0.35} />
                <Tooltip content={<ChartTip />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Each spoke is scaled against the highest area on that factor.</div>
        </div>
      </div>

      {/* What's driving the risk - raw factor breakdown for top hotspots */}
      <div className="card card-pad" style={{ marginTop: 20 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <div className="section-title">What's driving the risk</div>
          <span className="chip chip-sm">top {drivers.length} hotspots</span>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 14 }}>The raw signals behind each area's score - report volume, open injured load, severe cases and recent (7-day) activity. Taller stacks explain higher risk.</p>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={drivers} margin={{ left: -14, right: 8, top: 4, bottom: 0 }} barCategoryGap={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="ward" tick={{ fontSize: 10.5, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} interval={0} />
              <YAxis tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "var(--paper-2)" }} />
              <Bar dataKey="reports" name="Reports" stackId="a" fill="var(--green-400)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="open_injured" name="Open injured" stackId="a" fill="var(--gold)" />
              <Bar dataKey="severe" name="Severe" stackId="a" fill="var(--coral-600)" />
              <Bar dataKey="recent" name="Recent (7d)" stackId="a" fill="var(--sp-buffalo)" radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="row" style={{ gap: 16, marginTop: 8, flexWrap: "wrap" }}>
          {[["Reports", "var(--green-400)"], ["Open injured", "var(--gold)"], ["Severe", "var(--coral-600)"], ["Recent (7d)", "var(--sp-buffalo)"]].map(([l, c]: any) => (
            <span key={l} className="row" style={{ gap: 7, fontSize: 12, color: "var(--ink-3)" }}><i style={{ width: 11, height: 11, borderRadius: 3, background: c }}></i> {l}</span>
          ))}
        </div>
      </div>

      <div className="ai-note" style={{ marginTop: 16 }}><Icon name="info" size={14} /><span>{p.model?.method}. All inputs are live database aggregates - no simulated values. Risk weights: density 25%, open injured 30%, severe 25%, recency 20%.</span></div>
    </div>
  );
}

export function Insights({ go }: any) {
  // Every KPI/chart here comes from the shared DB-aggregate `stats` (single source of truth),
  // so the numbers match the map and dispatch board exactly. `reports` is only used for the
  // live heatmap + natural-language query (which need per-report coordinates).
  const { reports, stats, user } = useStore();

  const [area, setArea] = useState("");
  // Analytics reflect VERIFIED (published) sightings, so every KPI/chart matches the map & dispatch
  // board. Reports still awaiting verification are counted separately (see the response funnel).
  const isPublished = (r: any) => r.moderationState === "published" || !r.moderationState;
  // Area filter: empty = valley-wide; otherwise EVERY KPI/chart re-scopes to the selected ward.
  // Only list wards that have at least one verified report (so a pick never yields empty charts).
  const wardOptions = useMemo(
    () => Array.from(new Set(reports.filter(isPublished).map((r: any) => r.ward).filter(Boolean))).sort() as string[],
    [reports],
  );
  const areaReports = useMemo(() => reports.filter((r: any) => isPublished(r) && (!area || r.ward === area)), [area, reports]);
  const areaPending = useMemo(() => reports.filter((r: any) => r.moderationState === "pending_confirmation" && (!area || r.ward === area)).length, [area, reports]);
  const areaLabel = area || "the Kathmandu Valley";
  // Auto-apply the user's home area as the initial filter (once), but only if it actually has
  // verified reports - otherwise stay valley-wide so the page never opens empty.
  const appliedHomeArea = useRef(false);
  useEffect(() => {
    if (!appliedHomeArea.current && user.defaultWard && wardOptions.includes(user.defaultWard)) {
      setArea(user.defaultWard);
      appliedHomeArea.current = true;
    }
  }, [user.defaultWard, wardOptions]);

  // One aggregation over the (area-filtered) reports powers the whole dashboard.
  const view = useMemo(() => {
    const rs = areaReports;
    const n = rs.length;
    const injured = rs.filter((r: any) => r.injured).length;
    const resolved = rs.filter((r: any) => r.status === "resolved").length;
    const openInj = rs.filter((r: any) => r.injured && r.status !== "resolved").length;
    const spCount: any = {}, injSp: any = {}, wardCount: any = {}, statusCount: any = {};
    const sevC: any = { severe: 0, moderate: 0, mild: 0 };
    const reporterCount: any = {};   // top contributors in this scope
    let publishedN = 0, helpingN = 0;  // verification/response funnel
    const dbuckets = Array.from({ length: 14 }, () => ({ reports: 0, injured: 0 }));
    // Temporal patterns from real report timestamps (mins-ago -> actual Date).
    const dow = Array.from({ length: 7 }, () => ({ reports: 0, injured: 0 }));   // 0=Sun
    const tod = [
      { name: "Night", from: 0, reports: 0, injured: 0 },      // 00-06
      { name: "Morning", from: 6, reports: 0, injured: 0 },    // 06-12
      { name: "Afternoon", from: 12, reports: 0, injured: 0 }, // 12-18
      { name: "Evening", from: 18, reports: 0, injured: 0 },   // 18-24
    ];
    let last7 = 0, prev7 = 0;
    rs.forEach((r: any) => {
      spCount[r.species] = (spCount[r.species] || 0) + 1;
      if (r.injured) injSp[r.species] = (injSp[r.species] || 0) + 1;
      wardCount[r.ward] = (wardCount[r.ward] || 0) + 1;
      statusCount[r.status] = (statusCount[r.status] || 0) + 1;
      if (r.injured && r.status !== "resolved") { const s = r.aiInjury?.severity || "moderate"; if (sevC[s] != null) sevC[s]++; }
      if (r.reporter) { const key = r.reporter + "|" + (r.reporterId || ""); reporterCount[key] = reporterCount[key] || { name: r.reporter, id: r.reporterId, color: r.reporterColor, avatar: r.reporterAvatar, reports: 0, injured: 0 }; reporterCount[key].reports++; if (r.injured) reporterCount[key].injured++; }
      if (r.moderationState === "published" || !r.moderationState) publishedN++;
      if (r.status === "helping" || r.status === "resolved") helpingN++;
      const d = Math.floor((r.mins ?? 1e9) / 1440);
      if (d >= 0 && d < 14) { dbuckets[d].reports++; if (r.injured) dbuckets[d].injured++; }
      if (d >= 0 && d < 7) last7++; else if (d >= 7 && d < 14) prev7++;
      if (r.mins != null && r.mins < 1e9) {
        const dt = new Date(Date.now() - r.mins * 60000);
        const wd = dow[dt.getDay()]; wd.reports++; if (r.injured) wd.injured++;
        const tb = tod[Math.floor(dt.getHours() / 6)]; if (tb) { tb.reports++; if (r.injured) tb.injured++; }
      }
    });
    const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const byDow = dow.map((b, i) => ({ name: DOW[i], reports: b.reports, injured: b.injured }));
    const byTod = tod.map(b => ({ name: b.name, reports: b.reports, injured: b.injured }));
    const daily: any[] = [];
    for (let off = 13; off >= 0; off--) daily.push({ day: off === 0 ? "Today" : off === 1 ? "Yest" : `-${off}d`, reports: dbuckets[off].reports, injured: dbuckets[off].injured });
    const speciesMix = Object.keys(SPECIES).map(k => ({ name: SPECIES[k].label, value: spCount[k] || 0, color: SPECIES[k].hex }));
    const statusMix = Object.keys(STATUS).map(k => ({ name: STATUS[k].label, value: statusCount[k] || 0, color: STATUS[k].hex }));
    const byWard = Object.entries(wardCount).map(([w, c]: any) => ({ name: w, reports: c, injured: rs.filter((r: any) => r.ward === w && r.injured).length })).sort((a: any, b: any) => b.reports - a.reports).slice(0, 10);
    const injuryBySpecies = Object.keys(spCount).filter(k => k !== "unverified").map(k => ({ name: SPECIES[k]?.label || k, rate: spCount[k] ? Math.round((injSp[k] || 0) / spCount[k] * 100) : 0, injured: injSp[k] || 0, reports: spCount[k], color: SPECIES[k]?.hex || "var(--green)" })).sort((a, b) => b.rate - a.rate);
    const topReporters = Object.values(reporterCount).sort((a: any, b: any) => b.reports - a.reports).slice(0, 7);
    return { total: n, injured, resolved, openInj, helpingCount: helpingN, resRate: n ? Math.round(resolved / n * 100) : 0, injRate: n ? Math.round(injured / n * 100) : 0, activeAreas: Object.keys(wardCount).length, speciesMix, statusMix, daily, severity: sevC, injuryBySpecies, byWard, byDow, byTod, topReporters, last7, prev7 };
  }, [areaReports]);

  const total = view.total, inj = view.injured, resolved = view.resolved, resRate = view.resRate, injRate = view.injRate, activeAreas = view.activeAreas;
  const speciesMix = view.speciesMix;
  const statusMix = view.statusMix;
  const topAreas = view.byWard;
  const daily = view.daily;
  const last7 = view.last7, prev7 = view.prev7;
  const wow = prev7 ? Math.round((last7 - prev7) / prev7 * 100) : null;
  const busiest: any = topAreas[0];
  const topSpecies = speciesMix.slice().sort((a: any, b: any) => b.value - a.value)[0];
  const peakDay = daily.slice().sort((a: any, b: any) => b.reports - a.reports)[0];
  const sev = view.severity;
  const injBySpecies = view.injuryBySpecies.filter((s: any) => s.reports > 0);
  const byDow = view.byDow, byTod = view.byTod;
  const peakDow = byDow.slice().sort((a: any, b: any) => b.reports - a.reports)[0];
  const peakTod = byTod.slice().sort((a: any, b: any) => b.reports - a.reports)[0];
  const topReporters = view.topReporters;
  // Response funnel: all sightings reported here -> how many got verified -> helped -> resolved.
  const funnel = [
    { name: "Reported", value: view.total + areaPending, color: "var(--sp-buffalo)" },
    { name: "Verified", value: view.total, color: "var(--green)" },
    { name: "Being helped", value: view.helpingCount, color: "var(--gold-600)" },
    { name: "Resolved", value: view.resolved, color: "var(--st-resolved)" },
  ];
  // Cumulative growth: running total of sightings across the 14-day window (real).
  const cumulative = useMemo(() => { let t = 0, ti = 0; return daily.map((d: any) => { t += d.reports; ti += d.injured; return { day: d.day, total: t, injured: ti }; }); }, [daily]);
  // AI species-confidence distribution across the (verified) reports in scope - how sure the model was.
  const confDist = useMemo(() => {
    const b = [
      { name: "<50%", value: 0, color: "var(--coral-600)" },
      { name: "50-70%", value: 0, color: "var(--gold-600)" },
      { name: "70-85%", value: 0, color: "var(--green-400)" },
      { name: "85%+", value: 0, color: "var(--green)" },
    ];
    areaReports.forEach((r: any) => { const c = r.conf ?? 0.6; if (c < 0.5) b[0].value++; else if (c < 0.7) b[1].value++; else if (c < 0.85) b[2].value++; else b[3].value++; });
    return b;
  }, [areaReports]);
  const avgConf = useMemo(() => { const cs = areaReports.map((r: any) => r.conf ?? 0.6); return cs.length ? Math.round(cs.reduce((a: number, b: number) => a + b, 0) / cs.length * 100) : 0; }, [areaReports]);

  const areaNarrative = view.total
    ? `${areaLabel} has ${view.total} logged sighting${view.total === 1 ? "" : "s"}${topSpecies && topSpecies.value ? `, most commonly ${topSpecies.name.toLowerCase()} (${Math.round(topSpecies.value / view.total * 100)}%)` : ""}. ${view.injured} were flagged injured (${view.injRate}%)${view.openInj ? `, of which ${view.openInj} remain open and need a responder` : ""}. ${view.last7} came in the last 7 days, and ${view.resRate}% of cases here have been resolved.`
    : `No sightings recorded in ${areaLabel} yet.`;

  // Moderation / trust pipeline stays valley-wide (needs ALL submissions, including rejected).
  const moderation = stats?.moderation ?? { published: 0, pending_confirmation: 0, rejected: 0 };
  const submitted = stats?.submitted ?? (stats?.total ?? total);
  const validationRate = submitted ? Math.round(moderation.published / submitted * 100) : 0;
  const spamRate = submitted ? Math.round(moderation.rejected / submitted * 100) : 0;
  const aiAgree = stats?.ai_agreement_rate;  // % of human labels that matched the model
  const modMix = [
    { name: "Published", value: moderation.published, color: "var(--green)" },
    { name: "Awaiting confirmation", value: moderation.pending_confirmation, color: "var(--gold)" },
    { name: "Rejected as spam", value: moderation.rejected, color: "var(--coral)" },
  ];

  // Live valley summary: real AI narrative if available, else a computed factual summary.
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    api.hotspotSummary().then((d: any) => { if (on && d?.ai_summary) setAiSummary(d.ai_summary); }).catch(() => {});
    return () => { on = false; };
  }, []);
  const computedSummary = `${total} sightings logged across ${activeAreas} areas${busiest ? `, most concentrated around ${busiest.name} (${busiest.reports})` : ""}. ${topSpecies && topSpecies.value ? `${topSpecies.name} is the most-reported species (${Math.round(topSpecies.value / (total || 1) * 100)}%). ` : ""}${inj} reports were flagged as possibly injured (${injRate}%), and the resolution rate stands at ${resRate}%.`;

  // Working natural-language query over the real reports (parses species + injury intent).
  const [query, setQuery] = useState("injured dogs");
  const parsed = useMemo(() => {
    const q = query.toLowerCase();
    const sp = Object.keys(SPECIES).find(k => q.includes(k) || q.includes(SPECIES[k].label.toLowerCase()));
    const injuredOnly = /injur|hurt|wound|limp|distress/.test(q);
    const res = reports.filter((r: any) => (!sp || r.species === sp) && (!injuredOnly || r.injured));
    return { sp, injuredOnly, count: res.length, areas: new Set(res.map((r: any) => r.ward)).size };
  }, [query, reports]);

  return (
    <div className="page wide">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 28 }}>Area insights</h1>
          <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>{area ? <>In-depth analytics for <b style={{ color: "var(--green)" }}>{area}</b> - computed from real reports.</> : "Live analytics across the Kathmandu Valley - computed from real reports. Pick an area to drill in."}</p>
        </div>
        <label className="row" style={{ gap: 8, fontSize: 12.5, flexShrink: 0 }}>
          <Icon name="location" size={15} style={{ color: "var(--green)" }} />
          <span className="muted" style={{ fontWeight: 700 }}>Area</span>
          <select className="input area-select" value={area} onChange={e => setArea(e.target.value)}>
            <option value="">All areas (valley-wide)</option>
            {wardOptions.map((w: any) => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
      </div>

      {area && (
        <div className="row" style={{ gap: 8, marginTop: 12, padding: "8px 12px", background: "var(--green-50)", borderRadius: 10, fontSize: 12.5, color: "var(--green)", fontWeight: 600 }}>
          <Icon name="info" size={14} /> Every KPI and chart below is scoped to <b>{area}</b>.
          <a onClick={() => setArea("")} style={{ marginLeft: "auto", color: "var(--green)", fontWeight: 700, cursor: "pointer" }}>Clear filter</a>
        </div>
      )}

      {/* Plain-language takeaway (leads the page, re-scopes with the area selector) */}
      <div className="card card-pad" style={{ background: "var(--tint-green)", marginTop: 18 }}>
        <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: "grid", placeItems: "center", background: "var(--green)", color: "#fff" }}><Icon name="zap" size={16} /></div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>{areaNarrative}</div>
        </div>
      </div>

      <div className="grid-4" style={{ marginTop: 18 }}>
        <StatCard icon="stack" label="Total reports" value={total} sub={wow != null ? `${wow >= 0 ? "↑" : "↓"} ${Math.abs(wow)}% vs prev. 7 days` : `${last7} in last 7 days`} accent="var(--green)" />
        <StatCard icon="cross" label="Flagged injured" value={inj} sub={`${injRate}% of reports here`} color="var(--coral)" accent="var(--coral-600)" />
        <StatCard icon="alert" label="Open urgent" value={view.openInj} sub="injured, need a responder" color="var(--gold-600)" accent="var(--gold-600)" />
        <StatCard icon="check" label="Resolution rate" value={resRate + "%"} sub={`${resolved} reports resolved`} color="var(--st-resolved)" accent="var(--st-resolved)" />
      </div>

      {/* computed key findings */}
      <div className="card card-pad" style={{ marginTop: 18, background: "var(--tint-green)" }}>
        <div className="row" style={{ gap: 8, marginBottom: 12 }}><Icon name="zap" size={16} style={{ color: "var(--gold-600)" }} /><b style={{ fontFamily: "var(--ff-display)", fontSize: 15 }}>Key findings</b><span className="chip chip-sm" style={{ marginLeft: "auto" }}>computed live</span></div>
        <div className="grid-4" style={{ gap: 14 }}>
          {[
            ["Busiest area", busiest ? busiest.name : "-", busiest ? `${busiest.reports} reports · ${busiest.injured} injured` : "no data", "location"],
            ["Most injury-prone", injBySpecies[0] ? injBySpecies[0].name : "-", injBySpecies[0] ? `${injBySpecies[0].rate}% of its sightings injured` : "no data", "cross"],
            ["Trusted & published", `${validationRate}%`, `${moderation.rejected} rejected as spam`, "shield"],
            ["AI-human agreement", aiAgree != null ? `${aiAgree}%` : "-", `${stats?.ai_labelled ?? 0} human-labelled reports`, "sparkle"],
          ].map((c: any, i) => (
            <div key={i} style={{ padding: 12, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12 }}>
              <div className="row" style={{ gap: 6, color: "var(--ink-3)" }}><Icon name={c[3]} size={13} /><span className="section-title" style={{ fontSize: 11 }}>{c[0]}</span></div>
              <div style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 18, marginTop: 6 }}>{c[1]}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{c[2]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Bento row 1: 14-day trend (wide) + species mix + severity (right column fills height) */}
      <div className="bento" style={{ marginTop: 20, gridTemplateColumns: "1.5fr 1fr" }}>
        <div className="card card-pad" style={{ display: "flex", flexDirection: "column" }}>
          <div className="section-title" style={{ marginBottom: 10 }}>Reports over the last 14 days</div>
          <div style={{ flex: 1, minHeight: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="iTot" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--green)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--green)" stopOpacity={0} /></linearGradient>
                  <linearGradient id="iInj" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--coral)" stopOpacity={0.3} /><stop offset="100%" stopColor="var(--coral)" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} interval={1} />
                <YAxis tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} width={30} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="reports" name="Reports" stroke="var(--green)" strokeWidth={2.5} fill="url(#iTot)" />
                <Area type="monotone" dataKey="injured" name="Injured" stroke="var(--coral)" strokeWidth={2} fill="url(#iInj)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="row" style={{ gap: 16, marginTop: 8 }}>
            <span className="row" style={{ gap: 7, fontSize: 12, color: "var(--ink-3)" }}><i style={{ width: 11, height: 11, borderRadius: 3, background: "var(--green)" }}></i> total reports</span>
            <span className="row" style={{ gap: 7, fontSize: 12, color: "var(--ink-3)" }}><i style={{ width: 11, height: 11, borderRadius: 3, background: "var(--coral)" }}></i> injured</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card card-pad" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div className="section-title" style={{ marginBottom: 6 }}>Species mix</div>
            <div style={{ flex: 1, minHeight: 172, position: "relative" }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={speciesMix} dataKey="value" nameKey="name" innerRadius={46} outerRadius={72} paddingAngle={2} stroke="none">
                    {speciesMix.map((d: any, i: number) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip content={<ChartTip />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
                <div style={{ textAlign: "center" }}><div className="kpi" style={{ fontSize: 22 }}>{total}</div><div className="muted" style={{ fontSize: 10.5 }}>sightings</div></div>
              </div>
            </div>
            <div className="row" style={{ flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 4 }}>
              {speciesMix.map((d: any, i: number) => <span key={i} className="row" style={{ gap: 6, fontSize: 11.5, color: "var(--ink-3)" }}><i style={{ width: 9, height: 9, borderRadius: 99, background: d.color }}></i>{d.name} <b className="mono" style={{ color: "var(--ink-2)" }}>{d.value}</b></span>)}
            </div>
          </div>
          <div className="card card-pad">
            <div className="section-title" style={{ marginBottom: 10 }}>Open injured cases by severity</div>
            <div className="row" style={{ gap: 10 }}>
              {[["severe", "var(--coral-600)", "var(--coral-50)"], ["moderate", "var(--gold-600)", "var(--gold-50)"], ["mild", "var(--green)", "var(--green-50)"]].map(([k, c, bg]: any) => (
                <div key={k} style={{ flex: 1, textAlign: "center", padding: "10px 6px", background: bg, borderRadius: 10 }}>
                  <div style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 22, color: c }}>{sev[k] || 0}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: c, textTransform: "capitalize" }}>{k}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bento row 2: reports by area (wide) + report status (fills) */}
      <div className="bento" style={{ marginTop: 20, gridTemplateColumns: "1.5fr 1fr" }}>
        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 12 }}>Reports by area · top 10</div>
          <div style={{ height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topAreas} layout="vertical" margin={{ left: 14, right: 16, top: 0, bottom: 0 }} barCategoryGap={6}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "var(--paper-2)" }} />
                <Bar dataKey="reports" name="Reports" fill="var(--green-400)" radius={[0, 5, 5, 0]} stackId="a" />
                <Bar dataKey="injured" name="Injured" fill="var(--coral)" radius={[0, 5, 5, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card card-pad" style={{ display: "flex", flexDirection: "column" }}>
          <div className="section-title" style={{ marginBottom: 6 }}>Report status</div>
          <div style={{ flex: 1, minHeight: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="35%" outerRadius="100%" data={statusMix} startAngle={90} endAngle={-270}>
                <RadialBar background dataKey="value" cornerRadius={8}>
                  {statusMix.map((d: any, i: number) => <Cell key={i} fill={d.color} />)}
                </RadialBar>
                <Tooltip content={<ChartTip />} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 12, justifyContent: "center", marginBottom: 12 }}>
            {statusMix.map((d: any, i: number) => <span key={i} className="row" style={{ gap: 6, fontSize: 12, color: "var(--ink-3)" }}><i style={{ width: 10, height: 10, borderRadius: 99, background: d.color }}></i>{d.name} <b className="mono" style={{ color: "var(--ink-2)" }}>{d.value}</b></span>)}
          </div>
          <div style={{ textAlign: "center", padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <span className="mono" style={{ fontSize: 22, fontWeight: 700, color: "var(--st-resolved)" }}>{resRate}%</span>
            <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>resolution rate</span>
          </div>
        </div>
      </div>

      {/* Bento row 2b: temporal patterns (when reports come in) - real timestamps */}
      <div className="bento" style={{ marginTop: 20, gridTemplateColumns: "1.5fr 1fr" }}>
        <div className="card card-pad">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
            <div className="section-title">Reports by day of week</div>
            {peakDow?.reports > 0 && <span className="chip chip-sm">busiest {peakDow.name}</span>}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>When sightings are logged - helps plan responder coverage. From real report timestamps.</p>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDow} margin={{ left: -18, right: 8, top: 4, bottom: 0 }} barCategoryGap={12}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "var(--paper-2)" }} />
                <Bar dataKey="reports" name="Reports" fill="var(--green-400)" radius={[5, 5, 0, 0]} stackId="a" />
                <Bar dataKey="injured" name="Injured" fill="var(--coral)" radius={[5, 5, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="row" style={{ gap: 16, marginTop: 8 }}>
            <span className="row" style={{ gap: 7, fontSize: 12, color: "var(--ink-3)" }}><i style={{ width: 11, height: 11, borderRadius: 3, background: "var(--green-400)" }}></i> reports</span>
            <span className="row" style={{ gap: 7, fontSize: 12, color: "var(--ink-3)" }}><i style={{ width: 11, height: 11, borderRadius: 3, background: "var(--coral)" }}></i> injured</span>
          </div>
        </div>

        <div className="card card-pad" style={{ display: "flex", flexDirection: "column" }}>
          <div className="section-title" style={{ marginBottom: 4 }}>Reports by time of day</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>{peakTod?.reports > 0 ? <>Peak reporting in the <b style={{ color: "var(--green)" }}>{peakTod.name.toLowerCase()}</b>.</> : "Distribution across the day."}</p>
          <div style={{ flex: 1, minHeight: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byTod} layout="vertical" margin={{ left: 6, right: 30, top: 0, bottom: 0 }} barCategoryGap={10}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11.5, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "var(--paper-2)" }} />
                <Bar dataKey="reports" name="Reports" fill="var(--sp-buffalo)" radius={[0, 6, 6, 0]} label={{ position: "right", formatter: (v: any) => `${v}`, fontSize: 11, fill: "var(--ink-3)" }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Night 0-6 · Morning 6-12 · Afternoon 12-18 · Evening 18-24.</div>
        </div>
      </div>

      {/* Cumulative growth of sightings + injured (running total, real) */}
      <div className="card card-pad" style={{ marginTop: 20 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <div className="section-title">Cumulative sightings · last 14 days</div>
          <span className="chip chip-sm">{area || "valley-wide"}</span>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>The running total of reports over time - a steeper line means activity is speeding up.</p>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cumulative} margin={{ left: -18, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="iCum" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--sp-buffalo)" stopOpacity={0.32} /><stop offset="100%" stopColor="var(--sp-buffalo)" stopOpacity={0} /></linearGradient>
                <linearGradient id="iCumI" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--coral)" stopOpacity={0.28} /><stop offset="100%" stopColor="var(--coral)" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} interval={1} />
              <YAxis tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="total" name="Total sightings" stroke="var(--sp-buffalo)" strokeWidth={2.5} fill="url(#iCum)" />
              <Area type="monotone" dataKey="injured" name="Injured" stroke="var(--coral)" strokeWidth={2} fill="url(#iCumI)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* AI confidence distribution (how sure the model was across reports here) */}
      <div className="card card-pad" style={{ marginTop: 20 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <div className="section-title">AI prediction confidence</div>
          <span className="chip chip-sm" style={{ background: "var(--green-50)", color: "var(--green)", border: "none", fontWeight: 700 }}>avg {avgConf}%</span>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>How confident the species model was across sightings here. More reports in the higher bands means cleaner, easier-to-classify photos.</p>
        <div style={{ height: 210 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={confDist} margin={{ left: -18, right: 8, top: 4, bottom: 0 }} barCategoryGap={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
              <Tooltip content={<ChartTip />} cursor={{ fill: "var(--paper-2)" }} />
              <Bar dataKey="value" name="Reports" radius={[6, 6, 0, 0]}>
                {confDist.map((d: any, i: number) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top contributors + verification/response funnel (both live, area-scoped) */}
      <div className="bento" style={{ marginTop: 20, gridTemplateColumns: "1fr 1fr" }}>
        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 4 }}>Top contributors {area ? `in ${area}` : "valley-wide"}</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 10 }}>The people reporting the most sightings here.</p>
          {topReporters.length ? topReporters.map((rp: any, i: number) => {
            const max = topReporters[0]?.reports || 1;
            return (
              <div key={i} className="row lb-row" style={{ gap: 10, padding: "7px 4px", borderRadius: 8, cursor: "pointer" }} onClick={() => rp.id && go("user", rp.id)}>
                <span className="mono" style={{ width: 16, fontSize: 12, fontWeight: 700, color: i < 3 ? "var(--gold-600)" : "var(--ink-4)" }}>{i + 1}</span>
                <Avatar name={rp.name} color={rp.color} size={28} avatar={rp.avatar} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rp.name}</div>
                  <div className="prob-track" style={{ height: 5, marginTop: 3 }}><div className="prob-fill" style={{ width: (rp.reports / max * 100) + "%", background: "var(--green-400)" }} /></div>
                </div>
                <span className="mono" style={{ fontSize: 12, fontWeight: 700 }}>{rp.reports}{rp.injured ? <span style={{ color: "var(--coral-600)" }}> · {rp.injured}inj</span> : null}</span>
              </div>
            );
          }) : <div className="muted" style={{ fontSize: 13, padding: "20px 0", textAlign: "center" }}>No reporters in this area yet.</div>}
        </div>

        <div className="card card-pad" style={{ display: "flex", flexDirection: "column" }}>
          <div className="section-title" style={{ marginBottom: 4 }}>From report to rescue</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 10 }}>How sightings here move through verification and response.</p>
          <div style={{ flex: 1, minHeight: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnel} layout="vertical" margin={{ left: 20, right: 40, top: 4, bottom: 0 }} barCategoryGap={12}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={86} tick={{ fontSize: 11.5, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "var(--paper-2)" }} />
                <Bar dataKey="value" name="Reports" radius={[0, 6, 6, 0]} label={{ position: "right", formatter: (v: any) => `${v}`, fontSize: 11, fill: "var(--ink-3)" }}>
                  {funnel.map((f: any, i: number) => <Cell key={i} fill={f.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{total ? `${Math.round((view.resolved / total) * 100)}% of sightings here reach resolution.` : "No data yet."}</div>
        </div>
      </div>

      {/* Response times: how fast cases get a helper and reach resolution (valley-wide, live) */}
      {(() => {
        const rt = stats?.response;
        if (!rt || (!rt.helped_count && !rt.resolved_count)) {
          return (
            <div className="card card-pad" style={{ marginTop: 20 }}>
              <div className="section-title" style={{ marginBottom: 4 }}>Response times</div>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>No cases have been helped or resolved yet. Once responders start accepting and closing cases, average time-to-help and time-to-resolve will appear here.</p>
            </div>
          );
        }
        const fmt = (h: number | null) => h == null ? "-" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`;
        const dist = (rt.resolve_distribution || []).map((d: any) => ({ name: d.bucket, count: d.count }));
        return (
          <div className="bento" style={{ marginTop: 20, gridTemplateColumns: "1fr 1.5fr" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <StatCard icon="clock" label="Avg time to first helper" value={fmt(rt.avg_time_to_help_hrs)} sub={`median ${fmt(rt.median_time_to_help_hrs)} · ${rt.helped_count} cases`} color="var(--gold-600)" accent="var(--gold-600)" />
              <StatCard icon="check" label="Avg time to resolve" value={fmt(rt.avg_time_to_resolve_hrs)} sub={`median ${fmt(rt.median_time_to_resolve_hrs)} · ${rt.resolved_count} cases`} color="var(--st-resolved)" accent="var(--st-resolved)" />
            </div>
            <div className="card card-pad">
              <div className="section-title" style={{ marginBottom: 4 }}>Time to resolution</div>
              <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 10 }}>How long resolved cases took from report to close. More bars on the left = faster community response.</p>
              <div style={{ height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dist} margin={{ left: -18, right: 8, top: 4, bottom: 0 }} barCategoryGap={16}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} width={30} allowDecimals={false} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "var(--paper-2)" }} />
                    <Bar dataKey="count" name="Cases" radius={[6, 6, 0, 0]}>
                      {dist.map((_: any, i: number) => <Cell key={i} fill={["var(--green)", "var(--green-400)", "var(--gold)", "var(--gold-600)", "var(--coral-600)"][i] || "var(--ink-4)"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bento row 3 (research findings): injury rate by species + reputation-weighted validation */}
      <div className="bento" style={{ marginTop: 20, gridTemplateColumns: "1fr 1fr" }}>
        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 4 }}>Injury rate by species</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 10 }}>Share of each species' sightings flagged as injured - which animals most need help.</p>
          <div style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={injBySpecies} layout="vertical" margin={{ left: 10, right: 40, top: 0, bottom: 0 }} barCategoryGap={10}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} unit="%" tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={70} tick={{ fontSize: 12, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} cursor={{ fill: "var(--paper-2)" }} />
                <Bar dataKey="rate" name="Injury rate" radius={[0, 6, 6, 0]} label={{ position: "right", formatter: (v: any) => `${v}%`, fontSize: 11, fill: "var(--ink-3)" }}>
                  {injBySpecies.map((d: any, i: number) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card card-pad" style={{ display: "flex", flexDirection: "column" }}>
          <div className="section-title" style={{ marginBottom: 4 }}>Reputation-weighted validation</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>How the anti-spam pipeline handled every submission. Higher trust means fewer held/rejected.</p>
          <div className="row" style={{ gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1, textAlign: "center", padding: "12px 6px", background: "var(--green-50)", borderRadius: 12, border: "1px solid var(--green-200)" }}>
              <div style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 26, color: "var(--green)" }}>{validationRate}%</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--green)" }}>published / trusted</div>
            </div>
            <div style={{ flex: 1, textAlign: "center", padding: "12px 6px", background: "var(--coral-50)", borderRadius: 12, border: "1px solid var(--coral-100)" }}>
              <div style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 26, color: "var(--coral-600)" }}>{spamRate}%</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--coral-600)" }}>rejected as spam</div>
            </div>
            {aiAgree != null && (
              <div style={{ flex: 1, textAlign: "center", padding: "12px 6px", background: "var(--paper-2)", borderRadius: 12 }}>
                <div style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 26, color: "var(--sp-buffalo)" }}>{aiAgree}%</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-3)" }}>AI-human agreement</div>
              </div>
            )}
          </div>
          <div style={{ flex: 1 }}>
            {modMix.map((m: any) => {
              const pct = submitted ? Math.round(m.value / submitted * 100) : 0;
              return (
                <div key={m.name} style={{ marginBottom: 12 }}>
                  <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                    <span className="row" style={{ gap: 7, fontSize: 13, fontWeight: 600 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: m.color }}></i>{m.name}</span>
                    <span className="mono muted" style={{ fontSize: 12 }}>{m.value} · {pct}%</span>
                  </div>
                  <div className="prob-track" style={{ height: 8 }}><div className="prob-fill" style={{ width: pct + "%", background: m.color }}></div></div>
                </div>
              );
            })}
          </div>
          <div className="ai-note" style={{ borderTop: "1px solid var(--line)" }}><Icon name="shield" size={14} /><span>Reports from trusted reporters publish instantly; new/low-reputation ones are held for peer confirmation. Verified against {submitted} submissions.</span></div>
        </div>
      </div>

      {/* interactive heatmap + assistant */}
      <div className="grid-2" style={{ marginTop: 20, gridTemplateColumns: "1.5fr 1fr", alignItems: "start" }}>
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card-pad" style={{ paddingBottom: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="section-title">Live density heatmap</div>
              <button className="btn btn-soft btn-sm" onClick={() => go("map")}><Icon name="map" size={14} /> Open full map</button>
            </div>
          </div>
          <div style={{ height: 320, position: "relative" }}>
            <div className="leaflet-fill" style={{ position: "absolute", inset: 0 }}><HeatPreviewMap reports={areaReports} /></div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {aiSummary
            ? <AISummary title="This week across the valley" text={aiSummary} />
            : (
              <div className="ai-panel" style={{ background: "var(--tint-green)" }}>
                <div className="ai-head"><div className="spark"><Icon name="chart" size={15} /></div><div className="t">Computed from live reports<b>Valley summary</b></div><div className="est">computed</div></div>
                <div className="ai-body" style={{ paddingTop: 16 }}>
                  <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-2)" }}>{computedSummary}</p>
                  <div className="ai-note"><Icon name="info" size={14} /><span>Figures are computed directly from the reports. These figures are computed directly from the reports.</span></div>
                </div>
              </div>
            )}
          <div className="ai-panel">
            <div className="ai-head"><div className="spark"><Icon name="search" size={15} /></div><div className="t">Plain-language query · live<b>Ask the data</b></div><div className="est">computed</div></div>
            <div className="ai-body">
              <div className="searchbox" style={{ width: "100%" }}>
                <Icon name="search" size={15} />
                <input placeholder="e.g. injured dogs, cows, hurt buffalo…" value={query} onChange={e => setQuery(e.target.value)} />
              </div>
              <div style={{ marginTop: 12, padding: 12, background: "var(--green-50)", borderRadius: 10, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>
                <b style={{ color: "var(--green)" }}>Filter →</b> species: {parsed.sp ? SPECIES[parsed.sp].label : "any"} · injured: {parsed.injuredOnly ? "yes" : "any"}. Found <b>{parsed.count} report{parsed.count === 1 ? "" : "s"}</b> across <b>{parsed.areas}</b> area{parsed.areas === 1 ? "" : "s"}.
              </div>
              <div className="ai-note"><Icon name="info" size={14} /><span>This searches your real reports - it never invents data.</span></div>
              <button className="btn btn-soft btn-sm" style={{ width: "100%", marginTop: 12 }} onClick={() => go("map")}><Icon name="map" size={15} /> Open on the map</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ======================= Spatial hotspot analysis ======================= */
export function Hotspots({ go }: any) {
  const { reports } = useStore();
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let on = true;
    api.hotspots().then((r: any) => { if (on) setD(r); }).catch(() => setErr(true));
    return () => { on = false; };
  }, []);

  if (err) return <div className="page wide"><Empty icon="map" title="Hotspot analysis unavailable" text="Could not reach the analytics service. Is the backend running?" /></div>;
  if (!d) return <div className="page wide"><div className="card card-pad muted">Running spatial analysis on live incidents…</div></div>;

  const h = d.headline || {};
  const findings = d.findings || [];
  const TONE: any = {
    danger: { bg: "var(--coral-50)", bd: "var(--coral-100)", fg: "var(--coral-600)" },
    warn: { bg: "var(--gold-50)", bd: "var(--gold-200)", fg: "var(--gold-600)" },
    info: { bg: "var(--green-50)", bd: "var(--green-200)", fg: "var(--sp-buffalo)" },
    ok: { bg: "var(--green-50)", bd: "var(--green-200)", fg: "var(--green)" },
  };
  // "How busy?" - top areas by how many times denser than an average spot (intuitive, not z).
  const busiest = (d.hotspots || []).filter((c: any) => c.kind === "hotspot" && c.area)
    .reduce((acc: any[], c: any) => { if (!acc.find((x: any) => x.area === c.area)) acc.push(c); return acc; }, [])
    .slice(0, 7)
    .map((c: any) => ({ name: c.area, times: c.times_avg, intensity: c.intensity, z: c.gi_z }));
  const INTENSITY_COLOR: any = { extreme: "var(--coral-600)", "very high": "var(--coral)", high: "var(--gold-600)", elevated: "var(--gold)", typical: "var(--ink-4)" };
  // Cluster analytics: which pockets have the highest injured share, and how size relates to injured load.
  const clusterBars = (d.clusters || []).slice(0, 8).map((c: any, i: number) => ({ name: c.area || `#${i + 1}`, share: c.size ? Math.round(c.injured / c.size * 100) : 0 }));
  // Which species dominates the hotspot pockets (welfare mix across clusters).
  const clusterSpeciesMix = (() => {
    const m: any = {};
    (d.clusters || []).forEach((c: any) => { const k = (c.dominant_species || "Other"); m[k] = (m[k] || 0) + c.size; });
    return Object.keys(m).map(k => ({ name: SPECIES[(k || "").toLowerCase()]?.label || k, value: m[k], color: SPECIES[(k || "").toLowerCase()]?.hex || "var(--ink-4)" }));
  })();

  return (
    <div className="page wide">
      <div className="row" style={{ gap: 10, marginBottom: 4 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, display: "grid", placeItems: "center", background: "linear-gradient(135deg,var(--coral-600),var(--gold-600))", color: "#fff" }}><Icon name="map" size={18} /></div>
        <h1 style={{ fontSize: 28 }}>Where to focus</h1>
        <span className="chip chip-sm" style={{ background: "var(--green-50)", color: "var(--green)", borderColor: "var(--green-200)", fontWeight: 700 }}>live · {d.total_points} reports</span>
      </div>
      <p className="muted" style={{ fontSize: 14, marginTop: 4, marginBottom: 18 }}>The areas where animal sightings pile up the most - and where trouble is starting to build. Use it to decide where volunteers and rescues will do the most good.</p>

      {/* --- Plain-language key findings (lead) --- */}
      <div className="card card-pad" style={{ background: "var(--tint-green)", marginBottom: 20 }}>
        <div className="row" style={{ gap: 8, marginBottom: 14 }}><Icon name="zap" size={16} style={{ color: "var(--gold-600)" }} /><b style={{ fontFamily: "var(--ff-display)", fontSize: 15 }}>What the map is telling us</b><span className="chip chip-sm" style={{ marginLeft: "auto" }}>in plain English</span></div>
        <div className="grid-2" style={{ gap: 14 }}>
          {findings.map((f: any, i: number) => {
            const t = TONE[f.tone] || TONE.info;
            return (
              <div key={i} className="row" style={{ gap: 12, alignItems: "flex-start", padding: 14, background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 14 }}>
                <div style={{ width: 32, height: 32, borderRadius: 9, flexShrink: 0, display: "grid", placeItems: "center", background: "var(--card)", color: t.fg }}><Icon name={f.icon} size={16} /></div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{f.title}</div>
                  <div style={{ fontSize: 12.8, color: "var(--ink-2)", lineHeight: 1.5 }}>{f.text}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 20 }}>
        <StatCard icon="alert" label="Priority zones" value={h.priority_zones ?? 0} sub="areas worth proactive patrols" color="var(--coral)" accent="var(--coral-600)" />
        <StatCard icon="flame" label="Busiest spot" value={`${h.top_times_avg ?? 1}×`} sub="denser than an average area" color="var(--gold-600)" accent="var(--gold-600)" />
        <StatCard icon="layers" label="Incident clusters" value={h.cluster_count ?? 0} sub={`biggest groups ${h.largest_cluster ?? 0} sightings`} color="var(--sp-buffalo)" />
        <StatCard icon="chart" label="Areas heating up" value={h.surging_wards ?? 0} sub="rising above their normal level" color="var(--green)" />
      </div>

      <div className="bento" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
        {/* Map of clusters + significant cells */}
        <div className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div className="card-pad" style={{ paddingBottom: 10 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="section-title">Hotspot map</div>
              <button className="btn btn-soft btn-sm" onClick={() => go("map")}><Icon name="map" size={14} /> Full map</button>
            </div>
            <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>Shaded circles are groups of nearby sightings - bigger means more spread out, red means mostly injured animals. Solid dots mark the busiest pockets. Hover for details.</p>
          </div>
          <div style={{ height: 420, position: "relative" }}>
            <div className="leaflet-fill" style={{ position: "absolute", inset: 0 }}>
              <HotspotMap clusters={d.clusters} hotspots={d.hotspots} reports={reports.filter((r: any) => r.moderationState === "published" || !r.moderationState)} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* "How busy" bars - × the average, intuitive */}
          <div className="card card-pad">
            <div className="section-title" style={{ marginBottom: 4 }}>Busiest areas</div>
            <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 10 }}>How many times more sightings than a typical spot in the valley.</p>
            {busiest.length ? (
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={busiest} layout="vertical" margin={{ left: 6, right: 40, top: 0, bottom: 0 }} barCategoryGap={7}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} tickFormatter={(v: any) => `${v}×`} />
                    <YAxis type="category" dataKey="name" width={82} tick={{ fontSize: 11, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTip />} cursor={{ fill: "var(--paper-2)" }} />
                    <Bar dataKey="times" name="× average" radius={[0, 6, 6, 0]} label={{ position: "right", formatter: (v: any) => `${v}×`, fontSize: 10.5, fill: "var(--ink-3)" }}>
                      {busiest.map((b: any, i: number) => <Cell key={i} fill={INTENSITY_COLOR[b.intensity] || "var(--ink-4)"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : <div className="muted" style={{ fontSize: 13, padding: "20px 0", textAlign: "center" }}>No area stands out yet - sightings are spread evenly.</div>}
          </div>

          {/* Ward anomalies - plain language */}
          <div className="card card-pad">
            <div className="section-title" style={{ marginBottom: 8 }}>Areas heating up or cooling down</div>
            {(d.anomalies || []).length ? (d.anomalies || []).map((a: any) => (
              <div key={a.ward} className="row" style={{ justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--line)", gap: 8 }}>
                <span className="row" style={{ gap: 8, minWidth: 0 }}>
                  <span className="chip chip-sm" style={{ background: a.direction === "surge" ? "var(--coral-50)" : "var(--green-50)", color: a.direction === "surge" ? "var(--coral-600)" : "var(--green)", border: "none", fontWeight: 700 }}>{a.direction === "surge" ? "↑ rising" : "↓ easing"}</span>
                  <b style={{ fontSize: 13 }}>{a.ward}</b>
                </span>
                <span className="muted" style={{ fontSize: 12, textAlign: "right" }}>~{a.observed}/day now <span style={{ color: "var(--ink-4)" }}>vs ~{a.expected} usual</span></span>
              </div>
            )) : <div className="muted" style={{ fontSize: 12.5, padding: "10px 0" }}>Every area is behaving normally right now - nothing surging.</div>}
          </div>
        </div>
      </div>

      {/* Cluster analytics: injured share + size-vs-injured + species mix */}
      <div className="bento" style={{ marginTop: 20, gridTemplateColumns: "1.4fr 1fr" }}>
        <div className="card card-pad">
          <div className="section-title" style={{ marginBottom: 4 }}>Where injuries concentrate</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 10 }}>Share of each cluster's sightings that are injured - the tallest bars are the highest-welfare-need pockets.</p>
          {clusterBars.length ? (
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={clusterBars} margin={{ left: -18, right: 8, top: 4, bottom: 0 }} barCategoryGap={12}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--ink-3)" }} axisLine={false} tickLine={false} interval={0} angle={-18} textAnchor="end" height={46} />
                  <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 10.5, fill: "var(--ink-4)" }} axisLine={false} tickLine={false} width={38} />
                  <Tooltip content={<ChartTip />} cursor={{ fill: "var(--paper-2)" }} />
                  <Bar dataKey="share" name="Injured share" radius={[5, 5, 0, 0]}>
                    {clusterBars.map((b: any, i: number) => <Cell key={i} fill={b.share >= 50 ? "var(--coral-600)" : b.share >= 25 ? "var(--gold-600)" : "var(--green-400)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : <div className="muted" style={{ fontSize: 13, padding: "24px 0", textAlign: "center" }}>No clusters to break down yet.</div>}
        </div>

        <div className="card card-pad" style={{ display: "flex", flexDirection: "column" }}>
          <div className="section-title" style={{ marginBottom: 4 }}>What's in the hotspots</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 4 }}>Species making up the clustered sightings.</p>
          <div style={{ flex: 1, minHeight: 200, position: "relative" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={clusterSpeciesMix} dataKey="value" nameKey="name" innerRadius={44} outerRadius={70} paddingAngle={2} stroke="none">
                  {clusterSpeciesMix.map((d2: any, i: number) => <Cell key={i} fill={d2.color} />)}
                </Pie>
                <Tooltip content={<ChartTip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 4 }}>
            {clusterSpeciesMix.map((d2: any, i: number) => <span key={i} className="row" style={{ gap: 6, fontSize: 11.5, color: "var(--ink-3)" }}><i style={{ width: 9, height: 9, borderRadius: 99, background: d2.color }} />{d2.name} <b className="mono" style={{ color: "var(--ink-2)" }}>{d2.value}</b></span>)}
          </div>
        </div>
      </div>

      {/* Clusters table - friendly headers */}
      <div className="card card-pad" style={{ marginTop: 20 }}>
        <div className="section-title" style={{ marginBottom: 4 }}>Groups of nearby sightings</div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>Each row is a pocket of reports close enough for one rescue trip to cover.</p>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--ink-4)", fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".05em" }}>
                <th style={{ padding: "8px 10px" }}>Area</th><th style={{ padding: "8px 10px" }}>Sightings</th><th style={{ padding: "8px 10px" }}>Injured</th><th style={{ padding: "8px 10px" }}>How spread out</th><th style={{ padding: "8px 10px" }}>Mostly</th>
              </tr>
            </thead>
            <tbody>
              {(d.clusters || []).map((c: any, i: number) => (
                <tr key={i} style={{ borderTop: "1px solid var(--line)" }}>
                  <td style={{ padding: "9px 10px", fontWeight: 700 }}>{c.area || "-"}</td>
                  <td style={{ padding: "9px 10px" }}><b>{c.size}</b></td>
                  <td style={{ padding: "9px 10px", color: c.injured ? "var(--coral-600)" : "var(--ink-4)", fontWeight: c.injured ? 700 : 400 }}>{c.injured || "0"}</td>
                  <td style={{ padding: "9px 10px" }} className="muted">{c.radius_m < 300 ? "tight" : c.radius_m < 700 ? "moderate" : "wide"} · ~{Math.round(c.radius_m)} m</td>
                  <td style={{ padding: "9px 10px" }}>{c.dominant_species ? <SpeciesChip sp={(c.dominant_species || "").toLowerCase()} sm /> : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="ai-note" style={{ marginTop: 16 }}><Icon name="info" size={14} /><span>Under the hood: Getis-Ord Gi* significance testing, DBSCAN density clustering, and per-ward anomaly detection - computed live from published reports. The findings above translate those statistics into action.</span></div>
    </div>
  );
}
