/**
 * Typed client for the backend API. Mirrors docs/API_CONTRACT.md.
 * Base URL from NEXT_PUBLIC_API_BASE_URL (see .env.example).
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const TOKEN_KEY = "stray_token";
// Presence cookie mirroring the session, so Next.js middleware can enforce route protection
// server-side (localStorage isn't visible to middleware). The real authorization gate remains the
// JWT checked by the backend on every API call; this cookie only drives navigation/redirects.
const AUTH_COOKIE = "st_auth";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
    document.cookie = `${AUTH_COOKIE}=1; path=/; max-age=604800; samesite=lax${secure}`;
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
    document.cookie = `${AUTH_COOKIE}=; path=/; max-age=0; samesite=lax${secure}`;
  }
}

// ---- Types ----------------------------------------------------------------
export interface UserPublic {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  reputation: number;
  points: number;
  level: number;
  role: string;
  created_at: string;
  default_lat?: number | null;
  default_lng?: number | null;
  default_ward?: string | null;
  preferences?: Record<string, any> | null;
}

export interface GeneralisedLocation {
  lat: number;
  lng: number;
  ward: string | null;
}

export interface ReportPublic {
  id: string;
  reporter_id: string;
  reporter_name: string | null;
  reporter_reputation: number | null;
  image_path: string;
  extra_images?: string[];
  location: GeneralisedLocation;
  species_label: string;
  species_confidence: number | null;
  species_source: string;
  species_all_probs?: Record<string, number> | null;
  species_user_override: string | null;
  injury_status: string;
  injury_confidence: number | null;
  injury_rationale: string | null;
  ai_injury_status: string | null;
  ai_injury_confidence: number | null;
  ai_injury_rationale: string | null;
  injury_user_override: boolean;
  note: string | null;
  status: string;
  moderation_state: string;
  spam_score: number;
  // Owner/moderator-only transparency breakdown (null on the public feed).
  moderation?: { reasons: string[]; decision: string[]; components: Record<string, number> } | null;
  created_at: string;
}

export interface AuthResponse {
  user: UserPublic;
  access_token: string;
  token_type: string;
}

export interface FeedItem {
  report: ReportPublic;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
  confirm_count: number;
  flag_count: number;
  confirmed_by_me: boolean;
}

export interface Confirmer {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  vote: string;
  created_at: string;
}
export interface ConfirmationInfo {
  confirm_count: number;
  flag_count: number;
  confirmed_by_me: boolean;
  my_vote: string | null;
  confirmers: Confirmer[];
}

export interface HelpItem {
  id: string;
  report_id: string;
  status: string;
  message: string | null;
  helper_name: string | null;
  helper_avatar_url: string | null;
  reporter_name: string | null;
  species_label: string | null;
  ward: string | null;
  injured: boolean;
}

export interface CommentOut {
  id: string;
  report_id: string;
  author: { id: string; username: string; display_name: string; avatar_url: string | null };
  body: string;
  created_at: string;
}

export interface LeaderboardEntry {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  points: number;
  reputation: number;
  level: number;
  reports_count: number;
  ward: string | null;
}

export interface BadgeOut {
  code: string;
  name: string;
  description: string;
  awarded_at: string | null;
}

export interface Profile {
  user: UserPublic;
  badges: BadgeOut[];
  all_badges: { code: string; name: string; description: string; earned: boolean; negative: boolean }[];
  reputation_breakdown: { confirmation_rate: number; ai_agreement_rate: number; flag_rate: number; confirmed: number; total: number };
  rank: number | null;
  stats: {
    total_reports: number;
    published_reports: number;
    distinct_wards: number;
    resolved_reports: number;
    helped_count: number;
    reporting_streak: number;
    spam_strikes: number;
    suspended: boolean;
  };
}

export interface HotspotCell { lat: number; lng: number; count: number; gi_z: number; significance: string; kind: string; times_avg: number; intensity: string; area: string | null }
export interface IncidentCluster { lat: number; lng: number; size: number; radius_m: number; injured: number; dominant_species: string | null; area: string | null }
export interface WardAnomaly { ward: string; observed: number; expected: number; z: number; direction: string }
export interface HotspotFinding { icon: string; tone: string; title: string; text: string }
export interface HotspotAnalysis {
  generated_at: string;
  total_points: number;
  findings: HotspotFinding[];
  hotspots: HotspotCell[];
  clusters: IncidentCluster[];
  anomalies: WardAnomaly[];
  headline: { priority_zones: number; top_times_avg: number; top_hotspot_z: number; cluster_count: number; largest_cluster: number; surging_wards: number };
  method: Record<string, string>;
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: Record<string, unknown>;
  }>;
}

export interface HeatPoint {
  lat: number;
  lng: number;
  weight: number;
}

// Short-lived cache for the leaderboard, keyed by period (shared by several screens).
const _lbCache: Record<string, { t: number; p: Promise<LeaderboardEntry[]> }> = {};

// ---- Core fetch -----------------------------------------------------------
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, cache: "no-store" });
  if (!res.ok) {
    // Global session-expiry handling: a 401 while we hold a token means the session is no longer
    // valid. Clear it and signal the app so the route guard bounces the user to sign-in at once
    // (not only on the next refresh) - unauthorized access stays blocked at all times.
    if (res.status === 401 && getToken()) {
      setToken(null);
      if (typeof window !== "undefined") window.dispatchEvent(new Event("auth:expired"));
    }
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // health
  health: () => request<{ status: string; version: string }>("/health"),

  // auth
  register: (body: { email: string; username: string; password: string; display_name?: string }) =>
    request<AuthResponse>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  me: () => request<UserPublic>("/auth/me"),
  forgotPassword: (email: string, method: "link" | "otp") =>
    request<{ sent: boolean; method: string; dev?: { otp: string; token: string; link: string } }>(
      "/auth/forgot-password", { method: "POST", body: JSON.stringify({ email, method }) }),
  resetPassword: (body: { new_password: string; token?: string; email?: string; otp?: string }) =>
    request<{ reset: boolean }>("/auth/reset-password", { method: "POST", body: JSON.stringify(body) }),
  googleAvailable: () => request<{ available: boolean; client_id: string | null }>("/auth/google/available"),
  googleAuth: (id_token: string) =>
    request<AuthResponse>("/auth/google", { method: "POST", body: JSON.stringify({ id_token }) }),
  updateProfile: (body: { display_name?: string; username?: string; default_lat?: number | null; default_lng?: number | null; default_ward?: string | null; clear_location?: boolean; preferences?: Record<string, any> }) =>
    request<UserPublic>("/auth/me", { method: "PATCH", body: JSON.stringify(body) }),
  uploadAvatar: (form: FormData) =>
    request<UserPublic>("/auth/me/avatar", { method: "POST", body: form }),
  // XHR-based upload so the UI can show real byte-level progress (fetch can't report upload %).
  uploadAvatarProgress: (file: File, onProgress: (pct: number) => void) =>
    new Promise<UserPublic>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE_URL}/auth/me/avatar`);
      const token = getToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error("Unexpected response")); }
        } else {
          let detail = `${xhr.status}`;
          try { detail = JSON.parse(xhr.responseText).detail || detail; } catch {}
          reject(new Error(detail));
        }
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      const fd = new FormData(); fd.append("image", file);
      xhr.send(fd);
    }),
  exportMyData: () => request<any>("/auth/me/export"),
  deleteAccount: () => request<void>("/auth/me", { method: "DELETE" }),
  changePassword: (current_password: string, new_password: string) =>
    request<{ changed: boolean }>("/auth/me/change-password", { method: "POST", body: JSON.stringify({ current_password, new_password }) }),

  // reports
  classify: (form: FormData) =>
    request<{ label: string; confidence: number | null; all_class_probs: Record<string, number>; source: string; model_available: boolean }>(
      "/reports/classify",
      { method: "POST", body: form },
    ),
  assess: (form: FormData) =>
    request<{
      species: { label: string; confidence: number | null; all_class_probs: Record<string, number>; source: string; model_available: boolean };
      injury: { status: string; injured: boolean | null; confidence: number | null; rationale: string | null; severity_hint: string | null; error: string | null };
    }>("/reports/assess", { method: "POST", body: form }),
  listReports: (qs = "") => request<ReportPublic[]>(`/reports${qs}`),
  submitReport: (form: FormData) =>
    request<ReportPublic>("/reports", { method: "POST", body: form }),
  getReport: (id: string) => request<ReportPublic>(`/reports/${id}`),
  updateReport: (id: string, body: { status?: string; species_user_override?: string }) =>
    request<ReportPublic>(`/reports/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteReport: (id: string) => request<void>(`/reports/${id}`, { method: "DELETE" }),
  confirmReport: (id: string, vote: "confirm" | "flag_spam" | "flag_invalid") =>
    request<{ moderation_state: string; confirm_count: number; flag_count: number; flag_weight: number; transition: string | null }>(
      `/reports/${id}/confirm`,
      { method: "POST", body: JSON.stringify({ vote }) },
    ),
  confirmations: (id: string) => request<ConfirmationInfo>(`/reports/${id}/confirmations`),
  aiFeedback: (id: string, target: "species" | "injury", agree: boolean) =>
    request<{ target: string; your_vote: boolean; agree: number; disagree: number }>(
      `/reports/${id}/ai-feedback`, { method: "POST", body: JSON.stringify({ target, agree }) }),
  myConfirmedReports: () => request<ReportPublic[]>("/me/confirmed-reports"),
  myReports: () => request<ReportPublic[]>("/reports/mine"),
  helpedReports: () => request<ReportPublic[]>("/reports/helped"),
  savedReports: () => request<ReportPublic[]>("/reports/saved"),
  saveReport: (id: string) => request<{ saved: boolean }>(`/reports/${id}/save`, { method: "POST" }),
  unsaveReport: (id: string) => request<{ saved: boolean }>(`/reports/${id}/save`, { method: "DELETE" }),

  // map
  markers: (qs = "") => request<GeoJSONFeatureCollection>(`/map/markers${qs}`),
  heatmap: (qs = "") => request<HeatPoint[]>(`/map/heatmap${qs}`),
  wards: () => request<{ type: string; features: unknown[]; ward_counts: Record<string, number> }>("/map/wards"),
  hotspotSummary: (qs = "") =>
    request<{ stats: Record<string, unknown>; ai_summary: string | null; is_ai_generated: boolean }>(
      `/map/hotspot/summary${qs}`,
    ),

  // analytics - single source of truth for all KPIs/charts (live DB aggregates)
  summary: () => request<any>("/insights/summary"),
  predictions: () => request<any>("/insights/predictions"),
  hotspots: () => request<HotspotAnalysis>("/insights/hotspots"),

  // notifications - derived live from DB events (polled by the client)
  notifications: () => request<Array<{ id: string; kind: string; icon: string; accent: string; title: string; body: string; created_at: string; report_id: string | null }>>("/notifications"),

  // gamification. Deduped + 15s cached: several screens request the leaderboard on mount, so
  // this collapses those into a single network call instead of 3-4 concurrent ones.
  leaderboard: (period: "all" | "week" = "all") => {
    const c = _lbCache[period];
    if (!c || Date.now() - c.t > 15000) {
      _lbCache[period] = { t: Date.now(), p: request<LeaderboardEntry[]>(`/leaderboard?period=${period}`).catch((e) => { delete _lbCache[period]; throw e; }) };
    }
    return _lbCache[period].p;
  },
  profile: (id: string) => request<Profile>(`/users/${id}/profile`),
  userReports: (id: string, limit = 12, offset = 0) =>
    request<ReportPublic[]>(`/users/${id}/reports?limit=${limit}&offset=${offset}`),
  pointsHistory: (id: string, days = 30) =>
    request<{ baseline: number; days: number; series: { day: string; gained: number; points: number }[] }>(`/users/${id}/points-history?days=${days}`),

  // social
  feed: (qs = "") => request<FeedItem[]>(`/feed${qs}`),
  like: (id: string) => request<{ like_count: number; liked: boolean }>(`/reports/${id}/like`, { method: "POST" }),
  unlike: (id: string) => request<{ like_count: number; liked: boolean }>(`/reports/${id}/like`, { method: "DELETE" }),
  comments: (id: string) => request<CommentOut[]>(`/reports/${id}/comments`),

  // help requests (dispatch "Start helping" -> reporter accepts)
  offerHelp: (reportId: string, message?: string) =>
    request<HelpItem>(`/reports/${reportId}/help`, { method: "POST", body: JSON.stringify({ message }) }),
  incomingHelp: () => request<HelpItem[]>("/help-requests/incoming"),
  myHelpRequests: () => request<HelpItem[]>("/help-requests/mine"),
  acceptHelp: (id: string) => request<HelpItem>(`/help-requests/${id}/accept`, { method: "POST" }),
  declineHelp: (id: string) => request<HelpItem>(`/help-requests/${id}/decline`, { method: "POST" }),

  // coordination chat (reporter <-> accepted helpers on a report)
  messages: (reportId: string) =>
    request<{ can_chat: boolean; participants: Array<{ id: string; name: string; avatar_url: string | null; role: string }>; messages: Array<{ id: string; sender_id: string; sender_name: string; sender_avatar: string | null; body: string; created_at: string }> }>(`/reports/${reportId}/messages`),
  sendMessage: (reportId: string, body: string) =>
    request<{ can_chat: boolean; participants: any[]; messages: any[] }>(`/reports/${reportId}/messages`, { method: "POST", body: JSON.stringify({ body }) }),
  conversations: () =>
    request<Array<{ report_id: string; species_label: string; ward: string | null; role: string; last_message: string | null; last_at: string | null; participants: any[] }>>("/conversations"),
  addComment: (id: string, body: string) =>
    request<CommentOut>(`/reports/${id}/comments`, { method: "POST", body: JSON.stringify({ body }) }),

  // adoption listings (rescued/adoptable animals)
  adoptions: (status?: string) => request<AdoptionOut[]>(`/adoptions${status ? `?status=${status}` : ""}`),
  createAdoption: (body: { title: string; description?: string; contact_info?: string; photo_path?: string; report_id?: string }) =>
    request<AdoptionOut>("/adoptions", { method: "POST", body: JSON.stringify(body) }),
  updateAdoption: (id: string, status: string) =>
    request<AdoptionOut>(`/adoptions/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  deleteAdoption: (id: string) => request<void>(`/adoptions/${id}`, { method: "DELETE" }),
};

export interface AdoptionOut {
  id: string;
  title: string;
  description: string;
  photo_path: string | null;
  contact_info: string;
  status: string;
  report_id: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
}

export function imageUrl(path: string): string {
  if (!path) return "";
  // Cloudinary (or any) absolute URL: use as-is.
  if (/^https?:\/\//i.test(path)) return path;
  // Otherwise it's a local OS path: expose the filename via the static uploads mount.
  const file = path.replace(/\\/g, "/").split("/").pop();
  return `${API_BASE_URL}/uploads/${file}`;
}
