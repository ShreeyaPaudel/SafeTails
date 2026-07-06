/* leaflet.heat references a bare global `L` at evaluation time.
   This module exposes Leaflet on globalThis and MUST be imported
   *before* "leaflet.heat" so the plugin can attach L.heatLayer. */
import L from "leaflet";
(globalThis as any).L = L;
export default L;
