/* ============================================================
   SafeTails - App shell + router
   ============================================================ */
"use client";
import { useState, useEffect } from "react";
import { Toaster } from "sonner";
import "./styles.css";
import { Icon } from "./icons";
import { Logo, Avatar } from "./components";
import { AppProvider, useStore } from "./store";
import { levelProgress } from "./adapt";
import { LangProvider, useI18n } from "./i18n";
import { AppearanceProvider } from "./appearance";
import { Landing, AuthScreen, ForgotPassword, ResetPassword } from "./screens_auth";
import { MapDashboard, SubmitReport, ReportDetail } from "./screens_map";
import { Feed, Leaderboard, Profile, Adoption, Insights, Predictions, Hotspots, UserProfile } from "./screens_community";
import { Rescue, Alerts, Settings, HelpCenter } from "./screens_ops";
import { MyReports } from "./screens_myreports";

const NAV = [
  { id: "map",        icon: "map",    label: "Map" },
  { id: "rescue",     icon: "cross",  label: "Rescue & dispatch" },
  { id: "help",       icon: "heart",  label: "Help centre" },
  { id: "feed",       icon: "feed",   label: "Community feed" },
  { id: "leaderboard",icon: "trophy", label: "Leaderboard" },
  { id: "insights",   icon: "chart",  label: "Area insights" },
  { id: "predictions",icon: "sparkle",label: "Risk & predictions" },
  { id: "hotspots",   icon: "heat",   label: "Hotspot analysis" },
  { id: "adoption",   icon: "gift",   label: "Adopt" },
];

const TITLES: any = {
  map: ["Live map", "Stray, lost & injured animal sightings across Nepal - live in the Kathmandu Valley"],
  feed: ["Community feed", "What the community is reporting right now"],
  leaderboard: ["Leaderboard", "Top reporters by verified contribution"],
  insights: ["Area insights", "Aggregated geo-spatial analytics across Kathmandu Valley"],
  predictions: ["Risk & predictions", "ML-driven area risk scoring and incident forecasting from live data"],
  hotspots: ["Hotspot analysis", "Getis-Ord Gi* hotspots, DBSCAN incident clusters & ward anomaly detection"],
  myreports: ["My reports", "Manage your submissions and community contributions"],
  adoption: ["Adopt", "Rescued animals looking for a home"],
  rescue: ["Rescue & dispatch", "Coordinate volunteers and shelters for injured & urgent cases"],
  help: ["Help centre", "Connect helpers and reporters: requests, offers, and coordination chats"],
  alerts: ["Alerts", "Confirmations, rescues, comments & community updates"],
  settings: ["Settings", "Account, privacy, notifications & data controls"],
  profile: ["Your profile", "Reports, reputation & badges"],
  user: ["Reporter profile", "Reports, reputation & badges"],
  submit: ["New report", "Report a sighting"],
  report: ["Report detail", "Sighting details & AI assessment"],
};

function Shell({ screen, go, reportId, setReportId }: any) {
  const { user: ME, reports, unreadCount, search, setSearch, logout } = useStore();
  const { t } = useI18n();
  const inMap = screen === "map";
  return (
    <div className="app">
      <aside className="sidebar">
        <div onClick={() => go("landing")} style={{ cursor: "pointer" }}><Logo light size={26} /></div>

        <button className="side-report" onClick={() => go("submit")}>
          <Icon name="camera" size={18} /> {t("action.report")}
        </button>

        <nav className="nav">
          {NAV.map(n => (
            <a key={n.id} className={"nav-item" + (screen === n.id ? " active" : "")} onClick={() => go(n.id)}>
              <Icon name={n.icon} size={19} /> {t("nav." + n.id, n.label)}
              {n.id === "map" && <span className="count">{reports.filter((r: any) => r.moderationState === "published" || !r.moderationState).length}</span>}
            </a>
          ))}
          <div className="nav-sep"></div>
          <div className="nav-label">{t("nav.you")}</div>
          <a className={"nav-item" + (screen === "myreports" ? " active" : "")} onClick={() => go("myreports")}>
            <Icon name="list" size={19} /> {t("nav.myreports")}
          </a>
          <a className={"nav-item" + (screen === "profile" ? " active" : "")} onClick={() => go("profile")}>
            <Icon name="user" size={19} /> {t("nav.profile")}
          </a>
          <a className={"nav-item" + (screen === "settings" ? " active" : "")} onClick={() => go("settings")}>
            <Icon name="settings" size={19} /> {t("nav.settings")}
          </a>
          <a className="nav-item" onClick={() => { logout(); go("landing"); }}>
            <Icon name="logout" size={19} /> {t("nav.logout")}
          </a>
        </nav>

        {(() => {
          const lp = levelProgress(ME.points);
          return (
            <div className="side-user" onClick={() => go("profile")} title={`${lp.name} - ${lp.toNext} points to level ${lp.nextLevel}`}>
              <Avatar name={ME.name} color="#0c3d24" size={36} ring avatar={ME.avatar} />
              <div className="meta">
                <div className="nm">{ME.name}</div>
                <div className="rp">Lv {ME.level} · {ME.points.toLocaleString()} pts</div>
                <div className="lvlbar" role="progressbar" aria-valuenow={lp.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Progress to level ${lp.nextLevel}`}>
                  <i style={{ width: `${lp.pct}%` }} />
                </div>
                <div className="nxt">{lp.toNext} to Lv {lp.nextLevel}</div>
              </div>
            </div>
          );
        })()}
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1>{t("title." + screen, (TITLES[screen] || ["", ""])[0])}</h1>
            <div className="sub">{t("sub." + screen, (TITLES[screen] || ["", ""])[1])}</div>
          </div>
          <div className="spacer"></div>
          {/* The map has its own integrated location search, so the global search bar is hidden there. */}
          {!inMap && (
            <div className="searchbox">
              <Icon name="search" size={16} />
              <input placeholder={t("search.placeholder")} value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => go("alerts")} style={{ padding: 9, borderRadius: 10, position: "relative" }}>
            <Icon name="bell" size={18} />
            {unreadCount > 0 && <span style={{ position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: 99, background: "var(--coral)", border: "1.5px solid var(--card)" }}></span>}
          </button>
          <button className="btn btn-gold btn-sm" onClick={() => go("submit")}><Icon name="plus" size={15} /> {t("action.reportShort")}</button>
        </header>

        <div className="content" style={inMap ? { overflow: "hidden" } : {}}>
          {screen === "map" && <MapDashboard go={go} selectedId={reportId} setSelectedId={setReportId} />}
          {screen === "rescue" && <Rescue go={go} />}
          {screen === "help" && <HelpCenter go={go} />}
          {screen === "feed" && <Feed go={go} />}
          {screen === "leaderboard" && <Leaderboard go={go} />}
          {screen === "insights" && <Insights go={go} />}
          {screen === "predictions" && <Predictions go={go} />}
          {screen === "hotspots" && <Hotspots go={go} />}
          {screen === "myreports" && <MyReports go={go} />}
          {screen === "adoption" && <Adoption go={go} />}
          {screen === "alerts" && <Alerts go={go} />}
          {screen === "settings" && <Settings go={go} />}
          {screen === "profile" && <Profile go={go} />}
          {screen === "user" && <UserProfile name={reportId} go={go} />}
          {screen === "submit" && <SubmitReport go={go} />}
          {screen === "report" && <ReportDetail id={reportId} go={go} />}
        </div>
      </main>
    </div>
  );
}

// ---- URL <-> screen mapping (real routes + deep links) --------------------
const KNOWN_SCREENS = ["login", "register", "forgot-password", "reset-password", "map", "rescue", "help", "feed", "leaderboard", "insights", "predictions", "hotspots", "myreports", "adoption", "alerts", "settings", "profile"];

function pathToState(pathname: string): { screen: string; reportId: any } {
  const parts = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (!parts.length) return { screen: "landing", reportId: null };
  const [a, b] = parts;
  if (a === "user") return { screen: "user", reportId: b ? decodeURIComponent(b) : null };
  if (a === "report") return b === "new" ? { screen: "submit", reportId: null } : { screen: "report", reportId: b ? decodeURIComponent(b) : null };
  if (KNOWN_SCREENS.includes(a)) return { screen: a, reportId: null };
  return { screen: "landing", reportId: null };
}

function stateToPath(screen: string, id: any): string {
  if (screen === "landing") return "/";
  if (screen === "user") return `/user/${id != null ? encodeURIComponent(id) : ""}`;
  if (screen === "report") return `/report/${id != null ? encodeURIComponent(id) : ""}`;
  if (screen === "submit") return "/report/new";
  return `/${screen}`;
}

// Pages an UNAUTHENTICATED visitor may see. Everything else requires a session.
const PUBLIC_SCREENS = new Set(["landing", "login", "register", "forgot-password", "reset-password"]);
// Pages an AUTHENTICATED user must NOT see (they get bounced to the app home instead).
const AUTHED_BLOCKED_SCREENS = new Set(["landing", "login", "register"]);
const HOME_SCREEN = "map";      // authenticated landing area
const SIGNIN_SCREEN = "login";  // where unauthenticated users are sent

function BootLoader() {
  return (
    <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "var(--paper, #eef3f5)" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <Logo size={30} />
        <div className="spinner" style={{ width: 26, height: 26, borderWidth: 3 }} />
      </div>
    </div>
  );
}

function Root() {
  const { me, authReady } = useStore();
  const [screen, setScreen] = useState("landing");
  const [reportId, setReportId] = useState<any>(null);

  // Initialise from the URL (deep-linking) and keep in sync with browser history so the
  // back/forward buttons return to the page the user actually came from.
  useEffect(() => {
    const init = pathToState(window.location.pathname);
    setScreen(init.screen);
    setReportId(init.reportId);
    window.history.replaceState({ screen: init.screen, reportId: init.reportId }, "", stateToPath(init.screen, init.reportId));

    const onPop = (e: PopStateEvent) => {
      const st = (e.state && e.state.screen) ? e.state : pathToState(window.location.pathname);
      setScreen(st.screen);
      setReportId(st.reportId ?? null);
      const c = document.querySelector(".content");
      if (c) c.scrollTop = 0;
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const nav = (s: string, id?: any, replace = false) => {
    // Track the target id for screens that need one; clear it otherwise.
    const nextId = (s === "report" || s === "user" || s === "map") ? (id ?? null) : null;
    setReportId(nextId);
    setScreen(s);
    const path = stateToPath(s, nextId);
    const st = { screen: s, reportId: nextId };
    // Same screen+id (or a forced guard redirect) -> replace; otherwise push a history entry.
    if (replace || window.location.pathname === path) window.history.replaceState(st, "", path);
    else window.history.pushState(st, "", path);
    const c = document.querySelector(".content");
    if (c) c.scrollTop = 0;
  };
  const go = (s: string, id?: any) => nav(s, id, false);

  // ---- Route guard (client-side). Runs once auth is resolved and whenever the screen changes.
  // Unauthenticated users can only reach PUBLIC_SCREENS; everyone else is sent to sign-in.
  // Authenticated users can never sit on the landing/login/register pages.
  const blockedForGuest = authReady && !me && !PUBLIC_SCREENS.has(screen);
  const blockedForAuthed = authReady && !!me && AUTHED_BLOCKED_SCREENS.has(screen);
  useEffect(() => {
    if (!authReady) return;
    if (blockedForGuest) nav(SIGNIN_SCREEN, null, true);
    else if (blockedForAuthed) nav(HOME_SCREEN, null, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, me, screen]);

  // Never flash protected content: hold on the loader until auth is known and the guard has
  // settled on an allowed screen (the effect above performs the actual redirect).
  if (!authReady || blockedForGuest || blockedForAuthed) return <BootLoader />;

  if (screen === "landing") return <Landing go={go} />;
  if (screen === "login" || screen === "register") return <AuthScreen mode={screen} go={go} />;
  if (screen === "forgot-password") return <ForgotPassword go={go} />;
  if (screen === "reset-password") return <ResetPassword go={go} />;
  return <Shell screen={screen} go={go} reportId={reportId} setReportId={setReportId} />;
}

export default function App() {
  return (
    <AppearanceProvider>
    <LangProvider>
    <AppProvider>
      <Root />
      <Toaster
        position="bottom-right"
        closeButton
        gap={10}
        toastOptions={{
          className: "st-toast",
          style: {
            fontFamily: "var(--ff-sans)",
            background: "var(--card)",
            color: "var(--ink)",
            borderRadius: "14px",
            border: "1px solid var(--line)",
            boxShadow: "var(--shadow-lg)",
            padding: "13px 15px",
          },
        }}
      />
    </AppProvider>
    </LangProvider>
    </AppearanceProvider>
  );
}
