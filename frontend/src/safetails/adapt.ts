// @ts-nocheck
/* ============================================================
   SafeTails - Data adapter
   Maps the backend's normalised shapes (ReportPublic / FeedItem / UserPublic)
   onto the rich, denormalised shape the cloned design components expect.
   This is the single translation seam between the API and the design SPA.
   ============================================================ */
import type { ReportPublic, FeedItem, UserPublic } from "@/lib/api";
import { imageUrl } from "@/lib/api";
import { SPECIES, AV, WARDS } from "./data";

const SPECIES_KEYS = ["dog", "cat", "cow", "buffalo", "other"];

/** Backend species label ("Dog"/"Unverified"/…) → UI species key. */
function speciesKey(label: string | null | undefined): string {
  const k = (label || "").toLowerCase();
  return SPECIES_KEYS.includes(k) ? k : "other";
}

/** Backend report status → design status key. */
function statusKey(s: string | null | undefined): string {
  if (s === "being_helped") return "helping";
  if (s === "resolved") return "resolved";
  return "active";
}

/** Deterministic avatar colour from a name/id (so a user always looks the same). */
export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < (seed || "").length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AV[h % AV.length];
}

/** District lookup from the design's ward table (falls back to Kathmandu). */
function districtFor(ward: string | null | undefined): string {
  const w = WARDS.find((x: any) => x.name === ward);
  return w ? w.district : "Kathmandu";
}

/**
 * The REAL per-class distribution the model produced at inference, persisted with the report.
 * Keys arrive capitalised (Dog/Cat/…); normalise to the UI's lowercase keys. Returns null when a
 * (legacy) report has no stored distribution, so callers can fall back to a synthesised estimate.
 */
export function storedProbs(all: Record<string, number> | null | undefined): Record<string, number> | null {
  if (!all || typeof all !== "object" || !Object.keys(all).length) return null;
  const o: any = {};
  for (const k in all) o[k.toLowerCase()] = all[k];
  return o;
}

/** Synthesise per-class probabilities from (winning label, confidence) - fallback for legacy reports. */
export function probsFor(sp: string, conf: number) {
  const rest = 1 - conf;
  const o: any = {};
  let acc = 0;
  SPECIES_KEYS.forEach((k, i) => {
    if (k === sp) return;
    const v = +(rest * [0.42, 0.27, 0.17, 0.14][i % 4]).toFixed(3);
    o[k] = v;
    acc += v;
  });
  o[sp] = +(conf + (rest - acc)).toFixed(3);
  return o;
}

function minsAgo(iso: string): number {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

export function timeString(mins: number): string {
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 1440) return `${Math.round(mins / 60)} hr ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

function severityFrom(injured: boolean, conf: number | null): string {
  if (!injured) return "none";
  const c = conf ?? 0.7;
  return c >= 0.85 ? "severe" : c >= 0.65 ? "moderate" : "mild";
}

/**
 * Map a backend ReportPublic (optionally with social counts) → the UI report shape.
 */
export function adaptReport(
  r: ReportPublic,
  extra: { like_count?: number; comment_count?: number; liked_by_me?: boolean } = {},
): any {
  // AI ORIGINAL vs HUMAN override are kept distinct so the UI never mislabels a human
  // correction as the model's own prediction ("AI said Dog" bug).
  const aiSp = speciesKey(r.species_label);          // what the model predicted
  const userSp = r.species_user_override ? speciesKey(r.species_user_override) : null;  // human
  const sp = userSp || aiSp;                          // effective (marker/general display)
  const conf = r.species_confidence ?? 0.6;
  const injured = r.injury_status === "injured";
  const mins = minsAgo(r.created_at);
  const reporter = r.reporter_name || "Reporter";
  // Prefer the REAL distribution stored at inference (consistent everywhere); only synthesise for
  // legacy reports that predate persistence.
  const realDist = storedProbs(r.species_all_probs);
  // Generalised locations snap many reports to the same ~100 m cell, so markers can stack and
  // flicker. Add a tiny deterministic display-only jitter (≈±50 m) so they fan out cleanly.
  let h = 0;
  for (let i = 0; i < r.id.length; i++) h = (h * 31 + r.id.charCodeAt(i)) >>> 0;
  const jx = ((h % 1000) / 1000 - 0.5) * 0.0009;
  const jy = (((h >> 10) % 1000) / 1000 - 0.5) * 0.0009;
  return {
    id: r.id,
    reporterId: r.reporter_id,
    lng: r.location.lng + jx,
    lat: r.location.lat + jy,
    image: r.image_path ? imageUrl(r.image_path) : null,
    // Full gallery: main (AI-analysed) image first, then any extra photos.
    images: [r.image_path, ...(r.extra_images || [])].filter(Boolean).map((p: string) => imageUrl(p)),
    species: sp,
    speciesGuess: r.species_user_override || r.species_label,
    speciesSource: r.species_source,
    // HITL provenance (kept separate on purpose)
    aiSpecies: aiSp,                                  // model's own key ("dog"/…)
    aiSpeciesLabel: r.species_label,                  // model's own label ("Dog"/"Unverified")
    aiSpeciesConf: r.species_confidence,
    aiProbs: realDist || probsFor(aiSp, r.species_label === "Unverified" ? Math.min(conf, 0.6) : conf),
    userSpecies: userSp,                             // human override key, or null
    userSpeciesLabel: r.species_user_override || null,
    injured,
    status: statusKey(r.status),
    ward: r.location.ward || "Kathmandu",
    district: districtFor(r.location.ward),
    mins,
    time: timeString(mins),
    note: r.note || "",
    reporter,
    reporterRep: Math.round(r.reporter_reputation ?? 50),
    reporterColor: colorFor(r.reporter_id || reporter),
    reporterAvatar: r.reporter_avatar_url || null,
    conf,
    unverified: r.species_label === "Unverified" || conf < 0.7,
    likes: extra.like_count ?? 0,
    likedByMe: extra.liked_by_me ?? false,
    commentCount: extra.comment_count ?? 0,
    comments: [],
    probs: realDist || probsFor(sp, conf),
    // aiInjury = the ORIGINAL model assessment (immutable), independent of any human override.
    aiInjury: (() => {
      const aiStatus = r.ai_injury_status ?? r.injury_status;
      const aiInjured = aiStatus === "injured";
      const hasAi = aiStatus && aiStatus !== "unknown";
      const aiConf = r.ai_injury_confidence ?? r.injury_confidence;
      return {
        injured: aiInjured,
        unknown: !hasAi,
        confidence: aiConf ?? (aiInjured ? 0.7 : 0.9),
        rationale:
          r.ai_injury_rationale ||
          (!hasAi
            ? "The injury model could not assess this image (AI unavailable)."
            : aiInjured
              ? "Possible signs of injury or distress detected."
              : "No visible wounds, limping, or distress cues detected in the image."),
        severity: severityFrom(aiInjured, aiConf),
      };
    })(),
    // Human-in-the-loop injury review, shown ALONGSIDE (never replacing) the AI original.
    injuryOverride: !!r.injury_user_override,
    injuryReviewed: r.injury_status === "injured" && !!r.injury_user_override,
    spamScore: r.spam_score ?? 0,
    moderationState: r.moderation_state,
    trust: r.moderation_state === "published" ? "published" : "held",
  };
}

export function adaptFeedItem(f: FeedItem): any {
  return {
    ...adaptReport(f.report, {
      like_count: f.like_count,
      comment_count: f.comment_count,
      liked_by_me: f.liked_by_me,
    }),
    confirmCount: f.confirm_count ?? 0,
    flagCount: f.flag_count ?? 0,
    confirmedByMe: !!f.confirmed_by_me,
  };
}

const LEVEL_NAMES: [number, string][] = [
  [5000, "Guardian"],
  [3500, "Trusted Reporter"],
  [1700, "Verified Reporter"],
  [1000, "Active Reporter"],
  [400, "Reporter"],
  [0, "Newcomer"],
];

/**
 * Progress towards the next level, mirroring the server's `level_for_points`
 * (level = floor(sqrt(points / 50)) + 1), so level L starts at 50*(L-1)^2 points.
 * Returned so the sidebar, profile and certificate all describe progress the same way.
 */
export function levelProgress(points: number) {
  const pts = Math.max(0, points || 0);
  const level = Math.floor(Math.sqrt(pts / 50)) + 1;
  const floorPts = 50 * (level - 1) ** 2;
  const nextPts = 50 * level ** 2;
  const span = nextPts - floorPts;
  const into = pts - floorPts;
  // The next *title* only changes at some levels, so report the next one that differs.
  const current = levelName(pts);
  const nextTitle = LEVEL_NAMES.filter(([t]) => t > pts).map(([, n]) => n).pop();
  return {
    level,
    nextLevel: level + 1,
    into,
    span,
    toNext: Math.max(0, nextPts - pts),
    pct: span > 0 ? Math.min(100, Math.round((into / span) * 100)) : 100,
    name: current,
    nextName: nextTitle && nextTitle !== current ? nextTitle : null,
  };
}

export function levelName(points: number): string {
  for (const [threshold, name] of LEVEL_NAMES) if (points >= threshold) return name;
  return "Newcomer";
}

/** Backend UserPublic → the design's `user`/`ME` shape. */
export function adaptUser(u: UserPublic, reportsCount = 0, stats?: any): any {
  const name = u.display_name || u.username;
  return {
    id: u.id,
    name,
    handle: "@" + u.username,
    avatar: u.avatar_url || null,
    color: colorFor(u.id || name),
    level: u.level,
    levelName: levelName(u.points),
    points: u.points,
    reputation: Math.round(u.reputation),
    // `stats` comes from /users/{id}/profile and is authoritative; reportsCount is only the
    // loaded feed slice, which undercounts once the feed is paginated.
    reports: stats?.total_reports ?? reportsCount,
    published: stats?.published_reports ?? 0,
    resolved: stats?.resolved_reports ?? 0,
    areas: stats?.distinct_wards ?? 0,
    helped: stats?.helped_count ?? 0,
    streak: stats?.reporting_streak ?? 0,
    confirmed: 0,
    ward: u.default_ward || "Kathmandu",
    defaultWard: u.default_ward || null,   // null = no home area set (graceful fallback)
    defaultLat: u.default_lat ?? null,
    defaultLng: u.default_lng ?? null,
    joined: new Date(u.created_at).getFullYear()
      ? `${new Date(u.created_at).toLocaleString("en", { month: "short" })} ${new Date(u.created_at).getFullYear()}`
      : "2025",
    role: u.role,
  };
}

export function adaptComment(c: { author: { id?: string; display_name: string; username: string; avatar_url?: string | null }; body: string; created_at: string }) {
  return {
    u: c.author.display_name || c.author.username,
    c: c.body,
    t: timeString(minsAgo(c.created_at)),
    avatar: c.author.avatar_url || null,
    color: colorFor(c.author.id || c.author.username),
  };
}
