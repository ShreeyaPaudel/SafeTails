// @ts-nocheck - verbatim port of the SafeTails design reference (authored without strict typing)
/* ============================================================
   SafeTails - Landing + Auth
   ============================================================ */
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Icon } from "./icons";
import { Logo, Avatar, SpeciesAIPanel, InjuryAIPanel } from "./components";
import { REPORTS, LEADERS, WARDS } from "./data";
import { MAP_W, MAP_H, VALLEY_PROJ } from "./geo";
import { ValleyBase, PinShape } from "./map";
import { useStore } from "./store";

function LandingNav({ go }: any) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(238,243,245,.82)", backdropFilter: "blur(10px)", borderBottom: "1px solid var(--line)" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "14px 28px", display: "flex", alignItems: "center" }}>
        <Logo size={28} />
        <div style={{ flex: 1 }}></div>
        <div className="row" style={{ gap: 8 }}>
          <a className="nav-link" style={{ padding: "8px 14px", fontWeight: 600, fontSize: 14, color: "var(--ink-2)" }}>How it works</a>
          <a className="nav-link" style={{ padding: "8px 14px", fontWeight: 600, fontSize: 14, color: "var(--ink-2)" }}>The AI</a>
          <button className="btn btn-ghost btn-sm" onClick={() => go("login")}>Log in</button>
          <button className="btn btn-primary btn-sm" onClick={() => go("register")}>Get started</button>
        </div>
      </div>
    </div>
  );
}

function HeroMap() {
  const sample = REPORTS.slice(0, 10);
  return (
    <div className="card" style={{ padding: 0, overflow: "hidden", height: 420, position: "relative", boxShadow: "var(--shadow-lg)" }}>
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} preserveAspectRatio="xMidYMid slice" style={{ width: "100%", height: "100%" }}>
        <ValleyBase />
        {sample.map(r => {
          const [x, y] = VALLEY_PROJ.project(r.lng, r.lat);
          return <g key={r.id} transform={`translate(${x},${y})`}><PinShape r={r} /></g>;
        })}
      </svg>
      <div style={{ position: "absolute", left: 16, bottom: 16, right: 16, display: "flex", gap: 10, alignItems: "flex-end", justifyContent: "space-between" }}>
        <div className="map-panel" style={{ padding: "10px 14px", display: "flex", gap: 18 }}>
          <div><div className="kpi" style={{ fontSize: 22, color: "var(--green)" }}>196</div><div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600 }}>reports this week</div></div>
          <div><div className="kpi" style={{ fontSize: 22, color: "var(--coral-600)" }}>41</div><div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600 }}>flagged injured</div></div>
          <div><div className="kpi" style={{ fontSize: 22, color: "var(--gold-600)" }}>13</div><div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 600 }}>active wards</div></div>
        </div>
      </div>
    </div>
  );
}

export function Landing({ go }: any) {
  const feats = [
    { icon: "pin", c: "var(--green)", t: "Report in seconds", d: "Snap a photo, drop a pin. SafeTails strips EXIF data and shows only a generalised ~100m area - never your exact GPS." },
    { icon: "sparkle", c: "var(--gold-600)", t: "AI does the heavy lifting", d: "An on-device CNN names the species; the AI flags possible injury and writes a short, honest rationale you can correct." },
    { icon: "layers", c: "var(--sp-buffalo)", t: "See the whole valley", d: "Every sighting lands on a live map with clustering, a density heatmap, and ward-level hotspot summaries." },
    { icon: "shield", c: "var(--sp-cow)", t: "Trust, not noise", d: "A reputation-weighted system rewards good reporting and resists point-farming, so the map stays reliable." },
  ];
  return (
    <div style={{ minHeight: "100vh", overflow: "auto" }}>
      <LandingNav go={go} />

      {/* hero */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "56px 28px 28px", display: "grid", gridTemplateColumns: "1fr 1.05fr", gap: 48, alignItems: "center" }}>
        <div>
          <div className="chip" style={{ background: "var(--green-50)", color: "var(--green)", borderColor: "var(--green-200)", marginBottom: 20 }}>
            <Icon name="location" size={13} /> Built for urban Kathmandu · काठमाडौँ
          </div>
          <h1 style={{ fontSize: 54, lineHeight: 1.02, letterSpacing: "-.03em" }}>
            A kinder map for the <span style={{ color: "var(--green)" }}>street animals</span> of Kathmandu.
          </h1>
          <p style={{ fontSize: 17.5, lineHeight: 1.55, color: "var(--ink-2)", marginTop: 20, maxWidth: 480 }}>
            SafeTails turns scattered social-media posts into structured, verifiable sightings - so the community can find, track, and help stray, lost, and injured animals together.
          </p>
          <div className="row" style={{ gap: 12, marginTop: 28 }}>
            <button className="btn btn-primary btn-lg" onClick={() => go("register")}><Icon name="paw" size={18} /> Join SafeTails</button>
            <button className="btn btn-ghost btn-lg" onClick={() => go("login")}><Icon name="user" size={18} /> Log in</button>
          </div>
          <div className="row" style={{ gap: 22, marginTop: 30 }}>
            <div className="row" style={{ gap: -8 }}>
              {LEADERS.slice(0, 4).map((l, i) => (
                <div key={i} style={{ marginLeft: i ? -10 : 0 }}><Avatar name={l.name} color={l.color} size={34} ring /></div>
              ))}
            </div>
            <div style={{ fontSize: 13.5, color: "var(--ink-3)", fontWeight: 600 }}>2,400+ reporters across <b style={{ color: "var(--ink)" }}>13 wards</b></div>
          </div>
        </div>
        <HeroMap />
      </div>

      {/* features */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "44px 28px" }}>
        <div className="grid-4">
          {feats.map((f, i) => (
            <div key={i} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: f.c + "1c", color: f.c }}>
                <Icon name={f.icon} size={21} />
              </div>
              <h3 style={{ fontSize: 17.5 }}>{f.t}</h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-3)" }}>{f.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* AI showcase band */}
      <div style={{ background: "var(--green)", color: "#e6f1f4", marginTop: 28 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "60px 28px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
          <div>
            <div className="chip" style={{ background: "rgba(255,255,255,.12)", color: "var(--gold-200)", border: "none", marginBottom: 18 }}>
              <Icon name="sparkle" size={13} /> Responsible AI, clearly labelled
            </div>
            <h2 style={{ color: "#fff", fontSize: 38, lineHeight: 1.08 }}>One model we trained.<br />Everything else, AI.</h2>
            <p style={{ fontSize: 16, lineHeight: 1.55, color: "#b6d3da", marginTop: 16, maxWidth: 440 }}>
              The species classifier is our own CNN (MobileNetV3 vs EfficientNet-B0, winner exported to ONNX). Injury flags, edge-case species, spam judgment, and hotspot summaries all run through our AI services - every output marked “AI estimate” and always correctable.
            </p>
            <div className="row" style={{ gap: 10, marginTop: 24, flexWrap: "wrap" }}>
              {["Species CNN","Injury · AI","Anti-spam · AI","Hotspot insights"].map((t,i)=>(
                <span key={i} className="chip" style={{ background: "rgba(255,255,255,.1)", color: "#e6f1f4", border: "1px solid rgba(255,255,255,.18)", fontFamily: "var(--ff-mono)", fontSize: 12 }}>{t}</span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <SpeciesAIPanel report={REPORTS[0]} />
            <InjuryAIPanel report={REPORTS[0]} />
          </div>
        </div>
      </div>

      {/* how it works */}
      <div style={{ maxWidth: 1180, margin: "0 auto", padding: "60px 28px" }}>
        <h2 style={{ fontSize: 32, textAlign: "center" }}>From a sighting to a saved animal</h2>
        <div className="grid-4" style={{ marginTop: 36 }}>
          {[
            { n: "01", t: "Spot & snap", d: "See an animal in need? Open SafeTails and take a photo." },
            { n: "02", t: "AI labels it", d: "Species and a possible-injury flag appear instantly - you confirm or correct." },
            { n: "03", t: "It hits the map", d: "Your report joins the live map with a generalised location and status." },
            { n: "04", t: "Community acts", d: "Neighbours confirm, comment, and help - you watch the status change." },
          ].map((s, i) => (
            <div key={i} style={{ position: "relative" }}>
              <div style={{ fontFamily: "var(--ff-mono)", fontSize: 13, color: "var(--gold-600)", fontWeight: 700 }}>{s.n}</div>
              <h3 style={{ fontSize: 18, marginTop: 8 }}>{s.t}</h3>
              <p style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--ink-3)", marginTop: 6 }}>{s.d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={{ maxWidth: 1180, margin: "0 auto 64px", padding: "0 28px" }}>
        <div className="card" style={{ padding: 48, textAlign: "center", background: "linear-gradient(135deg, var(--gold-50), var(--card))", borderColor: "var(--gold-200)" }}>
          <h2 style={{ fontSize: 34 }}>Every tail deserves to be safe.</h2>
          <p style={{ fontSize: 16, color: "var(--ink-2)", marginTop: 12 }}>Join the reporters keeping watch over Kathmandu's animals.</p>
          <button className="btn btn-primary btn-lg" style={{ marginTop: 22 }} onClick={() => go("register")}><Icon name="paw" size={18} /> Create your free account</button>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--line)", padding: "26px 28px", textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>
        SafeTails · A gamified AI-supported geo-spatial reporting framework · Shreeya Paudel · ST6000CEM
      </div>
    </div>
  );
}

// Google Sign-In: renders the official Google button when the server is configured
// (GET /auth/google/available). Otherwise falls back to a clear "not configured" note, so the
// UI never shows a broken control. Activates automatically once GOOGLE_CLIENT_ID is set.
function GoogleButton({ go }: any) {
  const { googleLogin } = useStore();
  const holder = useRef<any>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.googleAvailable().then((r: any) => {
      if (!cancelled && r?.available && r?.client_id) setClientId(r.client_id);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!clientId) return;
    const onCredential = async (resp: any) => {
      try { await googleLogin(resp.credential); toast.success("Signed in with Google"); go("map"); }
      catch (e: any) { toast.error(e?.message || "Google sign-in failed"); }
    };
    const init = () => {
      const g = (window as any).google;
      if (!g?.accounts?.id || !holder.current) return;
      g.accounts.id.initialize({ client_id: clientId, callback: onCredential });
      holder.current.innerHTML = "";
      g.accounts.id.renderButton(holder.current, { theme: "outline", size: "large", width: 340, text: "continue_with" });
      setReady(true);
    };
    if ((window as any).google?.accounts?.id) { init(); return; }
    const existing = document.getElementById("gsi-script");
    if (existing) { existing.addEventListener("load", init); return () => existing.removeEventListener("load", init); }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true; s.id = "gsi-script";
    s.onload = init;
    document.body.appendChild(s);
  }, [clientId]);

  if (!clientId) {
    return (
      <button className="btn btn-ghost" style={{ width: "100%" }}
        onClick={() => toast("Google Sign-In isn't configured yet - add GOOGLE_CLIENT_ID to enable it. Use email + password for now.")}>
        <Icon name="globe" size={17} /> Continue with Google
      </button>
    );
  }
  return <div ref={holder} style={{ display: "flex", justifyContent: "center", minHeight: 44 }} aria-label="Sign in with Google" />;
}

// Shared centered card layout for the password-reset screens.
function AuthCard({ title, subtitle, children, go }: any) {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--paper)", padding: 24 }}>
      <div className="card card-pad fade-in" style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ cursor: "pointer", marginBottom: 18 }} onClick={() => go("login")}><Logo size={26} /></div>
        <h2 style={{ fontSize: 23 }}>{title}</h2>
        {subtitle && <p className="muted" style={{ fontSize: 14, marginTop: 6, marginBottom: 22 }}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

// Dev-mode helper: when SMTP isn't configured the API returns the code/link so it's testable.
function DevReset({ dev }: any) {
  if (!dev) return null;
  return (
    <div style={{ marginTop: 14, padding: "10px 12px", background: "var(--gold-50)", border: "1px solid var(--gold-200)", borderRadius: 10 }}>
      <div className="row" style={{ gap: 6, marginBottom: 4 }}><Icon name="info" size={13} style={{ color: "var(--gold-600)" }} /><b style={{ fontSize: 12.5, color: "var(--gold-600)" }}>Dev mode (email not configured)</b></div>
      <div style={{ fontSize: 12.5 }}>Code: <b className="mono">{dev.otp}</b></div>
      <div style={{ fontSize: 12, marginTop: 2, wordBreak: "break-all" }}>Link: <a href={dev.link} style={{ color: "var(--green)" }}>{dev.link}</a></div>
    </div>
  );
}

export function ForgotPassword({ go }: any) {
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState<"otp" | "link">("otp");
  const [stage, setStage] = useState<"request" | "otp" | "sent">("request");
  const [otp, setOtp] = useState("");
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [dev, setDev] = useState<any>(null);

  const requestReset = async () => {
    if (!email.trim()) { toast.error("Enter your email address."); return; }
    setBusy(true);
    try {
      const res = await api.forgotPassword(email.trim(), method);
      setDev(res.dev || null);
      if (method === "otp") { setStage("otp"); if (res.dev?.otp) setOtp(res.dev.otp); }
      else setStage("sent");
    } catch (e: any) { toast.error(e?.message || "Couldn't start password reset."); }
    finally { setBusy(false); }
  };
  const doReset = async () => {
    if (newPw.length < 8) { toast.error("New password must be at least 8 characters."); return; }
    setBusy(true);
    try {
      await api.resetPassword({ email: email.trim(), otp: otp.trim(), new_password: newPw });
      toast.success("Password reset. Please log in with your new password.");
      go("login");
    } catch (e: any) { toast.error(e?.message || "Couldn't reset password."); }
    finally { setBusy(false); }
  };

  if (stage === "sent") {
    return (
      <AuthCard go={go} title="Check your email" subtitle={`If an account exists for ${email}, we've sent a reset link. It expires in 15 minutes.`}>
        <DevReset dev={dev} />
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 18 }} onClick={() => go("login")}>Back to log in</button>
        <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 8 }} onClick={() => setStage("request")}>Use a code instead</button>
      </AuthCard>
    );
  }
  if (stage === "otp") {
    return (
      <AuthCard go={go} title="Enter your code" subtitle={`We sent a 6-digit code to ${email}. Enter it below with your new password.`}>
        <div className="field"><label>6-digit code</label>
          <input className="input mono" style={{ letterSpacing: 4, fontSize: 18 }} maxLength={6} placeholder="000000" value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} /></div>
        <div className="field"><label>New password</label>
          <input className="input" type="password" placeholder="At least 8 characters" value={newPw} onChange={e => setNewPw(e.target.value)} onKeyDown={e => e.key === "Enter" && doReset()} /></div>
        <DevReset dev={dev} />
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 14 }} onClick={doReset} disabled={busy}>{busy ? "Resetting..." : "Reset password"}</button>
        <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 8 }} onClick={requestReset} disabled={busy}>Resend code</button>
      </AuthCard>
    );
  }
  return (
    <AuthCard go={go} title="Forgot your password?" subtitle="Enter your email and we'll send a reset link and a one-time code.">
      <div className="field"><label>Email</label>
        <input className="input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === "Enter" && requestReset()} /></div>
      <div className="field"><label>How would you like to reset?</label>
        <div className="seg">
          {[["otp", "Enter a code"], ["link", "Email me a link"]].map(o => <button key={o[0]} className={method === o[0] ? "on" : ""} onClick={() => setMethod(o[0] as any)}>{o[1]}</button>)}
        </div>
      </div>
      <button className="btn btn-primary" style={{ width: "100%", marginTop: 10 }} onClick={requestReset} disabled={busy}>{busy ? "Sending..." : (method === "otp" ? "Send code" : "Send reset link")}</button>
      <p style={{ textAlign: "center", fontSize: 13.5, color: "var(--ink-3)", marginTop: 18 }}>
        Remembered it? <a style={{ color: "var(--green)", fontWeight: 700, cursor: "pointer" }} onClick={() => go("login")}>Back to log in</a>
      </p>
    </AuthCard>
  );
}

export function ResetPassword({ go }: any) {
  const [token, setToken] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try { setToken(new URLSearchParams(window.location.search).get("token") || ""); } catch { /* ignore */ }
  }, []);
  const doReset = async () => {
    if (!token) { toast.error("This reset link is invalid or incomplete."); return; }
    if (newPw.length < 8) { toast.error("Password must be at least 8 characters."); return; }
    if (newPw !== confirm) { toast.error("Passwords don't match."); return; }
    setBusy(true);
    try {
      await api.resetPassword({ token, new_password: newPw });
      toast.success("Password reset. Please log in.");
      go("login");
    } catch (e: any) { toast.error(e?.message || "Couldn't reset password. The link may have expired."); }
    finally { setBusy(false); }
  };
  return (
    <AuthCard go={go} title="Set a new password" subtitle={token ? "Choose a new password for your account." : "This reset link is missing its token. Request a new one from the login page."}>
      <div className="field"><label>New password</label>
        <input className="input" type="password" placeholder="At least 8 characters" value={newPw} onChange={e => setNewPw(e.target.value)} disabled={!token} /></div>
      <div className="field"><label>Confirm password</label>
        <input className="input" type="password" placeholder="Re-enter password" value={confirm} onChange={e => setConfirm(e.target.value)} onKeyDown={e => e.key === "Enter" && doReset()} disabled={!token} /></div>
      <button className="btn btn-primary" style={{ width: "100%", marginTop: 10 }} onClick={doReset} disabled={busy || !token}>{busy ? "Resetting..." : "Reset password"}</button>
      {!token && <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginTop: 8 }} onClick={() => go("forgot-password")}>Request a new link</button>}
    </AuthCard>
  );
}

export function AuthScreen({ mode, go }: any) {
  const isReg = mode === "register";
  const { login, register } = useStore();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ward, setWard] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || !password) { toast.error("Email and password are required"); return; }
    setBusy(true);
    try {
      if (isReg) {
        const base = (email.split("@")[0] || "").replace(/[^a-zA-Z0-9_]/g, "");
        const uname = (base || "user") + Math.floor(Math.random() * 9000 + 1000);
        await register(email.trim(), uname, password, name.trim() || undefined);
        toast.success("Welcome to SafeTails!");
      } else {
        await login(email.trim(), password);
        toast.success("Welcome back!");
      }
      go("map");
    } catch (e: any) {
      toast.error(e?.message || (isReg ? "Registration failed" : "Login failed"));
    } finally {
      setBusy(false);
    }
  };
  const onKey = (e: any) => { if (e.key === "Enter") submit(); };

  return (
    <div style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1.05fr 1fr" }}>
      {/* left brand panel */}
      <div style={{ background: "var(--green)", color: "#e6f1f4", padding: "48px 56px", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
        <div style={{ cursor: "pointer" }} onClick={() => go("landing")}><Logo light size={30} /></div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", maxWidth: 420 }}>
          <h1 style={{ color: "#fff", fontSize: 40, lineHeight: 1.08 }}>{isReg ? "Become a guardian of Kathmandu's streets." : "Welcome back, guardian."}</h1>
          <p style={{ fontSize: 16, color: "#b6d3da", marginTop: 16, lineHeight: 1.55 }}>
            {isReg ? "Report sightings, earn reputation, and help the community respond faster to animals in need." : "Pick up where you left off - your reports, badges, and ward are waiting."}
          </p>
          <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 14 }}>
            {[["paw","Report with one photo"],["shield","Privacy-first: generalised location only"],["trophy","Earn badges and climb the leaderboard"]].map((r,i)=>(
              <div key={i} className="row" style={{ gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,.12)", display: "grid", placeItems: "center", color: "var(--gold)" }}><Icon name={r[0]} size={17} /></div>
                <span style={{ fontWeight: 600, fontSize: 14.5 }}>{r[1]}</span>
              </div>
            ))}
          </div>
        </div>
        <svg viewBox="0 0 200 200" style={{ position: "absolute", right: -40, bottom: -50, width: 280, opacity: 0.12, color: "#fff" }}><g fill="currentColor"><Icon name="paw" size={200} /></g></svg>
      </div>

      {/* right form */}
      <div style={{ display: "grid", placeItems: "center", padding: 40, background: "var(--paper)" }}>
        <div style={{ width: "100%", maxWidth: 380 }} className="fade-in">
          <h2 style={{ fontSize: 26 }}>{isReg ? "Create your account" : "Log in to SafeTails"}</h2>
          <p className="muted" style={{ fontSize: 14, marginTop: 6, marginBottom: 26 }}>
            {isReg ? "Free forever. Takes under a minute." : "Enter your details to continue."}
          </p>

          {isReg && (
            <div className="field">
              <label>Full name</label>
              <input className="input" placeholder="e.g. Shreeya Paudel" value={name} onChange={e => setName(e.target.value)} onKeyDown={onKey} />
            </div>
          )}
          <div className="field">
            <label>Email</label>
            <input className="input" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={onKey} />
          </div>
          <div className="field">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <label>Password</label>
              {!isReg && <a onClick={() => go("forgot-password")} style={{ fontSize: 12.5, color: "var(--green)", fontWeight: 600, cursor: "pointer" }}>Forgot password?</a>}
            </div>
            <input className="input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={onKey} />
          </div>
          {isReg && (
            <div className="field">
              <label>Your ward</label>
              <select className="input" value={ward} onChange={e => setWard(e.target.value)}>
                <option value="">Select your area…</option>
                {WARDS.map(w => <option key={w.id}>{w.name}</option>)}
              </select>
            </div>
          )}

          <button className="btn btn-primary" style={{ width: "100%", marginTop: 8 }} onClick={submit} disabled={busy}>
            {busy ? "Please wait…" : (isReg ? "Create account" : "Log in")} <Icon name="arrowRight" size={17} />
          </button>

          <div className="row" style={{ gap: 12, margin: "20px 0" }}>
            <div className="divider" style={{ flex: 1 }}></div>
            <span style={{ fontSize: 12, color: "var(--ink-4)" }}>or</span>
            <div className="divider" style={{ flex: 1 }}></div>
          </div>
          <GoogleButton go={go} />

          <p style={{ textAlign: "center", fontSize: 13.5, color: "var(--ink-3)", marginTop: 22 }}>
            {isReg ? "Already have an account? " : "New to SafeTails? "}
            <a style={{ color: "var(--green)", fontWeight: 700, cursor: "pointer" }} onClick={() => go(isReg ? "login" : "register")}>{isReg ? "Log in" : "Create one"}</a>
          </p>
        </div>
      </div>
    </div>
  );
}
