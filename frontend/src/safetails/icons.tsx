// @ts-nocheck - verbatim port of the SafeTails design reference (authored without strict typing)
/* ============================================================
   SafeTails - Icon set (stroke, currentColor)
   ============================================================ */
const ICON_PATHS: any = {
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
  feed: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
  trophy: '<path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M9 14v3M15 14v3M8 21h8M9 21v-2h6v2"/>',
  gift: '<path d="M4 11h16v9H4v-9Z"/><path d="M2 7h20v4H2zM12 7v13"/><path d="M12 7S10.5 3 8.5 3 6 5.5 12 7Zm0 0s1.5-4 3.5-4S18 5.5 12 7Z"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 14v4M12 9v9M17 5v13"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  paw: '<ellipse cx="12" cy="15" rx="4.5" ry="3.6"/><ellipse cx="6.5" cy="11.5" rx="1.7" ry="2.3"/><ellipse cx="17.5" cy="11.5" rx="1.7" ry="2.3"/><ellipse cx="9.5" cy="7.5" rx="1.6" ry="2.2"/><ellipse cx="14.5" cy="7.5" rx="1.6" ry="2.2"/>',
  sparkle: '<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3Z"/><path d="M19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z"/>',
  shield: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 1 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"/>',
  comment: '<path d="M21 12a8 8 0 0 1-11.5 7.2L3 21l1.8-6.5A8 8 0 1 1 21 12Z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5"/>',
  pin: '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  camera: '<path d="M3 8h4l2-2.5h6L17 8h4v12H3V8Z"/><circle cx="12" cy="13.5" r="3.5"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  checkSmall: '<path d="m5 12 4 4 10-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevDown: '<path d="m6 9 6 6 6-6"/>',
  chevUp: '<path d="m6 15 6-6 6 6"/>',
  chevRight: '<path d="m9 6 6 6-6 6"/>',
  chevLeft: '<path d="m15 6-6 6 6 6"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z"/>',
  flame: '<path d="M12 3c1 3 4 4 4 8a4 4 0 0 1-8 0c0-1.6.6-2.5 1.2-3.3C10 9 11 7 12 3Z"/><path d="M12 21a5 5 0 0 0 5-5c0-3-2-4-2-6"/>',
  heat: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/>',
  alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  star: '<path d="m12 3 2.6 6 6.4.5-4.9 4.2 1.6 6.3L12 16.8 6.3 20l1.6-6.3L3 9.5 9.4 9 12 3Z"/>',
  stack: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  cross: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  logout: '<path d="M9 21H4V3h5M16 16l4-4-4-4M20 12H9"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m14 6 4 4"/>',
  upload: '<path d="M12 16V4m0 0L8 8m4-4 4 4M4 16v4h16v-4"/>',
  location: '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  award: '<circle cx="12" cy="9" r="5"/><path d="m9 13-2 8 5-3 5 3-2-8"/>',
  thumb: '<path d="M7 11v9H4v-9h3Zm0 0 4-7c1.5 0 2 1 2 2l-.8 4H19a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7"/>',
  zap: '<path d="M13 2 4 14h7l-2 8 9-12h-7l2-8Z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  dots: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  building: '<path d="M4 21V5l8-2v18M12 21V8l8 3v10M4 21h16"/><path d="M8 8h.01M8 12h.01M16 12h.01M16 16h.01"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  scale: '<path d="M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0L5 7Zm14 0-3 7a3 3 0 0 0 6 0l-3-7ZM7 21h10"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5"/>',
};

export function Icon({ name, size, style, className }: any) {
  const p = ICON_PATHS[name] || '';
  const s = size || 20;
  const filled = ['paw','sparkle','heart','star','flame','pin','location','heat','award','thumb','zap','trophy'];
  const isFill = filled.includes(name);
  return (
    <svg
      width={s} height={s} viewBox="0 0 24 24"
      fill={isFill ? "currentColor" : "none"}
      stroke={isFill ? "none" : "currentColor"}
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style}
      dangerouslySetInnerHTML={{ __html: p }}
    />
  );
}

// Logo mark - "PawPin": a map pin whose inner circle is a paw print
export function PawPin({ size, pinColor, pawColor }: any) {
  const s = size || 30;
  return (
    <svg width={s} height={s * 1.24} viewBox="0 0 30 37" fill="none">
      <path d="M15 1C7.8 1 2 6.6 2 13.6 2 23 15 36 15 36s13-13 13-22.4C28 6.6 22.2 1 15 1Z"
        fill={pinColor || "var(--green)"} stroke="rgba(0,0,0,.12)" strokeWidth="1"/>
      <circle cx="15" cy="13.4" r="9" fill="#fff" fillOpacity="0.16"/>
      <g fill={pawColor || "var(--gold)"} transform="translate(15 14) scale(0.42)">
        <ellipse cx="0" cy="4" rx="6.4" ry="5"/>
        <ellipse cx="-8" cy="-1.5" rx="2.5" ry="3.3"/>
        <ellipse cx="8" cy="-1.5" rx="2.5" ry="3.3"/>
        <ellipse cx="-3.4" cy="-7.5" rx="2.3" ry="3.1"/>
        <ellipse cx="3.4" cy="-7.5" rx="2.3" ry="3.1"/>
      </g>
    </svg>
  );
}

export { ICON_PATHS };
