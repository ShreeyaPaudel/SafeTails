"use client";
/**
 * SafeTails - catch-all route so every URL (/, /map, /rescue, /report/:id, /user/:id, …)
 * renders the same client SPA. The SPA reads window.location to pick the initial screen and
 * drives navigation with the History API, giving real URLs, deep links, and back-button support.
 * The design is client-rendered (Leaflet/`window`), so it's loaded with ssr:false.
 */
import dynamic from "next/dynamic";

const App = dynamic(() => import("@/safetails/App"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#eef3f5",
        fontFamily: "system-ui, sans-serif",
        color: "#66808b",
      }}
    >
      Loading SafeTails…
    </div>
  ),
});

export default function Page() {
  return <App />;
}
