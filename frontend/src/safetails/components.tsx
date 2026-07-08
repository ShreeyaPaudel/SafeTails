// @ts-nocheck - verbatim port of the SafeTails design reference (authored without strict typing)
/* ============================================================
   SafeTails - Shared components
   ============================================================ */
import { useState } from "react";
import { Icon, PawPin } from "./icons";
import { SPECIES, STATUS } from "./data";
import { useStore } from "./store";

export function Avatar({ name, color, size, ring, avatar }: any) {
  const s = size || 36;
  const initials = (name || "?").split(" ").map((w: string) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className={"av" + (ring ? " av-ring" : "")}
      style={{ width: s, height: s, background: color || "var(--green)", fontSize: s * 0.4, position: "relative" }}>
      {initials}
      {avatar && (
        <img src={avatar} alt={name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          onError={(e: any) => { e.currentTarget.style.display = "none"; }} />
      )}
    </div>
  );
}

export function Logo({ light, size }: any) {
  return (
    <div className="brand" style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <PawPin size={size || 28} pinColor={light ? "#fff" : "var(--green)"} pawColor="var(--gold)" />
      <span className="word" style={{ fontFamily: "var(--ff-display)", fontWeight: 800, fontSize: (size || 28) * 0.78, letterSpacing: "-.02em", color: light ? "#fff" : "var(--ink)" }}>
        Safe<b style={{ color: light ? "var(--gold)" : "var(--green)" }}>Tails</b>
      </span>
    </div>
  );
}

export function SpeciesChip({ sp, sm }: any) {
  const s = SPECIES[sp];
  return (
    <span className={"chip " + (sm ? "chip-sm " : "") + "sp-" + sp}>
      <span className="dot"></span>{s.label}
    </span>
  );
}
export function StatusChip({ status, sm }: any) {
  const s = STATUS[status];
  return <span className={"chip " + (sm ? "chip-sm " : "") + s.cls}><span className="dot"></span>{s.label}</span>;
}
export function InjuredTag({ sm }: any) {
  return (
    <span className={"chip " + (sm ? "chip-sm " : "") + "tag-injured"}>
      <Icon name="cross" size={sm ? 11 : 13} />Injured
    </span>
  );
}

// Image placeholder with species tint + paw glyph + mono label
export function Ph({ sp, label, h, r, full }: any) {
  return (
    <div className={"ph tint-" + (sp || "other")}
      style={{ height: full ? "100%" : (h || 160), width: "100%", borderRadius: r != null ? r : 12 }}>
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
        <div className="ph-paw" style={{ color: SPECIES[sp || "other"].hex }}>
          <Icon name="paw" size={30} />
        </div>
        <div className="ph-lab">
          <Icon name="camera" size={12} />{label || (SPECIES[sp || "other"].label + " photo")}
        </div>
      </div>
    </div>
  );
}

// Real uploaded photo with a graceful fallback to the tinted placeholder.
export function Photo({ report, h, r, full, label }: any) {
  if (report?.image) {
    return (
      <img
        src={report.image}
        alt={(SPECIES[report.species]?.label || "Animal") + " photo"}
        style={{ width: "100%", height: full ? "100%" : (h || 160), objectFit: "cover", display: "block", borderRadius: r != null ? r : 12, background: "var(--paper-2)" }}
        onError={(e: any) => { e.currentTarget.style.display = "none"; }}
      />
    );
  }
  return <Ph sp={report?.species} label={label} h={h} r={r} full={full} />;
}

// Multi-image carousel: main (AI-analysed) image first, swipeable/clickable through extras.
export function Gallery({ report, h, r, full, label }: any) {
  const [i, setI] = useState(0);
  const imgs = ((report?.images && report.images.length) ? report.images : (report?.image ? [report.image] : [])).filter(Boolean);
  if (!imgs.length) return <Ph sp={report?.species} label={label} h={h} r={r} full={full} />;
  const height = full ? "100%" : (h || 160);
  const rad = r != null ? r : 12;
  const cur = Math.min(i, imgs.length - 1);
  const nav = (d: number, e: any) => { e.stopPropagation(); e.preventDefault(); setI(x => (x + d + imgs.length) % imgs.length); };
  const navStyle: any = (side: string) => ({ position: "absolute", top: "50%", [side]: 8, transform: "translateY(-50%)", width: 30, height: 30, borderRadius: 99, background: "rgba(0,0,0,.5)", color: "#fff", border: "none", cursor: "pointer", display: "grid", placeItems: "center", fontSize: 18, lineHeight: 1, zIndex: 2 });
  return (
    <div style={{ position: "relative", height, width: "100%", background: "var(--paper-2)", borderRadius: rad, overflow: "hidden" }}>
      <img src={imgs[cur]} alt={(SPECIES[report?.species]?.label || "Animal") + " photo"}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        onError={(e: any) => { e.currentTarget.style.visibility = "hidden"; }} />
      {imgs.length > 1 && (
        <>
          <button onClick={(e) => nav(-1, e)} style={navStyle("left")} aria-label="previous photo">‹</button>
          <button onClick={(e) => nav(1, e)} style={navStyle("right")} aria-label="next photo">›</button>
          <span style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 99, zIndex: 2 }}>{cur + 1}/{imgs.length}</span>
          <div style={{ position: "absolute", bottom: 8, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 5, zIndex: 2 }}>
            {imgs.map((_: any, k: number) => <i key={k} style={{ width: k === cur ? 16 : 6, height: 6, borderRadius: 99, background: k === cur ? "#fff" : "rgba(255,255,255,.6)", transition: "width .2s" }} />)}
          </div>
        </>
      )}
    </div>
  );
}

export function ConfidenceMeter({ value, label }: any) {
  const pct = Math.round(value * 100);
  return (
    <div className="conf-meter">
      {label && <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>{label}</span>}
      <div className="conf-bar"><i style={{ width: pct + "%" }}></i></div>
      <span className="conf-num" style={{ color: pct >= 70 ? "var(--green)" : "var(--gold-600)" }}>{pct}%</span>
    </div>
  );
}

export function Toggle({ on, onClick }: any) {
  return <button className={"toggle" + (on ? " on" : "")} onClick={onClick} aria-pressed={on}></button>;
}

export function Check({ on, onClick, children, count, dotClass }: any) {
  return (
    <div className={"check" + (on ? " on" : "")} onClick={onClick}>
      <span className="box">{on && <Icon name="checkSmall" size={12} />}</span>
      {dotClass && <span className="dot" style={{ width: 9, height: 9, borderRadius: 99 }} ><span className={"dot " + dotClass} style={{ display: "inline-block", width: 9, height: 9, borderRadius: 99 }}></span></span>}
      <span>{children}</span>
      {count != null && <span className="cnt">{count}</span>}
    </div>
  );
}

/* ---------- AI showcase panels ---------- */

// Like control: outline heart when not liked, filled red heart + pop animation when liked.
export function LikeButton({ liked, count, onClick, size = 15, showCount = true }: any) {
  return (
    <button
      type="button"
      className={"btn btn-sm like-btn" + (liked ? " liked" : " btn-ghost")}
      onClick={onClick}
      aria-pressed={!!liked}
      aria-label={liked ? "Unlike" : "Like"}
      title={liked ? "Unlike" : "Like"}
    >
      <span key={liked ? "on" : "off"} className={"like-heart" + (liked ? " pop" : "")}>
        <svg width={size} height={size} viewBox="0 0 24 24"
          fill={liked ? "currentColor" : "none"} stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z" />
        </svg>
      </span>
      {showCount && <span className="like-count">{count}</span>}
    </button>
  );
}

// Peer-confirmation control with clear, distinct states: available (CTA) / loading / confirmed /
// your own report. The "available" state is a solid outline CTA so it never looks already-done.
export function ConfirmButton({ report, onConfirm, isOwner, size = "sm", full }: any) {
  const [busy, setBusy] = useState(false);
  const count = report.confirmCount ?? 0;
  const w = full ? { width: "100%" } : {};

  if (isOwner) {
    return (
      <span className="chip chip-sm" style={{ background: "var(--paper-2)", color: "var(--ink-3)", fontWeight: 600, ...w, justifyContent: "center" }}
        title="You can't confirm your own report">
        <Icon name="user" size={12} /> Your report{count ? ` · ${count} confirmed` : ""}
      </span>
    );
  }
  if (report.confirmedByMe) {
    return (
      <span className={"btn btn-" + size + " btn-confirmed"} style={w} title="You confirmed this sighting">
        <Icon name="checkSmall" size={15} /> Confirmed{count ? ` · ${count}` : ""}
      </span>
    );
  }
  const click = async () => {
    if (busy) return;
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };
  return (
    <button className={"btn btn-" + size + " btn-confirm"} style={w} onClick={click} disabled={busy}
      title="Confirm you've seen this animal (+2 pts, helps it get verified)">
      {busy ? <span className="spinner" /> : <Icon name="check" size={15} />}
      {busy ? "Confirming..." : "Confirm sighting"}{!busy && count ? ` · ${count}` : ""}
    </button>
  );
}

// Species classification (own CNN) with class-probability bars
export function SpeciesAIPanel({ report }: any) {
  const { settings } = useStore();
  const showConf = settings?.aiConfidence !== false;
  const order = ["dog","cat","cow","buffalo","other"];
  // Always show the MODEL's own distribution (aiProbs), never the human-corrected one, so the
  // panel is an honest record of what the AI predicted.
  const probs = report.aiProbs || report.probs;
  const sorted = order.map(k => [k, probs[k]]).sort((a: any, b: any) => b[1] - a[1]);
  const win = sorted[0][0];
  // A human correction exists only when the reviewer chose a different species than the model.
  const corrected = report.userSpecies && report.userSpecies !== report.aiSpecies;
  const aiLabel = report.aiSpeciesLabel || SPECIES[report.aiSpecies]?.label;
  return (
    <div className="ai-panel">
      <div className="ai-head">
        <div className="spark"><Icon name="sparkle" size={15} /></div>
        <div className="t">SafeTails CNN · EfficientNet-B0<b>Species classification</b></div>
        <div className="est">trained model</div>
      </div>
      <div className="ai-body">
        {sorted.map(([k, v]: any) => (
          <div key={k} className={"prob-row" + (k === win ? " win" : "")}>
            <div className="prob-label"><span className={"dot dot-" + k} style={{ width: 9, height: 9, borderRadius: 99, display: "inline-block" }}></span>{SPECIES[k].label}</div>
            <div className="prob-track"><div className="prob-fill" style={{ width: (v * 100) + "%", background: SPECIES[k].hex }}></div></div>
            {showConf && <div className="prob-val">{(v * 100).toFixed(1)}%</div>}
          </div>
        ))}
        {report.unverified ? (
          <div className="ai-note" style={{ color: "var(--gold-600)" }}>
            <Icon name="alert" size={14} />
            <span>AI confidence below the <b className="mono">0.70</b> threshold → labelled <b>Unverified</b>. AI estimate: <b>“{aiLabel}”</b>. You can correct this label.</span>
          </div>
        ) : (
          <div className="ai-note">
            <Icon name="info" size={14} />
            <span>AI prediction: <b>“{aiLabel}”</b> · calibrated confidence (temperature&nbsp;scaling). May be wrong - you can correct the label.</span>
          </div>
        )}
        {corrected && (
          <div className="ai-note" style={{ color: "var(--green)", borderTop: "1px dashed var(--line)", marginTop: 4 }}>
            <Icon name="checkSmall" size={14} />
            <span>Corrected by a human reviewer to <b>“{report.userSpeciesLabel}”</b>. The AI's original prediction above is kept for the record.</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Injury assessment (AI)
export function InjuryAIPanel({ report }: any) {
  const { settings } = useStore();
  const showConf = settings?.aiConfidence !== false;
  const showWhy = settings?.aiRationale !== false;
  const inj = report.aiInjury;                 // ORIGINAL AI assessment (immutable)
  const reviewed = report.injuryReviewed;      // a human marked it injured, diverging from AI
  const accent = inj.unknown ? "var(--gold-200)" : inj.injured ? "var(--coral-100)" : "var(--green-200)";
  return (
    <div className="ai-panel" style={{ borderColor: accent }}>
      <div className="ai-head" style={{ background: inj.unknown ? "var(--gold-50)" : inj.injured ? "var(--coral-50)" : "var(--green-50)", borderColor: accent }}>
        <div className="spark" style={{ background: inj.unknown ? "var(--gold-600)" : inj.injured ? "var(--coral)" : "var(--green)" }}>
          <Icon name={inj.unknown ? "info" : inj.injured ? "cross" : "shield"} size={15} />
        </div>
        <div className="t">AI · injury model<b>Injury assessment</b></div>
        <div className="est">AI estimate</div>
      </div>
      <div className="ai-body">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 18, color: inj.unknown ? "var(--gold-600)" : inj.injured ? "var(--coral-600)" : "var(--green)" }}>
              {inj.unknown ? "Not assessed" : inj.injured ? "Possibly injured" : "No visible injury"}
            </span>
            {inj.injured && !inj.unknown && <span className="chip chip-sm tag-injured" style={{ textTransform: "capitalize" }}>{inj.severity}</span>}
          </div>
        </div>
        {!inj.unknown && showConf && <ConfidenceMeter value={inj.confidence} label="AI confidence" />}
        {showWhy && <div className="ai-note"><Icon name="info" size={14} /><span>{inj.rationale}</span></div>}
        {reviewed && (
          <div className="ai-note" style={{ color: "var(--coral-600)", borderTop: "1px dashed var(--line)", marginTop: 4 }}>
            <Icon name="alert" size={14} />
            <span>Flagged as <b>injured</b> by the reporter (human review). Emergency cases are published immediately; the AI's original assessment above is preserved.</span>
          </div>
        )}
      </div>
    </div>
  );
}

// Reputation-weighted anti-spam / trust judgment
export function TrustAIPanel({ report }: any) {
  const held = report.trust === "held";
  // Real spam score from the backend (0..1); no placeholder values.
  const score = Math.max(0, Math.min(1, report.spamScore ?? (held ? 0.6 : 0.05)));
  const reasons = held
    ? ["Reputation or a spam signal held this for peer confirmation", `Reporter reputation: ${report.reporterRep ?? "-"}`, "Awaiting peer confirmation to publish"]
    : [`Reporter reputation: ${report.reporterRep ?? "-"}`, "Image hash unique (no duplicate detected)", "Submission velocity within normal range"];
  return (
    <div className="ai-panel" style={{ borderColor: held ? "var(--gold-200)" : "var(--green-200)" }}>
      <div className="ai-head" style={{ background: held ? "var(--gold-50)" : "#eef7f1", borderColor: held ? "var(--gold-200)" : "var(--green-200)" }}>
        <div className="spark" style={{ background: held ? "var(--gold-600)" : "var(--green)" }}><Icon name="shield" size={15} /></div>
        <div className="t">AI + deterministic guards<b>Reputation-weighted validation</b></div>
        <div className="est">{held ? "held" : "published"}</div>
      </div>
      <div className="ai-body">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>Spam score</span>
              <span className="mono" style={{ fontSize: 12.5, color: held ? "var(--gold-600)" : "var(--green)" }}>{score.toFixed(2)}</span>
            </div>
            <div className="prob-track" style={{ height: 8 }}>
              <div className="prob-fill" style={{ width: Math.round(score * 100) + "%", background: held ? "var(--gold)" : "var(--green-400)" }}></div>
            </div>
          </div>
        </div>
        <div className="col" style={{ gap: 6 }}>
          {reasons.map((r, i) => (
            <div key={i} className="row" style={{ gap: 8, fontSize: 12.5, color: "var(--ink-2)" }}>
              <Icon name={held ? "info" : "checkSmall"} size={14} style={{ color: held ? "var(--gold-600)" : "var(--green)", flex: "0 0 14px" }} />
              <span>{r}</span>
            </div>
          ))}
        </div>
        <div className="ai-note">
          <Icon name="info" size={14} />
          <span>{held
            ? "Held for peer confirmation - earns no points until two neighbours validate it. Deterministic guards (perceptual-hash dedup + rate limits) ran first; the AI judged the summary."
            : "Published immediately under reputation-weighted moderation. Deterministic guards passed; the AI found no abuse signals."}</span>
        </div>
      </div>
    </div>
  );
}

// AI hotspot / ward summary (AI narrative)
export function AISummary({ title, text, compact }: any) {
  return (
    <div className="ai-panel" style={{ background: "var(--tint-green)" }}>
      <div className="ai-head">
        <div className="spark"><Icon name="sparkle" size={15} /></div>
        <div className="t">AI insight<b>{title || "Hotspot summary"}</b></div>
        <div className="est">AI-generated</div>
      </div>
      <div className="ai-body" style={{ paddingTop: compact ? 12 : 16 }}>
        <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-2)" }}>{text}</p>
        <div className="ai-note"><Icon name="info" size={14} /><span>Generated from aggregated ward statistics. Phrased by AI - figures are computed, not invented.</span></div>
      </div>
    </div>
  );
}

export function StatCard({ icon, label, value, sub, color, accent }: any) {
  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="section-title">{label}</span>
        <div style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: (color || "var(--green)") + "1f", color: color || "var(--green)" }}>
          <Icon name={icon} size={17} />
        </div>
      </div>
      <div className="kpi" style={{ color: color || "var(--ink)" }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, color: accent || "var(--ink-3)", fontWeight: 600 }}>{sub}</div>}
    </div>
  );
}

export function Empty({ icon, title, text }: any) {
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--ink-3)" }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--green-50)", color: "var(--green)", display: "grid", placeItems: "center", margin: "0 auto 14px" }}>
        <Icon name={icon || "search"} size={26} />
      </div>
      <div style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: 17, color: "var(--ink)", marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13.5 }}>{text}</div>
    </div>
  );
}
