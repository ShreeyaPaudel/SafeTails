// @ts-nocheck
/* SafeTails - downloadable contribution certificate + badge (PNG), built client-side from SVG. */
import { ICON_PATHS } from "./icons";

function paw(x: number, y: number, s: number, fill: string) {
  return `<g transform="translate(${x} ${y}) scale(${s})" fill="${fill}">
    <ellipse cx="0" cy="4" rx="6.4" ry="5"/>
    <ellipse cx="-8" cy="-1.5" rx="2.5" ry="3.3"/>
    <ellipse cx="8" cy="-1.5" rx="2.5" ry="3.3"/>
    <ellipse cx="-3.4" cy="-7.5" rx="2.3" ry="3.1"/>
    <ellipse cx="3.4" cy="-7.5" rx="2.3" ry="3.1"/>
  </g>`;
}

function esc(s: string) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A gold wax-style seal emblem with a paw and ring text. */
function seal(cx: number, cy: number, teal: string, gold: string): string {
  return `<g transform="translate(${cx} ${cy})">
    <circle r="52" fill="${gold}"/>
    <circle r="52" fill="none" stroke="#d9a72e" stroke-width="2"/>
    <circle r="42" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.7"/>
    ${paw(0, 2, 1.15, teal)}
    <g fill="${teal}" font-family="Arial, sans-serif" font-size="7.5" font-weight="700" letter-spacing="1.5">
      <path id="sealtop" d="M -34 0 A 34 34 0 0 1 34 0" fill="none"/>
      <path id="sealbot" d="M 34 4 A 34 34 0 0 1 -34 4" fill="none"/>
      <text text-anchor="middle"><textPath href="#sealtop" startOffset="50%">SAFETAILS</textPath></text>
      <text text-anchor="middle"><textPath href="#sealbot" startOffset="50%">KATHMANDU VALLEY</textPath></text>
    </g>
    <!-- ribbon tails -->
    <path d="M -14 46 l -6 40 14 -9 14 9 -6 -40Z" fill="#d9a72e"/>
  </g>`;
}

export function buildCertificateSVG(person: any): string {
  const W = 1000, H = 720;
  const teal = "#157d8f", tealDk = "#0e5a67", gold = "#e0a92e", ink = "#112a32", ink3 = "#5b7480", cream = "#fcfaf4";
  const name = esc(person.name || "Guardian");
  const title = esc(person.levelName || "Reporter");
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const num = (v: any) => Number(v ?? 0).toLocaleString();
  const stat = (x: number, label: string, value: string) => `
    <g transform="translate(${x} 416)">
      <rect x="-86" y="0" width="172" height="88" rx="13" fill="#ffffff" stroke="#e6ded0"/>
      <rect x="-86" y="0" width="172" height="4" rx="2" fill="${gold}"/>
      <text x="0" y="47" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="31" font-weight="700" fill="${teal}">${esc(value)}</text>
      <text x="0" y="70" text-anchor="middle" font-family="Arial, sans-serif" font-size="10.5" fill="${ink3}" letter-spacing="1.8">${esc(label)}</text>
    </g>`;
  // The strip below the tiles records the standing that cannot be read off a count alone:
  // trustworthiness, the badges earned for it, and the position it places the holder in.
  const chips: [string, string][] = [["REPUTATION", num(person.reputation)]];
  if (person.badges?.length) chips.push(["BADGES EARNED", num(person.badges.length)]);
  if (person.streak > 0) chips.push(["DAY STREAK", num(person.streak)]);
  if (person.rank) chips.push(["VALLEY RANK", "#" + num(person.rank)]);
  if (person.helped > 0) chips.push(["PEOPLE HELPED", num(person.helped)]);
  const SX = 62, SW = 876;
  const strip = `
    <g transform="translate(0 508)">
      <rect x="${SX}" y="0" width="${SW}" height="42" rx="21" fill="#f4f9fa" stroke="#d7e7ea"/>
      ${chips.map(([l, v], i) => {
        const cx = SX + (SW * (i + 0.5)) / chips.length;
        const div = i === 0 ? "" : `<line x1="${SX + (SW * i) / chips.length}" y1="10" x2="${SX + (SW * i) / chips.length}" y2="32" stroke="#cfe2e6" stroke-width="1"/>`;
        return `${div}<text x="${cx}" y="27" text-anchor="middle" font-family="Arial, sans-serif" font-size="12.5" fill="${ink3}" letter-spacing="0.8">${esc(l)} <tspan font-weight="700" font-size="14.5" fill="${teal}">${esc(v)}</tspan></text>`;
      }).join("")}
    </g>`;
  // A stable reference so a printed certificate can be checked back against the account.
  const serial = "ST-" + String(person.id || "guest").replace(/-/g, "").slice(0, 6).toUpperCase();
  // small corner flourish (quarter frame)
  const flourish = (x: number, y: number, sx: number, sy: number) => `
    <g transform="translate(${x} ${y}) scale(${sx} ${sy})" fill="none" stroke="${gold}" stroke-width="2.2" stroke-linecap="round">
      <path d="M 0 46 L 0 14 Q 0 0 14 0 L 46 0"/>
      <circle cx="0" cy="0" r="3" fill="${gold}" stroke="none"/>
    </g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${cream}"/>
    <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="10" fill="#ffffff"/>
    <rect x="18" y="18" width="${W - 36}" height="${H - 36}" rx="10" fill="none" stroke="${teal}" stroke-width="2.5"/>
    <rect x="30" y="30" width="${W - 60}" height="${H - 60}" rx="6" fill="none" stroke="${gold}" stroke-width="1.2" stroke-dasharray="1 6" stroke-linecap="round"/>
    <!-- corner flourishes -->
    ${flourish(46, 46, 1, 1)}${flourish(W - 46, 46, -1, 1)}
    ${flourish(46, H - 46, 1, -1)}${flourish(W - 46, H - 46, -1, -1)}
    <!-- header: pawpin + wordmark centered -->
    <g transform="translate(${W / 2} 92)" text-anchor="middle">
      <svg x="-104" y="-30" width="34" height="42" viewBox="0 0 30 37">
        <path d="M15 1C7.8 1 2 6.6 2 13.6 2 23 15 36 15 36s13-13 13-22.4C28 6.6 22.2 1 15 1Z" fill="${teal}"/>
        ${paw(15, 14, 0.42, gold)}
      </svg>
      <text x="18" y="8" font-family="Georgia, 'Times New Roman', serif" font-size="30" font-weight="800" fill="${ink}" text-anchor="middle">Safe<tspan fill="${teal}">Tails</tspan></text>
    </g>
    <text x="${W / 2}" y="176" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="30" letter-spacing="7" fill="${tealDk}" font-weight="700">CERTIFICATE</text>
    <text x="${W / 2}" y="204" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" letter-spacing="6" fill="${ink3}">OF CONTRIBUTION</text>
    <g stroke="${gold}" stroke-width="2"><line x1="${W / 2 - 130}" y1="222" x2="${W / 2 - 26}" y2="222"/><line x1="${W / 2 + 26}" y1="222" x2="${W / 2 + 130}" y2="222"/></g>
    <circle cx="${W / 2}" cy="222" r="3.5" fill="${gold}"/>
    <text x="${W / 2}" y="264" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="${ink3}">This certificate is proudly presented to</text>
    <text x="${W / 2}" y="324" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="54" font-weight="700" fill="${ink}">${name}</text>
    <text x="${W / 2}" y="360" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="${teal}" font-weight="700" letter-spacing="1.5">${title.toUpperCase()}</text>
    <text x="${W / 2}" y="398" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-size="16" fill="${ink3}">for outstanding service protecting the street animals of the Kathmandu Valley</text>
    ${stat(W / 2 - 364, "REPORTS", num(person.reports))}
    ${stat(W / 2 - 182, "VERIFIED", num(person.published))}
    ${stat(W / 2, "RESOLVED", num(person.resolved))}
    ${stat(W / 2 + 182, "AREAS", num(person.areas))}
    ${stat(W / 2 + 364, "POINTS", num(person.points))}
    ${strip}
    ${seal(160, 618, teal, gold)}
    <text x="436" y="674" text-anchor="middle" font-family="Arial, sans-serif" font-size="10.5" fill="${ink3}" letter-spacing="1.2">Certificate No. ${esc(serial)}</text>
    <g transform="translate(${W - 340} 636)">
      <text x="140" y="0" text-anchor="middle" font-family="'Segoe Script','Brush Script MT',cursive" font-size="28" fill="${teal}">SafeTails</text>
      <line x1="0" y1="16" x2="280" y2="16" stroke="${ink3}" stroke-width="1"/>
      <text x="140" y="38" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="${ink3}" letter-spacing="0.5">Authorised by SafeTails · Kathmandu Valley</text>
      <text x="140" y="58" text-anchor="middle" font-family="Arial, sans-serif" font-size="11.5" fill="${ink3}">Issued ${esc(date)}</text>
    </g>
  </svg>`;
}

/** Render an SVG string to a PNG download at `scale`x. Shared by certificate + badge. */
function svgToPng(svg: string, W: number, H: number, filename: string, scale = 2) {
  const img = new Image();
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = W * scale; canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, W, H);
    URL.revokeObjectURL(url);
    canvas.toBlob((b: any) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  };
  img.onerror = () => URL.revokeObjectURL(url);
  img.src = url;
}

export function downloadCertificate(person: any) {
  svgToPng(
    buildCertificateSVG(person), 1000, 720,
    `SafeTails-certificate-${(person.name || "guardian").replace(/\s+/g, "-")}.png`,
  );
}

/** A single earned badge as a shareable medallion card. `badge` = {code,name,description,icon,color,date}. */
export function buildBadgeSVG(badge: any, person: any): string {
  const W = 620, H = 780;
  const teal = "#157d8f", gold = "#f6c84d", ink = "#112a32", ink3 = "#66808b";
  const color = badge.color || teal;
  const iconPath = ICON_PATHS[badge.icon] || ICON_PATHS.star;
  const name = esc(badge.name || "Badge");
  const desc = esc(badge.description || "");
  const who = esc(person?.name || "Guardian");
  const date = badge.date
    ? new Date(badge.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <rect x="14" y="14" width="${W - 28}" height="${H - 28}" rx="24" fill="#ffffff" stroke="${teal}" stroke-width="3"/>
    <rect x="26" y="26" width="${W - 52}" height="${H - 52}" rx="18" fill="none" stroke="${gold}" stroke-width="2"/>
    ${paw(64, 74, 1.4, "#e7eef0")}${paw(W - 64, 74, 1.4, "#e7eef0")}
    ${paw(64, H - 64, 1.4, "#e7eef0")}${paw(W - 64, H - 64, 1.4, "#e7eef0")}
    <g transform="translate(${W / 2 - 92} 66)">
      <svg width="34" height="42" viewBox="0 0 30 37"><path d="M15 1C7.8 1 2 6.6 2 13.6 2 23 15 36 15 36s13-13 13-22.4C28 6.6 22.2 1 15 1Z" fill="${teal}"/>${paw(15, 14, 0.42, gold)}</svg>
      <text x="44" y="30" font-family="Georgia, serif" font-size="27" font-weight="800" fill="${ink}">Safe<tspan fill="${teal}">Tails</tspan></text>
    </g>
    <text x="${W / 2}" y="168" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" letter-spacing="4" fill="${ink3}">ACHIEVEMENT BADGE</text>
    <!-- medallion -->
    <circle cx="${W / 2}" cy="330" r="118" fill="${color}" opacity="0.12"/>
    <circle cx="${W / 2}" cy="330" r="96" fill="${color}"/>
    <circle cx="${W / 2}" cy="330" r="96" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.5"/>
    <g transform="translate(${W / 2 - 34} ${330 - 34}) scale(2.8)" fill="none" stroke="#ffffff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${iconPath}</g>
    <!-- ribbon -->
    <path d="M${W / 2 - 34} 412 l-14 60 30 -18 30 18 -14 -60Z" fill="${gold}"/>
    <text x="${W / 2}" y="560" text-anchor="middle" font-family="Georgia, serif" font-size="40" font-weight="700" fill="${ink}">${name}</text>
    <text x="${W / 2}" y="600" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="${ink3}">${desc}</text>
    <line x1="${W / 2 - 70}" y1="636" x2="${W / 2 + 70}" y2="636" stroke="${gold}" stroke-width="3"/>
    <text x="${W / 2}" y="678" text-anchor="middle" font-family="Arial, sans-serif" font-size="15" fill="${ink3}">Awarded to</text>
    <text x="${W / 2}" y="710" text-anchor="middle" font-family="Georgia, serif" font-size="28" font-weight="700" fill="${teal}">${who}</text>
    <text x="${W / 2}" y="742" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="${ink3}">${esc(date)}</text>
  </svg>`;
}

export function downloadBadge(badge: any, person: any) {
  svgToPng(
    buildBadgeSVG(badge, person), 620, 780,
    `SafeTails-badge-${(badge.name || "badge").replace(/\s+/g, "-")}.png`,
  );
}
