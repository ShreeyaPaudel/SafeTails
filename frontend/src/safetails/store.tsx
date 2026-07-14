// @ts-nocheck - verbatim port of the SafeTails design reference (authored without strict typing)
/* ============================================================
   SafeTails - Central app store (state + actions)
   ------------------------------------------------------------
   This is the single data layer for the whole app. It now talks to the
   real FastAPI backend via `@/lib/api` and translates responses through
   `./adapt`. Screens that don't yet have a backend (notifications,
   rescue & dispatch, adoption) still read the design seed data - these
   are clearly marked SEED below.
   ============================================================ */
import { createContext, useContext, useMemo, useState, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { api, setToken, getToken } from "@/lib/api";
import {
  RESCUES as SEED_RESCUES, WARDS, AV,
} from "./data";
import { adaptReport, adaptFeedItem, adaptUser, adaptComment, levelProgress } from "./adapt";

// Read/unread state for notifications is kept client-side (localStorage) against stable ids.
const NOTIF_READ_KEY = "safetails_read_notifs";
function loadReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try { return new Set(JSON.parse(window.localStorage.getItem(NOTIF_READ_KEY) || "[]")); }
  catch { return new Set(); }
}
function saveReadIds(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(NOTIF_READ_KEY, JSON.stringify([...ids].slice(-400))); } catch {}
}
function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

function nearestWardLL(lng: number, lat: number) {
  let best: any = WARDS[0], bd = Infinity;
  WARDS.forEach(w => { const d = (w.lng - lng) ** 2 + (w.lat - lat) ** 2; if (d < bd) { bd = d; best = w; } });
  return best;
}

const GUEST = {
  name: "Guest", handle: "@guest", color: "#157d8f", level: 1, levelName: "Newcomer",
  points: 0, reputation: 50, reports: 0, confirmed: 0, ward: "Kathmandu", joined: "2025",
};

// User-configurable preferences (persisted to the backend under user.preferences). The privacy
// guarantees (generalise/exif/hideGps) are ALWAYS enforced server-side and shown as locked.
const DEFAULT_SETTINGS = {
  publicProfile: true,
  pushUrgent: true, pushConfirm: true, pushComment: true, pushAchievements: true, digest: true, leaderboard: true,
  // AI assistance controls (all functional - see components + notifications gating).
  showAI: true, aiConfidence: true, aiRationale: true, aiInsightNotif: true, aiRecommend: true,
  lang: "en",
};
// Keys that are real, persisted preferences (the rest are always-on guarantees).
const PREF_KEYS = Object.keys(DEFAULT_SETTINGS);

const StoreCtx = createContext<any>(null);

export function AppProvider({ children }: any) {
  const [me, setMe] = useState<any>(null);          // raw UserPublic from backend
  const [authReady, setAuthReady] = useState(false);
  const [reports, setReports] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [stats, setStats] = useState<any>(null);  // DB aggregates - single source of truth for KPIs

  const [notifs, setNotifs] = useState<any[]>([]);            // live, from /notifications
  const [readIds, setReadIds] = useState<Set<string>>(() => loadReadIds());
  const [rescues] = useState<any[]>(() => SEED_RESCUES.map(r => ({ ...r })));

  const [settings, setSettings] = useState<any>(() => ({ ...DEFAULT_SETTINGS }));
  const [search, setSearch] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarProgress, setAvatarProgress] = useState(0);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  /* -------- Reports loading -------- */
  const loadStats = useCallback(async () => {
    try { setStats(await api.summary()); } catch (e) { /* backend down */ }
  }, []);

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    try {
      // Pull the full visible set (not a small page) so client lists match the DB aggregates.
      const [feed] = await Promise.all([api.feed("?limit=500"), loadStats()]);
      setReports(feed.map(adaptFeedItem));
    } catch (e: any) {
      // Feed is public; a failure usually means the backend is down.
      console.warn("loadReports failed", e?.message);
    } finally {
      setLoadingReports(false);
    }
  }, [loadStats]);

  const refreshMe = useCallback(async () => {
    try {
      const fresh = await api.me();
      setMe(fresh);
      refreshMyProfile(fresh.id);   // totals, badges and streak all move with points
    } catch (e) { /* token invalid */ }
  }, []);

  /* -------- Bootstrap: restore session + load reports -------- */
  useEffect(() => {
    (async () => {
      const tok = getToken();
      let valid = false;
      if (tok) {
        try {
          setMe(await api.me());
          setToken(tok);   // re-affirm the auth cookie for middleware (existing sessions/refresh)
          valid = true;
        } catch {
          setToken(null);  // invalid/expired token -> clear localStorage + cookie
        }
      } else {
        setToken(null);    // ensure no stale auth cookie without a token
      }
      // Only fetch app data for an authenticated session - unauthenticated visitors are gated to
      // the auth pages and must not trigger data-API calls.
      if (valid) {
        await loadReports();
        api.savedReports().then((rows: any[]) => setSavedIds(new Set(rows.map(r => r.id)))).catch(() => {});
      }
      setAuthReady(true);
    })();
  }, [loadReports]);

  /* -------- Auth -------- */
  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password });
    setToken(res.access_token);
    setMe(res.user);
    loadReports();  // load the feed in the background - don't block sign-in on it
    return res.user;
  }, [loadReports]);

  const register = useCallback(async (email: string, username: string, password: string, displayName?: string) => {
    const res = await api.register({ email, username, password, display_name: displayName });
    setToken(res.access_token);
    setMe(res.user);
    loadReports();  // background
    return res.user;
  }, [loadReports]);

  const logout = useCallback(() => { setToken(null); setMe(null); setReports([]); setStats(null); setMyProfile(null); }, []);

  // Global session-expiry: the API client fires "auth:expired" on a 401 (expired/invalid token).
  // Drop the user + any loaded data so the route guard immediately redirects to sign-in.
  useEffect(() => {
    const onExpired = () => { setMe(null); setReports([]); setStats(null); };
    window.addEventListener("auth:expired", onExpired);
    return () => window.removeEventListener("auth:expired", onExpired);
  }, []);

  /* -------- Derived current-user shape (design `user`/`ME`) -------- */
  // The loaded feed is only a paginated slice, so counting it undercounts a user's own
  // reports. The server profile carries the real totals; this stays as the fallback.
  const myReportsCount = useMemo(
    () => (me ? reports.filter(r => r.reporterId === me.id).length : 0),
    [reports, me],
  );
  const [myProfile, setMyProfile] = useState<any>(null);
  const refreshMyProfile = useCallback(async (id?: string) => {
    const uid = id || me?.id;
    if (!uid) { setMyProfile(null); return; }
    try { setMyProfile(await api.profile(uid)); } catch { /* non-fatal: falls back to the slice */ }
  }, [me?.id]);
  useEffect(() => { refreshMyProfile(); }, [me?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const user = useMemo(
    () => (me ? adaptUser(me, myReportsCount, myProfile?.stats) : GUEST),
    [me, myReportsCount, myProfile],
  );

  /* -------- Reward feedback: announce points, levels and badges as they land -------- */
  // Every point-earning action already calls refreshMe(), so watching `me` catches them all
  // in one place rather than scattering reward copy through each individual action.
  const prevReward = useRef<{ points: number; level: number; badges: number; known: boolean } | null>(null);
  useEffect(() => {
    if (!me) { prevReward.current = null; return; }
    // `known` guards the badge comparison: the profile arrives a moment after `me`, so the
    // count legitimately goes 0 -> n on every sign-in and that is not an unlock.
    const now = {
      points: me.points ?? 0,
      level: me.level ?? 1,
      badges: myProfile?.badges?.length ?? 0,
      known: !!myProfile,
    };
    const was = prevReward.current;
    prevReward.current = now;
    if (!was) return;                       // first observation: nothing to compare against
    if (now.level > was.level) {
      const lp = levelProgress(now.points);
      toast.success("Level " + now.level + " reached", {
        description: "You are now a " + lp.name + ". " + lp.toNext + " points to level " + lp.nextLevel + ".",
      });
    } else if (now.points > was.points) {
      const lp = levelProgress(now.points);
      toast.success("+" + (now.points - was.points) + " points", {
        description: lp.toNext + " more to level " + lp.nextLevel + ".",
      });
    }
    if (was.known && now.known && now.badges > was.badges) {
      const latest = myProfile.badges[myProfile.badges.length - 1];
      toast.success("Badge unlocked", { description: latest?.name || "A new badge is on your profile." });
    }
  }, [me?.points, me?.level, myProfile]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* -------- Reports actions -------- */
  // API: POST /reports (multipart). Server runs CNN + AI + anti-spam and returns the report.
  const addReport = useCallback(async (draft: any) => {
    // draft.files = all selected photos (first is the main, AI-analysed one); draft.file kept for back-compat.
    const files: File[] = (draft.files && draft.files.length) ? draft.files : (draft.file ? [draft.file] : []);
    if (!files.length) { toast.error("Please add a photo first."); return null; }
    const pin = draft.pin || (draft.ward ? { lng: draft.ward.lng, lat: draft.ward.lat } : null);
    if (!pin) { toast.error("Please drop a location pin."); return null; }
    const fd = new FormData();
    fd.append("image", files[0]);                       // main image (AI-analysed)
    files.slice(1, 6).forEach(f => fd.append("extra_images", f));  // additional photos
    fd.append("lat", String(pin.lat));
    fd.append("lng", String(pin.lng));
    if (draft.species) fd.append("species_user_label", draft.species[0].toUpperCase() + draft.species.slice(1));
    if (draft.note) fd.append("note", draft.note);
    if (draft.injured) fd.append("injured", "true");  // human-in-the-loop override
    const created = await api.submitReport(fd);
    const adapted = adaptReport(created);
    setReports(prev => [adapted, ...prev]);
    if (created.ai_notice) toast(created.ai_notice, { icon: "⚠️" });  // never fail silently
    refreshMe(); loadReports();  // background - show the success screen immediately
    return adapted;
  }, [refreshMe, loadReports]);

  const toggleLike = useCallback(async (id: string) => {
    if (!me) { toast("Log in to like reports."); return; }
    const cur = reports.find(r => r.id === id);
    const willLike = !(cur?.likedByMe);
    // optimistic
    setReports(rs => rs.map(r => r.id === id ? { ...r, likedByMe: willLike, likes: r.likes + (willLike ? 1 : -1) } : r));
    try {
      const res = willLike ? await api.like(id) : await api.unlike(id);
      setReports(rs => rs.map(r => r.id === id ? { ...r, likedByMe: res.liked, likes: res.like_count } : r));
    } catch (e: any) {
      setReports(rs => rs.map(r => r.id === id ? { ...r, likedByMe: !willLike, likes: r.likes + (willLike ? -1 : 1) } : r));
      toast.error("Couldn't update like");
    }
  }, [reports, me]);

  const isLiked = useCallback((id: string) => !!reports.find(r => r.id === id)?.likedByMe, [reports]);

  const isSaved = useCallback((id: string) => savedIds.has(id), [savedIds]);
  const toggleSave = useCallback(async (id: string) => {
    if (!me) { toast("Log in to save reports."); return; }
    const willSave = !savedIds.has(id);
    // optimistic
    setSavedIds(prev => { const n = new Set(prev); willSave ? n.add(id) : n.delete(id); return n; });
    try {
      willSave ? await api.saveReport(id) : await api.unsaveReport(id);
      toast.success(willSave ? "Saved to your bookmarks" : "Removed from bookmarks");
    } catch (e: any) {
      setSavedIds(prev => { const n = new Set(prev); willSave ? n.delete(id) : n.add(id); return n; });
      toast.error(e?.message || "Couldn't update bookmark");
    }
  }, [me, savedIds]);

  const loadComments = useCallback(async (id: string) => {
    try {
      const list = await api.comments(id);
      const mapped = list.map(adaptComment);
      setReports(rs => rs.map(r => r.id === id ? { ...r, comments: mapped, commentCount: mapped.length } : r));
      return mapped;
    } catch (e) { return []; }
  }, []);

  const addComment = useCallback(async (id: string, text: string) => {
    if (!text.trim()) return;
    if (!me) { toast("Log in to comment."); return; }
    try {
      const c = await api.addComment(id, text.trim());
      const mapped = adaptComment(c);
      setReports(rs => rs.map(r => r.id === id
        ? { ...r, comments: [...(r.comments || []), mapped], commentCount: (r.commentCount || 0) + 1 }
        : r));
    } catch (e: any) { toast.error("Couldn't post comment"); }
  }, [me]);

  const confirmReport = useCallback(async (id: string) => {
    if (!me) { toast("Log in to confirm sightings."); return; }
    const mine = reports.find(r => r.id === id);
    if (mine && mine.reporterId === me.id) { toast("You can't confirm your own report."); return; }
    if (mine?.confirmedByMe) { toast("You've already confirmed this sighting."); return; }
    try {
      const res = await api.confirmReport(id, "confirm");
      // Reflect the confirmed state immediately so the button flips to "Confirmed".
      setReports(rs => rs.map(r => r.id === id
        ? { ...r, confirmedByMe: true, confirmCount: res.confirm_count,
            ...(res.transition === "published" ? { trust: "published", moderationState: "published" } : {}) }
        : r));
      toast.success("Sighting confirmed - thank you!", {
        description: res.transition === "published" ? "It reached enough confirmations to publish." : "Your confirmation was recorded (+2 pts).",
      });
      if (res.transition === "published") loadStats();
      await refreshMe();
    } catch (e: any) {
      if (e?.message?.toLowerCase().includes("already")) {
        setReports(rs => rs.map(r => r.id === id ? { ...r, confirmedByMe: true } : r));
        toast("You've already confirmed this sighting.");
      } else {
        toast.error(e?.message || "Couldn't confirm");
      }
    }
  }, [me, reports, refreshMe, loadStats]);

  const flagReport = useCallback(async (id: string, vote: "flag_spam" | "flag_invalid" = "flag_spam") => {
    if (!me) { toast("Log in to report spam."); return; }
    const mine = reports.find(r => r.id === id);
    if (mine && mine.reporterId === me.id) { toast("You can't flag your own report."); return; }
    try {
      const res = await api.confirmReport(id, vote);
      setReports(rs => rs.map(r => r.id === id
        ? { ...r, flagCount: res.flag_count, myVote: vote,
            ...(res.transition === "rejected" ? { moderationState: "rejected", trust: "held" } : {}),
            ...(res.transition === "under_review" ? { moderationState: "pending_confirmation", trust: "held" } : {}) }
        : r));
      const msg = res.transition === "rejected" ? "Report removed - enough trusted flags confirmed it as spam."
        : res.transition === "under_review" ? "Flagged - this report is now hidden for review."
        : "Thanks - your flag was recorded and weighted by your reputation.";
      toast.success(msg);
      if (res.transition === "rejected" || res.transition === "under_review") loadStats();
      await refreshMe();
    } catch (e: any) {
      if (e?.message?.toLowerCase().includes("already")) toast("You've already voted on this report.");
      else toast.error(e?.message || "Couldn't flag report");
    }
  }, [me, reports, refreshMe, loadStats]);

  const shareReport = useCallback((id: string) => {
    const url = `${location.origin}/r/${id}`;
    try { navigator.clipboard?.writeText(url); } catch (e) {}
    toast.success("Share link copied", { description: url });
  }, []);

  // Change a report's lifecycle status (owner / moderator). UI uses helping → backend being_helped.
  const setReportStatus = useCallback(async (id: string, uiStatus: string) => {
    const backendStatus = uiStatus === "helping" ? "being_helped" : uiStatus;
    setReports(rs => rs.map(r => r.id === id ? { ...r, status: uiStatus } : r));  // optimistic
    try {
      await api.updateReport(id, { status: backendStatus });
      toast.success(`Status updated to “${uiStatus === "helping" ? "Being helped" : uiStatus}”`);
      loadStats();      // keep KPI counts in sync
      refreshMe();      // resolving a case awards points/badges -> update the sidebar immediately
    } catch (e: any) {
      toast.error(e?.message || "Couldn't update status");
      await loadReports();
    }
  }, [loadReports, loadStats, refreshMe]);

  /* -------- Help requests (dispatch) -------- */
  const [incomingHelp, setIncomingHelp] = useState<any[]>([]);
  const loadIncomingHelp = useCallback(async () => {
    try { setIncomingHelp(await api.incomingHelp()); } catch (e) { /* not logged in */ }
  }, []);
  const offerHelp = useCallback(async (reportId: string, message?: string) => {
    if (!me) { toast("Log in to offer help."); return; }
    const r = reports.find((x: any) => x.id === reportId);
    if (r && r.reporterId === me.id) { toast("This is your own report."); return; }
    try { await api.offerHelp(reportId, message); toast.success("Help offer sent to the reporter"); }
    catch (e: any) { toast(e?.message?.includes("already") ? "You already offered help on this." : (e?.message || "Couldn't send offer")); }
  }, [me, reports]);
  const respondHelp = useCallback(async (id: string, accept: boolean) => {
    try {
      const res = accept ? await api.acceptHelp(id) : await api.declineHelp(id);
      setIncomingHelp(list => list.filter((h: any) => h.id !== id));
      if (accept) { toast.success("Accepted - the responder can now help."); await loadReports(); refreshMe(); }
      else toast("Offer declined.");
      return res;
    } catch (e: any) { toast.error(e?.message || "Couldn't respond"); }
  }, [loadReports, refreshMe]);

  /* -------- Notifications (live, polled) -------- */
  const loadNotifs = useCallback(async () => {
    try { setNotifs(await api.notifications()); } catch (e) { /* not logged in / backend down */ }
  }, []);
  // Poll every 25s while signed in so alerts stay current without a manual refresh.
  useEffect(() => {
    if (!me) { setNotifs([]); return; }
    loadNotifs();
    loadIncomingHelp();
    const iv = setInterval(() => { loadNotifs(); loadIncomingHelp(); }, 25000);
    return () => clearInterval(iv);
  }, [me, loadNotifs, loadIncomingHelp]);

  const uploadAvatar = useCallback(async (file: any) => {
    // Basic client-side validation before the (indeterminate) upload.
    if (!file.type?.startsWith("image/")) { toast.error("Please choose an image file."); return false; }
    if (file.size > 8 * 1024 * 1024) { toast.error("Image is too large (max 8 MB)."); return false; }
    setAvatarUploading(true);
    setAvatarProgress(0);
    try {
      const updated = await api.uploadAvatarProgress(file, (pct) => setAvatarProgress(pct));
      setAvatarProgress(100);
      setMe(updated);
      toast.success("Profile photo updated");
      loadReports();  // reflect the new avatar on the user's feed cards too
      return true;
    } catch (e: any) { toast.error(e?.message || "Couldn't upload photo"); return false; }
    finally { setAvatarUploading(false); }
  }, [loadReports]);

  const updateProfile = useCallback(async (body: any, opts: any = {}) => {
    try {
      setMe(await api.updateProfile(body));
      if (!opts.silent) toast.success(opts.successMsg || "Profile updated");
      return true;
    } catch (e: any) { toast.error(e?.message || "Couldn't update profile"); return false; }
  }, []);

  // Save a preferred default location (used by "Near me" and rescue recommendations).
  const saveDefaultLocation = useCallback(async (lat: number, lng: number, ward?: string) => {
    try {
      setMe(await api.updateProfile({ default_lat: lat, default_lng: lng, default_ward: ward }));
      toast.success("Default location saved");
    } catch (e: any) { toast.error(e?.message || "Couldn't save location"); }
  }, []);

  // Google Sign-In: exchange the Google ID token for our session (creates/links the account).
  const googleLogin = useCallback(async (idToken: string) => {
    const res = await api.googleAuth(idToken);
    setToken(res.access_token);
    setMe(res.user);
    loadReports();
    return res.user;
  }, [loadReports]);

  const deleteReport = useCallback(async (id: string) => {
    try {
      await api.deleteReport(id);
      setReports(rs => rs.filter(r => r.id !== id));
      loadStats();
      toast.success("Report deleted");
      return true;
    } catch (e: any) {
      toast.error(e?.message || "Couldn't delete report");
      return false;
    }
  }, [loadStats]);

  // HITL: reporter corrects the species label on their own report.
  const setReportSpecies = useCallback(async (id: string, speciesKey: string) => {
    const label = speciesKey[0].toUpperCase() + speciesKey.slice(1);
    setReports(rs => rs.map(r => r.id === id ? { ...r, species: speciesKey, speciesGuess: label } : r));
    try { await api.updateReport(id, { species_user_override: label }); toast.success(`Species corrected to ${label}`); }
    catch (e: any) { toast.error("Couldn't update species"); await loadReports(); }
  }, [loadReports]);

  /* -------- Notifications: read-state tracked client-side against stable ids -------- */
  const markNotifRead = useCallback((id: string) => {
    setReadIds(prev => { const next = new Set(prev); next.add(id); saveReadIds(next); return next; });
  }, []);
  const markAllNotifsRead = useCallback(() => {
    setReadIds(prev => { const next = new Set(prev); notifs.forEach((n: any) => next.add(n.id)); saveReadIds(next); return next; });
  }, [notifs]);
  // Display shape: attach a relative time + unread flag derived from readIds.
  const notifsView = useMemo(
    () => notifs.map((n: any) => ({ ...n, time: relTime(n.created_at), unread: !readIds.has(n.id) })),
    [notifs, readIds],
  );

  /* -------- Settings (persisted to user.preferences) -------- */
  // Load saved preferences when the signed-in user changes.
  useEffect(() => {
    if (me?.preferences) setSettings((s: any) => ({ ...s, ...me.preferences }));
  }, [me?.id]);
  const persistPrefs = useCallback((next: any) => {
    if (!me) return;
    const prefs: any = {}; PREF_KEYS.forEach(k => { prefs[k] = next[k]; });
    api.updateProfile({ preferences: prefs }).then(setMe).catch(() => { /* keep local */ });
  }, [me]);
  const toggleSetting = useCallback((key: string) =>
    setSettings((s: any) => { const next = { ...s, [key]: !s[key] }; persistPrefs(next); return next; }), [persistPrefs]);
  const setSetting = useCallback((key: string, value: any) =>
    setSettings((s: any) => { const next = { ...s, [key]: value }; persistPrefs(next); return next; }), [persistPrefs]);

  /* -------- Adoption / misc -------- */
  const enquireAdoption = useCallback((a: any) => toast.success(`Enquiry sent to ${a.org}`, { description: `They'll be in touch about ${a.name}.` }), []);
  const exportData = useCallback(async () => {
    if (!me) { toast("Log in to export your data."); return; }
    try {
      const data = await api.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `safetails-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success("Your data export downloaded", { description: `${data.reports?.length ?? 0} reports, ${data.comments?.length ?? 0} comments, ${data.point_events?.length ?? 0} point events.` });
    } catch (e: any) { toast.error(e?.message || "Couldn't export your data"); }
  }, [me]);
  const deleteAccount = useCallback(async () => {
    try {
      await api.deleteAccount();
      setToken(null); setMe(null);
      toast.success("Your account has been deleted.");
      return true;
    } catch (e: any) { toast.error(e?.message || "Couldn't delete account"); return false; }
  }, []);

  const value = useMemo(() => ({
    user, me, authReady, isAuthed: !!me, loadingReports, avatarUploading, avatarProgress,
    reports, stats, loadStats, notifs: notifsView, rescues, settings, search,
    unreadCount: notifsView.filter((n: any) => n.unread).length,
    setSearch,
    login, register, logout, googleLogin, refreshMe, loadReports,
    addReport, toggleLike, isLiked, isSaved, toggleSave, addComment, loadComments, confirmReport, flagReport, shareReport,
    setReportStatus, setReportSpecies, deleteReport, uploadAvatar, updateProfile, saveDefaultLocation,
    incomingHelp, offerHelp, respondHelp, loadIncomingHelp,
    markNotifRead, markAllNotifsRead,
    toggleSetting, setSetting,
    enquireAdoption, exportData, deleteAccount,
    nearestWardLL,
  }), [user, me, authReady, loadingReports, avatarUploading, avatarProgress, savedIds, reports, stats, loadStats, notifsView, rescues, settings, search,
    setSearch, login, register, logout, googleLogin, refreshMe, loadReports,
    addReport, toggleLike, isLiked, isSaved, toggleSave, addComment, loadComments, confirmReport, flagReport, shareReport,
    setReportStatus, setReportSpecies, deleteReport, uploadAvatar, updateProfile, saveDefaultLocation,
    incomingHelp, offerHelp, respondHelp, loadIncomingHelp,
    markNotifRead, markAllNotifsRead, toggleSetting, setSetting, enquireAdoption, exportData]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used within AppProvider");
  return ctx;
}
