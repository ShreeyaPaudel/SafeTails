// @ts-nocheck - verbatim port of the SafeTails design reference (authored without strict typing)
/* ============================================================
   SafeTails - My Reports: a single place to manage your activity.
   Tabs: My reports (all states) · Pending verification · Helped reports.
   Non-emergency reports are held here until the community verifies them;
   injured/severe reports publish immediately (emergency fast-track).
   ============================================================ */
import { useEffect, useMemo, useState } from "react";
import { Icon } from "./icons";
import { Avatar, SpeciesChip, StatusChip, StatCard, Empty, Ph } from "./components";
import { SPECIES } from "./data";
import { api } from "@/lib/api";
import { adaptReport, timeString } from "./adapt";
import { useStore } from "./store";
import { toast } from "sonner";

/* moderation-state → label + colour */
const MOD: any = {
  published: { label: "Published", color: "var(--green)", bg: "var(--green-50)", icon: "check" },
  pending_confirmation: { label: "Pending verification", color: "var(--gold-600)", bg: "var(--gold-50)", icon: "clock" },
  rejected: { label: "Not published", color: "var(--coral-600)", bg: "var(--coral-50)", icon: "alert" },
};

const SIGNAL_LABEL: any = {
  duplicate_image: "Duplicate image", text_similarity: "Repeated text", burst_frequency: "High frequency",
  location_repetition: "Same location", reputation_deficit: "Low reputation", historical_accuracy: "Past accuracy",
  community_flags: "Community flags", ai_content: "AI content check",
};

/* Transparent per-signal anti-spam breakdown (owner-only). */
export function ModerationBreakdown({ moderation }: any) {
  if (!moderation) return null;
  const comps = Object.entries(moderation.components || {}).filter(([, v]: any) => v > 0).sort((a: any, b: any) => b[1] - a[1]);
  const reasons = moderation.reasons || [];
  if (!comps.length && !reasons.length) return null;
  return (
    <div style={{ marginTop: 10, padding: 12, background: "var(--paper-2)", borderRadius: 10 }}>
      <div className="row" style={{ gap: 6, marginBottom: 8, color: "var(--ink-3)" }}><Icon name="shield" size={13} /><span className="section-title" style={{ fontSize: 11 }}>Why this happened · multi-factor spam engine</span></div>
      {reasons.length > 0 && (
        <ul style={{ margin: "0 0 10px", paddingLeft: 16, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
          {reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
        </ul>
      )}
      {comps.map(([k, v]: any) => (
        <div key={k} style={{ marginBottom: 6 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{SIGNAL_LABEL[k] || k}</span>
            <span className="mono muted" style={{ fontSize: 11 }}>{Math.round(v * 100)}%</span>
          </div>
          <div className="prob-track" style={{ height: 5 }}><div className="prob-fill" style={{ width: Math.round(v * 100) + "%", background: v >= 0.5 ? "var(--coral-600)" : "var(--gold-600)" }} /></div>
        </div>
      ))}
    </div>
  );
}

function ReportRow({ r, go, showHelp }: any) {
  const a = useMemo(() => ({ ...adaptReport(r), moderation: r.moderation }), [r]);
  const mod = MOD[r.moderation_state] || MOD.published;
  const isPending = r.moderation_state === "pending_confirmation";
  const isRejected = r.moderation_state === "rejected";
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ overflow: "hidden", marginBottom: 12 }}>
      <div className="row" style={{ gap: 14, padding: 14, alignItems: "flex-start" }}>
        <div style={{ width: 84, height: 84, borderRadius: 12, overflow: "hidden", flexShrink: 0, cursor: "pointer" }} onClick={() => go("report", r.id)}>
          {a.image ? <img src={a.image} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Ph sp={a.species} h={84} r={0} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <SpeciesChip sp={a.species} sm />
            {a.injured && <span className="chip chip-sm" style={{ background: "var(--coral-50)", color: "var(--coral-600)", border: "none", fontWeight: 700 }}><Icon name="cross" size={11} /> Injured</span>}
            <StatusChip status={a.status} sm />
            <span className="chip chip-sm" style={{ background: mod.bg, color: mod.color, border: "none", fontWeight: 700 }}><Icon name={mod.icon} size={11} /> {mod.label}</span>
          </div>
          <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.5, cursor: "pointer" }} onClick={() => go("report", r.id)}>{a.note || <span className="muted">(no note)</span>}</div>
          <div className="row" style={{ gap: 12, marginTop: 8, fontSize: 12, color: "var(--ink-4)", flexWrap: "wrap" }}>
            <span className="row" style={{ gap: 4 }}><Icon name="location" size={12} /> {a.ward}</span>
            <span className="row" style={{ gap: 4 }}><Icon name="clock" size={12} /> {a.time}</span>
            {showHelp && a.reporter && <span className="row" style={{ gap: 5 }}><Avatar name={a.reporter} color={a.reporterColor} size={16} avatar={a.reporterAvatar} /> {a.reporter.split(" ")[0]}</span>}
          </div>

          {isPending && (
            <div className="row" style={{ gap: 8, marginTop: 10, padding: "8px 11px", background: "var(--gold-50)", borderRadius: 9, fontSize: 12, color: "var(--gold-700, var(--gold-600))" }}>
              <Icon name="clock" size={13} />
              <span>Awaiting community verification. It publishes automatically as soon as one member confirms it - extra confirmations boost your trust &amp; points. {a.injured ? "" : "Emergency reports skip this wait."}</span>
            </div>
          )}
          {isRejected && (
            <div className="row" style={{ gap: 8, marginTop: 10, padding: "8px 11px", background: "var(--coral-50)", borderRadius: 9, fontSize: 12, color: "var(--coral-600)" }}>
              <Icon name="alert" size={13} />
              <span>This report was flagged as spam and isn't shown publicly. Repeated spam reports reduce your reputation.</span>
            </div>
          )}
          {(isPending || isRejected) && r.moderation && (
            <>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, padding: "4px 8px", fontSize: 12 }} onClick={() => setOpen(o => !o)}>
                <Icon name={open ? "chevUp" : "chevDown"} size={13} /> {open ? "Hide" : "Why?"}
              </button>
              {open && <ModerationBreakdown moderation={r.moderation} />}
            </>
          )}
        </div>
        <button className="btn btn-soft btn-sm" style={{ flexShrink: 0 }} onClick={() => go("report", r.id)}>View <Icon name="arrowRight" size={13} /></button>
      </div>
    </div>
  );
}

export function MyReports({ go }: any) {
  const { user: ME } = useStore();
  const [mine, setMine] = useState<any[] | null>(null);
  const [helped, setHelped] = useState<any[] | null>(null);
  const [saved, setSaved] = useState<any[] | null>(null);
  const [tab, setTab] = useState("all");

  const load = () => {
    api.myReports().then(setMine).catch(() => { setMine([]); toast.error("Could not load your reports"); });
    api.helpedReports().then(setHelped).catch(() => setHelped([]));
    api.savedReports().then(setSaved).catch(() => setSaved([]));
  };
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => {
    const m = mine || [];
    return {
      all: m.length,
      pending: m.filter((r: any) => r.moderation_state === "pending_confirmation").length,
      rejected: m.filter((r: any) => r.moderation_state === "rejected").length,
      published: m.filter((r: any) => r.moderation_state === "published").length,
      helped: (helped || []).length,
      saved: (saved || []).length,
    };
  }, [mine, helped, saved]);

  const TABS = [
    { id: "all", label: "My reports", n: counts.all },
    { id: "pending", label: "Pending verification", n: counts.pending },
    { id: "rejected", label: "Not published", n: counts.rejected },
    { id: "helped", label: "Helped", n: counts.helped },
    { id: "saved", label: "Saved", n: counts.saved },
  ];

  const rows = useMemo(() => {
    if (tab === "helped") return helped || [];
    if (tab === "saved") return saved || [];
    const m = mine || [];
    if (tab === "pending") return m.filter((r: any) => r.moderation_state === "pending_confirmation");
    if (tab === "rejected") return m.filter((r: any) => r.moderation_state === "rejected");
    return m;
  }, [tab, mine, helped, saved]);

  const loading = mine === null;

  return (
    <div className="page wide">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 28 }}>My reports</h1>
          <p className="muted" style={{ fontSize: 14, marginTop: 6 }}>Everything you've reported and every case you've helped on - in one place.</p>
        </div>
        <button className="btn btn-gold" onClick={() => go("submit")}><Icon name="plus" size={15} /> New report</button>
      </div>

      <div className="grid-4" style={{ marginTop: 18 }}>
        <StatCard icon="stack" label="Total submitted" value={counts.all} sub={`${counts.published} published`} accent="var(--green)" />
        <StatCard icon="clock" label="Pending verification" value={counts.pending} sub="awaiting community confirmation" color="var(--gold-600)" accent="var(--gold-600)" />
        <StatCard icon="heart" label="Cases helped" value={counts.helped} sub="your community contributions" color="var(--coral)" accent="var(--coral-600)" />
        <StatCard icon="trophy" label="Points" value={ME.points?.toLocaleString?.() ?? ME.points} sub={`Level ${ME.level}`} color="var(--sp-buffalo)" />
      </div>

      {/* tabs */}
      <div className="row" style={{ gap: 4, marginTop: 22, marginBottom: 16, borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ position: "relative", padding: "9px 14px 13px", background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13.5, color: tab === t.id ? "var(--green)" : "var(--ink-4)", display: "inline-flex", alignItems: "center", gap: 7 }}>
            {t.label}
            <span className="chip chip-sm" style={{ background: tab === t.id ? "var(--green)" : "var(--paper-2)", color: tab === t.id ? "#fff" : "var(--ink-3)", border: "none", fontWeight: 700, minWidth: 20, justifyContent: "center" }}>{t.n}</span>
            {tab === t.id && <span style={{ position: "absolute", left: 0, right: 0, bottom: -1, height: 2.5, background: "var(--green)", borderRadius: 2 }} />}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="card card-pad muted">Loading your activity…</div>
      ) : rows.length === 0 ? (
        <Empty
          icon={tab === "helped" ? "heart" : tab === "saved" ? "star" : "camera"}
          title={tab === "helped" ? "You haven't helped on a case yet" : tab === "saved" ? "No saved reports" : tab === "pending" ? "Nothing pending" : tab === "rejected" ? "Nothing here - great!" : "No reports yet"}
          text={tab === "helped" ? "Offer to help on an urgent case from the map or dispatch board to build your contribution history." : tab === "saved" ? "Tap the star on any report to bookmark it here for later." : tab === "pending" ? "Reports awaiting community verification will appear here." : tab === "rejected" ? "None of your reports were flagged as spam." : "Report your first sighting to get started."}
        />
      ) : (
        <div>{rows.map((r: any) => <ReportRow key={r.id} r={r} go={go} showHelp={tab === "helped" || tab === "saved"} />)}</div>
      )}
    </div>
  );
}
